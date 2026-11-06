import { Injectable } from '@nestjs/common';
import { listarPedidosSchema, type CancelamentoInput } from '@estoque/shared';
import { z } from 'zod';
import { Prisma, type OrigemPedido } from '../../generated/prisma/client';
import type { ContextoAtor } from '../../common/auth/tipos';
import { naoEncontrado, regraNegocio, saldoInsuficiente } from '../../common/erros';
import { intervaloDatas, paginar, resultadoPaginado } from '../../common/paginacao';
import { PrismaService, type Tx } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { MotorEstoqueService } from '../estoque/motor-estoque.service';

const D = Prisma.Decimal;

export interface ItemPedidoNovo {
  produtoId: string;
  /** Local de saída; se ausente, a reserva é distribuída entre os locais com saldo. */
  localId?: string | null;
  quantidade: number | string | Prisma.Decimal;
  precoUnitario?: number | string | null;
}

export interface NovoPedido {
  origem: OrigemPedido;
  idExterno?: string | null;
  clienteCrmId?: string | null;
  observacao?: string | null;
  itens: ItemPedidoNovo[];
}

const INCLUDE = {
  clienteCrm: { select: { id: true, crmId: true, nome: true, razaoSocial: true } },
  criadoPor: { select: { id: true, nome: true } },
  clienteApi: { select: { id: true, nome: true } },
  itens: {
    include: {
      produto: {
        select: { id: true, sku: true, nome: true, unidadeMedida: { select: { sigla: true } } },
      },
      local: { select: { id: true, codigo: true, nome: true } },
      reserva: { select: { status: true, quantidade: true } },
    },
  },
  movimentacoes: { select: { id: true, numero: true, dataMovimentacao: true, tipo: true } },
} satisfies Prisma.PedidoInclude;

