import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  integracaoPedidoSchema,
  webhookClienteAtualizadoSchema,
  webhookEventoSchema,
  webhookPedidoRefSchema,
} from '@estoque/shared';
import type { Prisma } from '../../generated/prisma/client';
import { CriptoService } from '../../common/cripto.service';
import { ErroDominio } from '../../common/erros';
import { PrismaService } from '../../prisma/prisma.service';
import { TAREFAS, TarefasService } from '../tarefas/tarefas.service';
import { CODIGO_CRM, CrmSyncService } from './crm-sync.service';
import { CLIENT_ID_WEBHOOKS } from './integracao.service';
import { PedidosIntegracaoService } from './pedidos-integracao.service';

/** Janela de tolerância do timestamp assinado (proteção contra replay). */
const TOLERANCIA_SEGUNDOS = 300;

export const CABECALHO_TIMESTAMP = 'x-estoque-timestamp';
export const CABECALHO_ASSINATURA = 'x-estoque-assinatura';

/** Assinatura: HMAC-SHA256(segredo, `${timestamp}.${corpoBruto}`) em hexadecimal, prefixada por "sha256=". */
export function assinar(segredo: string, timestamp: string, corpo: string) {
  return `sha256=${CriptoService.hmacSha256(segredo, `${timestamp}.${corpo}`)}`;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cripto: CriptoService,
    private readonly tarefas: TarefasService,
    private readonly sync: CrmSyncService,
    private readonly pedidos: PedidosIntegracaoService,
  ) {}

  /** Valida assinatura e timestamp, deduplica pela inbox e enfileira o processamento. */
  async receber(
    corpoBruto: Buffer | undefined,
    timestamp: string | undefined,
    assinatura: string | undefined,
  ) {
    const integracao = await this.sync.integracao();
    if (!integracao.ativo || !integracao.webhookEntradaSegredoCifrado) {
      throw new ErroDominio(
        HttpStatus.SERVICE_UNAVAILABLE,
        'WEBHOOK_DESATIVADO',
        'Recebimento de webhooks não configurado.',
      );
    }
    if (!corpoBruto || !timestamp || !assinatura) {
      throw new ErroDominio(
        HttpStatus.UNAUTHORIZED,
        'ASSINATURA_AUSENTE',
        'Cabeçalhos de assinatura ausentes.',
      );
    }
    const ts = Number(timestamp);
    if (!Number.isInteger(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCIA_SEGUNDOS) {
      throw new ErroDominio(
        HttpStatus.UNAUTHORIZED,
        'TIMESTAMP_INVALIDO',
        'Timestamp fora da janela permitida.',
      );
    }
    const segredo = this.cripto.decifrar(integracao.webhookEntradaSegredoCifrado);
    const esperada = assinar(segredo, timestamp, corpoBruto.toString('utf8'));
    if (!CriptoService.comparacaoSegura(esperada, assinatura)) {
      throw new ErroDominio(
        HttpStatus.UNAUTHORIZED,
        'ASSINATURA_INVALIDA',
        'Assinatura do webhook inválida.',
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(corpoBruto.toString('utf8'));
    } catch {
      throw new ErroDominio(
        HttpStatus.BAD_REQUEST,
        'JSON_INVALIDO',
        'Corpo do webhook não é JSON válido.',
      );
    }
    const evento = webhookEventoSchema.parse(json);

    const inseridos = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO integracao_eventos_recebidos (id, origem, evento_id, tipo, payload)
      VALUES (gen_random_uuid(), ${CODIGO_CRM}, ${evento.id}, ${evento.tipo}, ${JSON.stringify(evento)}::jsonb)
      ON CONFLICT (origem, evento_id) DO NOTHING
      RETURNING id`;
    if (!inseridos.length) return { recebido: true, duplicado: true, eventoId: evento.id };

    await this.tarefas.enfileirar(
      TAREFAS.WEBHOOK_PROCESSAR_EVENTO,
      { eventoRecebidoId: inseridos[0]!.id },
      { chaveUnica: `evento:${inseridos[0]!.id}` },
    );
    return { recebido: true, duplicado: false, eventoId: evento.id };
  }

  /** Processa um evento da inbox (executado pelo worker, com novas tentativas). */
  async processar(eventoRecebidoId: string) {
    const evento = await this.prisma.eventoRecebido.findUnique({ where: { id: eventoRecebidoId } });
    if (!evento || evento.status === 'PROCESSADO' || evento.status === 'IGNORADO') return;
    const { tipo, dados } = webhookEventoSchema.parse(evento.payload);
    const sistema = await this.prisma.clienteApi.findUnique({
      where: { clientId: CLIENT_ID_WEBHOOKS },
      select: { id: true },
    });
    const ator = { clienteApiId: sistema?.id ?? null, usuarioId: null };
    try {
      let resultado: Prisma.InputJsonValue = {};
      switch (tipo) {
        case 'cliente.atualizado': {
          const { clienteId } = webhookClienteAtualizadoSchema.parse(dados);
          const c = await this.sync.sincronizarCliente(clienteId);
          resultado = { clienteLocalId: c?.id ?? null };
          break;
        }
        case 'pedido.criado': {
          const pedido = integracaoPedidoSchema.parse(dados);
          const r = await this.pedidos.criar(pedido, ator, true);
          resultado = { pedidoId: r.pedido.id, jaExistia: r.jaExistia };
          break;
        }
        case 'pedido.confirmado': {
          const { idExterno } = webhookPedidoRefSchema.parse(dados);
          await this.pedidos.confirmar(idExterno, ator, true);
          break;
        }
        case 'pedido.cancelado': {
          const { idExterno, motivo } = webhookPedidoRefSchema.parse(dados);
          await this.pedidos.cancelar(idExterno, motivo ?? 'Cancelado no CRM', ator, true);
          break;
        }
      }
      await this.prisma.eventoRecebido.update({
        where: { id: eventoRecebidoId },
        data: {
          status: 'PROCESSADO',
          processadoEm: new Date(),
          tentativas: { increment: 1 },
          erro: null,
          payload: { ...(evento.payload as object), resultado },
        },
      });
    } catch (e) {
      const permanente = e instanceof ErroDominio && e.getStatus() < 500 && e.getStatus() !== 409;
      await this.prisma.eventoRecebido.update({
        where: { id: eventoRecebidoId },
        data: {
          status: 'ERRO',
          tentativas: { increment: 1 },
          erro: (e as Error).message.slice(0, 1000),
        },
      });
      this.logger.warn(`Evento ${evento.eventoId} (${tipo}) falhou: ${(e as Error).message}`);
      // Erros de regra de negócio não são retentados automaticamente (podem ser reprocessados pela tela)
      if (!permanente) throw e;
    }
  }
}
