import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { CriptoService } from '../../common/cripto.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TAREFAS, TarefasService } from '../tarefas/tarefas.service';
import { CrmSyncService } from './crm-sync.service';
import { assinar } from './webhooks.service';

/**
 * Webhooks enviados ao CRM (estoque.saldo_atualizado). Desativado por padrão:
 * o CRM Agrogest ainda não possui receptor; quando possuir, basta configurar a URL.
 */
@Injectable()
export class WebhookSaidaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cripto: CriptoService,
    private readonly sync: CrmSyncService,
    private readonly tarefas: TarefasService,
  ) {}

  /** Enfileira a notificação de saldo dos produtos de uma movimentação. */
  async enfileirarSaldos(movimentacaoId: string) {
    const integracao = await this.sync.integracao();
    if (!integracao.ativo || !integracao.webhookSaidaAtivo || !integracao.webhookSaidaUrl) return;
    const itens = await this.prisma.movimentacaoItem.findMany({
      where: { movimentacaoId },
      select: { produtoId: true },
      distinct: ['produtoId'],
    });
    for (const { produtoId } of itens) {
      await this.tarefas.enfileirar(TAREFAS.WEBHOOK_ENVIAR, {
        tipo: 'estoque.saldo_atualizado',
        produtoId,
      });
    }
  }

  async enviar(payload: { tipo: string; produtoId: string }) {
    const integracao = await this.sync.integracao();
    if (!integracao.ativo || !integracao.webhookSaidaAtivo || !integracao.webhookSaidaUrl) return;
    const produto = await this.prisma.produto.findUnique({
      where: { id: payload.produtoId },
      select: { sku: true },
    });
    if (!produto) return;
    const s = await this.prisma.saldoEstoque.aggregate({
      where: { produtoId: payload.produtoId },
      _sum: { quantidade: true, reservado: true },
    });
    const quantidade = s._sum.quantidade ?? new Prisma.Decimal(0);
    const reservado = s._sum.reservado ?? new Prisma.Decimal(0);
    const corpo = JSON.stringify({
      id: randomUUID(),
      tipo: payload.tipo,
      ocorridoEm: new Date().toISOString(),
      dados: {
        sku: produto.sku,
        quantidade: quantidade.toString(),
        reservado: reservado.toString(),
        disponivel: quantidade.sub(reservado).toString(),
      },
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const cabecalhos: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Estoque-Timestamp': timestamp,
    };
    if (integracao.webhookSaidaSegredoCifrado) {
      cabecalhos['X-Estoque-Assinatura'] = assinar(
        this.cripto.decifrar(integracao.webhookSaidaSegredoCifrado),
        timestamp,
        corpo,
      );
    }

    const inicio = Date.now();
    let status: number | undefined;
    try {
      const r = await fetch(integracao.webhookSaidaUrl, {
        method: 'POST',
        headers: cabecalhos,
        body: corpo,
        signal: AbortSignal.timeout(integracao.timeoutMs),
        redirect: 'error',
      });
      status = r.status;
      if (!r.ok) throw new Error(`CRM respondeu HTTP ${r.status} ao webhook`);
      await this.log(integracao.id, true, status, Date.now() - inicio, payload.tipo);
    } catch (e) {
      await this.log(
        integracao.id,
        false,
        status,
        Date.now() - inicio,
        payload.tipo,
        (e as Error).message,
      );
      throw e;
    }
  }

  private async log(
    integracaoId: string,
    sucesso: boolean,
    statusHttp: number | undefined,
    duracaoMs: number,
    operacao: string,
    erro?: string,
  ) {
    await this.prisma.integracaoLog.create({
      data: {
        integracaoId,
        direcao: 'SAIDA',
        operacao: `webhook:${operacao}`,
        metodo: 'POST',
        statusHttp,
        duracaoMs,
        sucesso,
        erro: erro?.slice(0, 1000),
      },
    });
  }
}
