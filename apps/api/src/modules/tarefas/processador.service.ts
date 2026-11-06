import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import type { Tarefa } from '../../generated/prisma/client';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfiguracoesService } from '../configuracoes/configuracoes.service';
import { CrmSyncService } from '../integracao/crm-sync.service';
import { WebhookSaidaService } from '../integracao/webhook-saida.service';
import { WebhooksService } from '../integracao/webhooks.service';
import { AlertasService } from '../notificacoes/alertas.service';
import { EmailService } from '../notificacoes/email.service';
import { TAREFAS, TarefasService } from './tarefas.service';

/** Backoff exponencial: 10 s, 20 s, 40 s ... até 1 h. */
export function proximaTentativa(tentativas: number) {
  return new Date(Date.now() + Math.min(10_000 * 2 ** Math.max(0, tentativas - 1), 3_600_000));
}

/**
 * Worker da fila de processamento (outbox no PostgreSQL).
 * Vários workers podem rodar em paralelo: cada lote é reservado com
 * FOR UPDATE SKIP LOCKED, então nenhuma tarefa é processada duas vezes.
 */
@Injectable()
export class ProcessadorTarefasService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Worker');
  private ativo = false;
  private ciclo?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tarefas: TarefasService,
    private readonly alertas: AlertasService,
    private readonly email: EmailService,
    private readonly sync: CrmSyncService,
    private readonly webhooks: WebhooksService,
    private readonly webhookSaida: WebhookSaidaService,
    private readonly configuracoes: ConfiguracoesService,
  ) {}

  onApplicationBootstrap() {
    this.ativo = true;
    this.ciclo = this.laco();
    this.logger.log('Worker iniciado');
  }

  async onApplicationShutdown() {
    this.ativo = false;
    await this.ciclo;
  }

  private async laco() {
    while (this.ativo) {
      let processadas = 0;
      try {
        processadas = await this.processarLote();
      } catch (e) {
        this.logger.error(`Erro no ciclo do worker: ${(e as Error).message}`);
      }
      if (processadas === 0) await new Promise((r) => setTimeout(r, env.WORKER_INTERVALO_MS));
    }
  }

  /** Reserva e processa um lote. Retorna quantas tarefas foram processadas. */
  async processarLote(): Promise<number> {
    const lote = await this.prisma.$queryRaw<Tarefa[]>`
      UPDATE tarefas
         SET status = 'PROCESSANDO', travada_em = now(), tentativas = tentativas + 1
       WHERE id IN (
         SELECT id FROM tarefas
          WHERE status = 'PENDENTE' AND proxima_tentativa_em <= now()
          ORDER BY id
          LIMIT ${env.WORKER_LOTE}
          FOR UPDATE SKIP LOCKED)
      RETURNING id, tipo, payload, tentativas, max_tentativas AS "maxTentativas"`;

    for (const tarefa of lote) {
      try {
        await this.executar(tarefa);
        await this.prisma.tarefa.update({
          where: { id: tarefa.id },
          data: { status: 'CONCLUIDA', concluidaEm: new Date(), ultimoErro: null },
        });
      } catch (e) {
        const esgotou = tarefa.tentativas >= tarefa.maxTentativas;
        await this.prisma.tarefa.update({
          where: { id: tarefa.id },
          data: {
            status: esgotou ? 'FALHOU' : 'PENDENTE',
            proximaTentativaEm: proximaTentativa(tarefa.tentativas),
            ultimoErro: (e as Error).message.slice(0, 2000),
          },
        });
        this.logger.warn(
          `Tarefa ${tarefa.id} (${tarefa.tipo}) falhou [${tarefa.tentativas}/${tarefa.maxTentativas}]: ${(e as Error).message}`,
        );
      }
    }
    return lote.length;
  }

  /** Despacha a tarefa para o tratador do seu tipo. */
  async executar(tarefa: Pick<Tarefa, 'tipo' | 'payload'>) {
    const p = tarefa.payload as Record<string, string | number>;
    switch (tarefa.tipo) {
      case TAREFAS.ESTOQUE_MOVIMENTADO:
        await this.alertas.avaliarMovimentacao(String(p.movimentacaoId));
        await this.webhookSaida.enfileirarSaldos(String(p.movimentacaoId));
        return;
      case TAREFAS.INVENTARIO_DIVERGENCIA:
        return this.alertas.divergenciaInventario(String(p.inventarioId), Number(p.divergentes));
      case TAREFAS.AJUSTE_SOLICITADO:
        return this.alertas.ajusteSolicitado(String(p.ajusteId));
      case TAREFAS.NOTIFICACAO_EMAIL:
        return this.email.enviarNotificacao(String(p.notificacaoId));
      case TAREFAS.CRM_SINCRONIZAR_CLIENTES:
        await this.sync.sincronizarClientes('AGENDADO');
        return;
      case TAREFAS.CRM_SINCRONIZAR_CLIENTE:
        await this.sync.sincronizarCliente(String(p.crmId));
        return;
      case TAREFAS.WEBHOOK_PROCESSAR_EVENTO:
        return this.webhooks.processar(String(p.eventoRecebidoId));
      case TAREFAS.WEBHOOK_ENVIAR:
        return this.webhookSaida.enviar(p as unknown as { tipo: string; produtoId: string });
      default:
        throw new Error(`Tipo de tarefa desconhecido: ${tarefa.tipo}`);
    }
  }

  /** Agenda a sincronização periódica conforme o intervalo configurado na integração. */
  @Interval('agendar-sincronizacao', 60_000)
  async agendarSincronizacao() {
    const i = await this.sync.integracao().catch(() => null);
    if (!i?.ativo) return;
    const vencida =
      !i.ultimaSincronizacaoEm ||
      Date.now() - i.ultimaSincronizacaoEm.getTime() >= i.intervaloSyncMinutos * 60_000;
    if (vencida) {
      // Uma tentativa por ciclo: o próximo intervalo tenta de novo (falhas contam para o alerta)
      await this.tarefas.enfileirar(
        TAREFAS.CRM_SINCRONIZAR_CLIENTES,
        {},
        { chaveUnica: 'crm:sync-clientes', maxTentativas: 1 },
      );
    }
  }

  /** Recupera tarefas travadas por um worker que caiu durante o processamento. */
  @Interval('recuperar-travadas', 120_000)
  async recuperarTravadas() {
    const n = await this.prisma.tarefa.updateMany({
      where: { status: 'PROCESSANDO', travadaEm: { lt: new Date(Date.now() - 10 * 60_000) } },
      data: { status: 'PENDENTE', proximaTentativaEm: new Date() },
    });
    if (n.count) this.logger.warn(`${n.count} tarefa(s) travada(s) devolvida(s) à fila`);
  }

  /** Limpeza diária conforme a política de retenção (LGPD e desempenho). */
  @Cron('0 30 3 * * *', { name: 'limpeza-retencao', timeZone: 'America/Sao_Paulo' })
  async limpezaRetencao() {
    const cfg = (await this.configuracoes.obter()).retencao;
    const dia = 86_400_000;
    const [chaves, tarefas, logs] = await Promise.all([
      this.prisma.chaveIdempotencia.deleteMany({ where: { expiraEm: { lt: new Date() } } }),
      this.prisma.tarefa.deleteMany({
        where: { status: 'CONCLUIDA', concluidaEm: { lt: new Date(Date.now() - 30 * dia) } },
      }),
      this.prisma.integracaoLog.deleteMany({
        where: { criadoEm: { lt: new Date(Date.now() - cfg.logsIntegracaoDias * dia) } },
      }),
    ]);
    const auditoria = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('estoque.expurgo_auditoria', 'on', true)`;
      return tx.$executeRaw`DELETE FROM logs_auditoria WHERE criado_em < now() - make_interval(days => ${cfg.logsAuditoriaDias})`;
    });
    this.logger.log(
      `Retenção: ${chaves.count} chaves de idempotência, ${tarefas.count} tarefas, ${logs.count} logs de integração e ${auditoria} registros de auditoria removidos`,
    );
  }
}
