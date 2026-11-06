import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService, type Tx } from '../../prisma/prisma.service';

/** Tipos de tarefa processados pelo worker. */
export const TAREFAS = {
  ESTOQUE_MOVIMENTADO: 'estoque.movimentado',
  CRM_SINCRONIZAR_CLIENTES: 'crm.sincronizar_clientes',
  CRM_SINCRONIZAR_CLIENTE: 'crm.sincronizar_cliente',
  WEBHOOK_PROCESSAR_EVENTO: 'webhook.processar_evento',
  WEBHOOK_ENVIAR: 'webhook.enviar',
  INVENTARIO_DIVERGENCIA: 'inventario.divergencia',
  AJUSTE_SOLICITADO: 'ajuste.solicitado',
  NOTIFICACAO_EMAIL: 'notificacao.email',
} as const;
export type TipoTarefa = (typeof TAREFAS)[keyof typeof TAREFAS];

export interface OpcoesTarefa {
  /** Evita duplicar tarefas pendentes com a mesma chave (ex.: uma sincronização por vez). */
  chaveUnica?: string;
  atrasoMs?: number;
  maxTentativas?: number;
}

/**
 * Fila de processamento baseada em outbox transacional no PostgreSQL.
 * A tarefa é gravada na MESMA transação da operação de negócio: se a
 * movimentação for confirmada, o evento é garantido; se falhar, nada é enfileirado.
 */
@Injectable()
export class TarefasService {
  constructor(private readonly prisma: PrismaService) {}

  async enfileirar(
    tipo: TipoTarefa,
    payload: Record<string, unknown>,
    opcoes: OpcoesTarefa = {},
    tx?: Tx,
  ) {
    const cliente = tx ?? this.prisma;
    const quando = new Date(Date.now() + (opcoes.atrasoMs ?? 0));
    const json = JSON.stringify(payload);
    const max = opcoes.maxTentativas ?? 8;
    if (opcoes.chaveUnica) {
      // ON CONFLICT no índice único parcial: não aborta a transação em caso de duplicidade
      await cliente.$executeRaw`
        INSERT INTO tarefas (tipo, payload, max_tentativas, proxima_tentativa_em, chave_unica)
        VALUES (${tipo}, ${json}::jsonb, ${max}, ${quando}, ${opcoes.chaveUnica})
        ON CONFLICT (chave_unica) WHERE status IN ('PENDENTE', 'PROCESSANDO') AND chave_unica IS NOT NULL
        DO NOTHING`;
      return;
    }
    await cliente.tarefa.create({
      data: {
        tipo,
        payload: payload as Prisma.InputJsonValue,
        maxTentativas: max,
        proximaTentativaEm: quando,
      },
    });
  }

  async resumo() {
    const linhas = await this.prisma.tarefa.groupBy({ by: ['tipo', 'status'], _count: true });
    return linhas.map((l) => ({ tipo: l.tipo, status: l.status, total: l._count }));
  }

  async listarFalhas(limite = 50) {
    return this.prisma.tarefa.findMany({
      where: { status: 'FALHOU' },
      orderBy: { criadoEm: 'desc' },
      take: limite,
    });
  }

  /** Reenfileira uma tarefa que esgotou as tentativas. */
  async reprocessar(id: bigint) {
    return this.prisma.tarefa.updateMany({
      where: { id, status: 'FALHOU' },
      data: { status: 'PENDENTE', tentativas: 0, proximaTentativaEm: new Date(), ultimoErro: null },
    });
  }
}