@Injectable()
export class PedidosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly motor: MotorEstoqueService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(q: z.infer<typeof listarPedidosSchema>) {
    const where: Prisma.PedidoWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.origem && { origem: q.origem }),
      ...(q.clienteCrmId && { clienteCrmId: q.clienteCrmId }),
      ...(intervaloDatas(q.dataInicio, q.dataFim) && {
        criadoEm: intervaloDatas(q.dataInicio, q.dataFim),
      }),
      ...(q.busca &&
        (/^\d+$/.test(q.busca)
          ? { OR: [{ numero: BigInt(q.busca) }, { idExterno: q.busca }] }
          : {
              OR: [
                { idExterno: { contains: q.busca, mode: 'insensitive' } },
                { clienteCrm: { nome: { contains: q.busca, mode: 'insensitive' } } },
              ],
            })),
    };
    const [dados, total] = await Promise.all([
      this.prisma.pedido.findMany({
        where,
        include: {
          clienteCrm: { select: { id: true, nome: true } },
          criadoPor: { select: { nome: true } },
          clienteApi: { select: { nome: true } },
          _count: { select: { itens: true } },
        },
        orderBy: { numero: 'desc' },
        ...paginar(q),
      }),
      this.prisma.pedido.count({ where }),
    ]);
    return resultadoPaginado(dados, total, q);
  }

  async obter(id: string) {
    const p = await this.prisma.pedido.findUnique({ where: { id }, include: INCLUDE });
    if (!p) throw naoEncontrado('Pedido');
    return p;
  }

  async obterPorExterno(origem: OrigemPedido, idExterno: string) {
    const p = await this.prisma.pedido.findUnique({
      where: { origem_idExterno: { origem, idExterno } },
      include: INCLUDE,
    });
    if (!p) throw naoEncontrado('Pedido');
    return p;
  }

  /**
   * Cria o pedido reservando o saldo. Se já existir pedido com o mesmo
   * (origem, idExterno), devolve o existente sem nova reserva (idempotência).
   */
  async criar(
    dados: NovoPedido,
    ator: ContextoAtor,
  ): Promise<{ pedido: Awaited<ReturnType<PedidosService['obter']>>; jaExistia: boolean }> {
    if (dados.idExterno) {
      const existente = await this.prisma.pedido.findUnique({
        where: { origem_idExterno: { origem: dados.origem, idExterno: dados.idExterno } },
        select: { id: true },
      });
      if (existente) return { pedido: await this.obter(existente.id), jaExistia: true };
    }
    if (
      dados.clienteCrmId &&
      !(await this.prisma.clienteCrm.count({ where: { id: dados.clienteCrmId } }))
    ) {
      throw regraNegocio('Cliente inexistente.');
    }

    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const produtos = await tx.produto.findMany({
          where: { id: { in: [...new Set(dados.itens.map((i) => i.produtoId))] } },
          select: { id: true, sku: true, status: true, precoVenda: true, localPadraoId: true },
        });
        const porId = new Map(produtos.map((p) => [p.id, p]));
        const alocados: {
          produtoId: string;
          localId: string;
          quantidade: Prisma.Decimal;
          preco: Prisma.Decimal;
        }[] = [];

        for (const item of dados.itens) {
          const produto = porId.get(item.produtoId);
          if (!produto) throw regraNegocio('Produto inexistente no pedido.');
          if (produto.status !== 'ATIVO')
            throw regraNegocio(`O produto ${produto.sku} está inativo.`);
          const preco = new D(item.precoUnitario ?? produto.precoVenda);
          const quantidade = new D(item.quantidade);
          const partes = item.localId
            ? [{ localId: item.localId, quantidade }]
            : await this.distribuir(tx, produto.id, produto.sku, produto.localPadraoId, quantidade);
          for (const parte of partes) alocados.push({ produtoId: produto.id, ...parte, preco });
        }

        // Consolida produto+local e reserva em ordem determinística
        const consolidados = new Map<string, (typeof alocados)[number]>();
        for (const a of alocados) {
          const chave = `${a.produtoId}|${a.localId}`;
          const atual = consolidados.get(chave);
          if (atual) atual.quantidade = atual.quantidade.add(a.quantidade);
          else consolidados.set(chave, { ...a });
        }
        const ordenados = [...consolidados.values()].sort((a, b) =>
          `${a.produtoId}|${a.localId}`.localeCompare(`${b.produtoId}|${b.localId}`),
        );
        for (const a of ordenados)
          await this.motor.reservar(tx, a.produtoId, a.localId, a.quantidade);

        const valorTotal = ordenados
          .reduce((t, a) => t.add(a.quantidade.mul(a.preco)), new D(0))
          .toDecimalPlaces(2);
        const pedido = await tx.pedido.create({
          data: {
            origem: dados.origem,
            idExterno: dados.idExterno ?? null,
            clienteCrmId: dados.clienteCrmId ?? null,
            observacao: dados.observacao ?? null,
            criadoPorId: ator.usuarioId ?? null,
            clienteApiId: ator.clienteApiId ?? null,
            valorTotal,
          },
        });
        for (const a of ordenados) {
          const item = await tx.pedidoItem.create({
            data: {
              pedidoId: pedido.id,
              produtoId: a.produtoId,
              localId: a.localId,
              quantidade: a.quantidade,
              precoUnitario: a.preco,
            },
          });
          await tx.reserva.create({
            data: {
              pedidoItemId: item.id,
              produtoId: a.produtoId,
              localId: a.localId,
              quantidade: a.quantidade,
            },
          });
        }
        await this.auditoria.registrar(
          ator,
          {
            acao: 'CRIAR',
            entidade: 'pedido',
            entidadeId: pedido.id,
            dados: { idExterno: dados.idExterno, itens: ordenados.length },
          },
          tx,
        );
        return pedido.id;
      });
      return { pedido: await this.obter(id), jaExistia: false };
    } catch (e) {
      // Corrida entre duas criações com o mesmo idExterno: devolve o pedido vencedor
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002' &&
        dados.idExterno
      ) {
        return {
          pedido: await this.obterPorExterno(dados.origem, dados.idExterno),
          jaExistia: true,
        };
      }
      throw e;
    }
  }

  /** Confirma a venda: baixa o estoque consumindo as reservas. Idempotente para pedidos já confirmados. */
  async confirmar(id: string, ator: ContextoAtor) {
    await this.prisma.$transaction(async (tx) => {
      const pedido = await this.travar(tx, id);
      if (pedido.status === 'CONFIRMADO') return;
      if (pedido.status === 'CANCELADO')
        throw regraNegocio('Pedido cancelado não pode ser confirmado.');
      const itens = await tx.pedidoItem.findMany({ where: { pedidoId: id } });

      await this.motor.registrar(tx, {
        tipo: 'SAIDA',
        motivo: 'VENDA',
        origem: 'PEDIDO_VENDA',
        ator,
        pedidoId: id,
        permitirProdutoInativo: true,
        observacao: `Pedido nº ${pedido.numero}${pedido.id_externo ? ` (externo ${pedido.id_externo})` : ''}`,
        itens: itens.map((i) => ({
          produtoId: i.produtoId,
          localOrigemId: i.localId,
          quantidade: i.quantidade,
          consumirReserva: true,
        })),
        saida: { clienteCrmId: pedido.cliente_crm_id, numeroDocumento: pedido.id_externo },
      });
      await tx.reserva.updateMany({
        where: { pedidoItem: { pedidoId: id }, status: 'ATIVA' },
        data: { status: 'CONSUMIDA', encerradaEm: new Date() },
      });
      await tx.pedido.update({
        where: { id },
        data: { status: 'CONFIRMADO', confirmadoEm: new Date() },
      });
      await this.auditoria.registrar(
        ator,
        { acao: 'CONFIRMAR', entidade: 'pedido', entidadeId: id },
        tx,
      );
    });
    return this.obter(id);
  }

  /** Cancela o pedido liberando as reservas. Idempotente para pedidos já cancelados. */
  async cancelar(id: string, dados: CancelamentoInput, ator: ContextoAtor) {
    await this.prisma.$transaction(async (tx) => {
      const pedido = await this.travar(tx, id);
      if (pedido.status === 'CANCELADO') return;
      if (pedido.status === 'CONFIRMADO') {
        throw regraNegocio(
          'Pedido já confirmado (estoque baixado). Registre uma entrada por devolução de cliente.',
        );
      }
      const reservas = await tx.reserva.findMany({
        where: { pedidoItem: { pedidoId: id }, status: 'ATIVA' },
        orderBy: [{ produtoId: 'asc' }, { localId: 'asc' }],
      });
      for (const r of reservas)
        await this.motor.liberarReserva(tx, r.produtoId, r.localId, r.quantidade);
      await tx.reserva.updateMany({
        where: { id: { in: reservas.map((r) => r.id) } },
        data: { status: 'LIBERADA', encerradaEm: new Date() },
      });
      await tx.pedido.update({
        where: { id },
        data: { status: 'CANCELADO', canceladoEm: new Date(), motivoCancelamento: dados.motivo },
      });
      await this.auditoria.registrar(
        ator,
        { acao: 'CANCELAR', entidade: 'pedido', entidadeId: id, dados },
        tx,
      );
    });
    return this.obter(id);
  }

  private async travar(tx: Tx, id: string) {
    const [pedido] = await tx.$queryRaw<
      {
        id: string;
        numero: bigint;
        status: string;
        id_externo: string | null;
        cliente_crm_id: string | null;
      }[]
    >`SELECT id, numero, status::text AS status, id_externo, cliente_crm_id FROM pedidos WHERE id = ${id}::uuid FOR UPDATE`;
    if (!pedido) throw naoEncontrado('Pedido');
    return pedido;
  }

  /** Distribui a quantidade entre os locais com saldo disponível (local padrão primeiro). */
  private async distribuir(
    tx: Tx,
    produtoId: string,
    sku: string,
    localPadraoId: string | null,
    quantidade: Prisma.Decimal,
  ) {
    const saldos = await tx.saldoEstoque.findMany({
      where: { produtoId, local: { ativo: true } },
      select: { localId: true, quantidade: true, reservado: true },
    });
    const disponiveis = saldos
      .map((s) => ({ localId: s.localId, disponivel: s.quantidade.sub(s.reservado) }))
      .filter((s) => s.disponivel.gt(0))
      .sort((a, b) => {
        if (a.localId === localPadraoId) return -1;
        if (b.localId === localPadraoId) return 1;
        return b.disponivel.comparedTo(a.disponivel);
      });
    const partes: { localId: string; quantidade: Prisma.Decimal }[] = [];
    let restante = quantidade;
    for (const s of disponiveis) {
      if (restante.lte(0)) break;
      const usar = D.min(restante, s.disponivel);
      partes.push({ localId: s.localId, quantidade: usar });
      restante = restante.sub(usar);
    }
    if (restante.gt(0)) {
      const total = disponiveis.reduce((t, s) => t.add(s.disponivel), new D(0));
      throw saldoInsuficiente({
        produtoId,
        sku,
        disponivel: total.toString(),
        solicitado: quantidade.toString(),
      });
    }
    return partes;
  }
}
