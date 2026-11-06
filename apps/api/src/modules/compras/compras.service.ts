import { Injectable } from '@nestjs/common';
import {
  listarComprasSchema,
  type CancelamentoInput,
  type PedidoCompraInput,
  type RecebimentoInput,
} from '@estoque/shared';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import type { ContextoAtor } from '../../common/auth/tipos';
import { naoEncontrado, regraNegocio } from '../../common/erros';
import { intervaloDatas, paginar, resultadoPaginado } from '../../common/paginacao';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { MotorEstoqueService } from '../estoque/motor-estoque.service';

const D = Prisma.Decimal;

@Injectable()
export class ComprasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly motor: MotorEstoqueService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(q: z.infer<typeof listarComprasSchema>) {
    const where: Prisma.PedidoCompraWhereInput = {
      ...(q.fornecedorId && { fornecedorId: q.fornecedorId }),
      ...(q.status && { status: q.status }),
      ...(intervaloDatas(q.dataInicio, q.dataFim) && {
        dataPedido: intervaloDatas(q.dataInicio, q.dataFim),
      }),
      ...(q.busca &&
        (/^\d+$/.test(q.busca)
          ? { numero: BigInt(q.busca) }
          : { fornecedor: { razaoSocial: { contains: q.busca, mode: 'insensitive' } } })),
    };
    const [dados, total] = await Promise.all([
      this.prisma.pedidoCompra.findMany({
        where,
        include: {
          fornecedor: { select: { id: true, razaoSocial: true } },
          criadoPor: { select: { nome: true } },
          _count: { select: { itens: true } },
        },
        orderBy: { numero: 'desc' },
        ...paginar(q),
      }),
      this.prisma.pedidoCompra.count({ where }),
    ]);
    return resultadoPaginado(dados, total, q);
  }

  async obter(id: string) {
    const p = await this.prisma.pedidoCompra.findUnique({
      where: { id },
      include: {
        fornecedor: { select: { id: true, razaoSocial: true, documento: true, situacao: true } },
        criadoPor: { select: { id: true, nome: true } },
        itens: {
          include: {
            produto: {
              select: {
                id: true,
                sku: true,
                nome: true,
                localPadraoId: true,
                unidadeMedida: { select: { sigla: true } },
              },
            },
          },
        },
        entradas: {
          include: {
            movimentacao: {
              select: {
                id: true,
                numero: true,
                dataMovimentacao: true,
                valorTotal: true,
                estornadaPor: { select: { id: true } },
              },
            },
          },
        },
      },
    });
    if (!p) throw naoEncontrado('Pedido de compra');
    return {
      ...p,
      itens: p.itens.map((i) => ({
        ...i,
        quantidadePendente: i.quantidade.sub(i.quantidadeRecebida),
      })),
    };
  }

  async criar(dados: PedidoCompraInput, ator: ContextoAtor) {
    await this.validar(dados);
    const pedido = await this.prisma.$transaction(async (tx) => {
      const p = await tx.pedidoCompra.create({
        data: {
          fornecedorId: dados.fornecedorId,
          previsaoEntrega: dados.previsaoEntrega ?? null,
          observacao: dados.observacao,
          criadoPorId: ator.usuarioId!,
          valorTotal: this.total(dados),
          itens: { create: dados.itens.map((i) => ({ ...i })) },
        },
      });
      await this.auditoria.registrar(
        ator,
        { acao: 'CRIAR', entidade: 'pedido_compra', entidadeId: p.id, dados },
        tx,
      );
      return p;
    });
    return this.obter(pedido.id);
  }

  async atualizar(id: string, dados: PedidoCompraInput, ator: ContextoAtor) {
    const atual = await this.obter(id);
    if (atual.status !== 'RASCUNHO')
      throw regraNegocio('Somente pedidos em rascunho podem ser editados.');
    await this.validar(dados);
    await this.prisma.$transaction(async (tx) => {
      await tx.pedidoCompraItem.deleteMany({ where: { pedidoCompraId: id } });
      await tx.pedidoCompra.update({
        where: { id },
        data: {
          fornecedorId: dados.fornecedorId,
          previsaoEntrega: dados.previsaoEntrega ?? null,
          observacao: dados.observacao,
          valorTotal: this.total(dados),
          itens: { create: dados.itens.map((i) => ({ ...i })) },
        },
      });
      await this.auditoria.registrar(
        ator,
        { acao: 'ATUALIZAR', entidade: 'pedido_compra', entidadeId: id, dados },
        tx,
      );
    });
    return this.obter(id);
  }

  async enviar(id: string, ator: ContextoAtor) {
    const r = await this.prisma.pedidoCompra.updateMany({
      where: { id, status: 'RASCUNHO' },
      data: { status: 'ENVIADO' },
    });
    if (!r.count) throw regraNegocio('Somente pedidos em rascunho podem ser enviados.');
    await this.auditoria.registrar(ator, {
      acao: 'ENVIAR',
      entidade: 'pedido_compra',
      entidadeId: id,
    });
    return this.obter(id);
  }

  async cancelar(id: string, dados: CancelamentoInput, ator: ContextoAtor) {
    const r = await this.prisma.pedidoCompra.updateMany({
      where: { id, status: { in: ['RASCUNHO', 'ENVIADO', 'PARCIALMENTE_RECEBIDO'] } },
      data: { status: 'CANCELADO', motivoCancelamento: dados.motivo },
    });
    if (!r.count) throw regraNegocio('Este pedido não pode ser cancelado no status atual.');
    await this.auditoria.registrar(ator, {
      acao: 'CANCELAR',
      entidade: 'pedido_compra',
      entidadeId: id,
      dados,
    });
    return this.obter(id);
  }

  /** Recebimento total ou parcial: gera entrada valorizada pelo preço do pedido. */
  async receber(id: string, dados: RecebimentoInput, ator: ContextoAtor) {
    const movimentacaoId = await this.prisma.$transaction(async (tx) => {
      // Trava o pedido para serializar recebimentos simultâneos
      const [pedido] = await tx.$queryRaw<{ status: string; fornecedor_id: string }[]>`
        SELECT status::text AS status, fornecedor_id FROM pedidos_compra WHERE id = ${id}::uuid FOR UPDATE`;
      if (!pedido) throw naoEncontrado('Pedido de compra');
      if (!['ENVIADO', 'PARCIALMENTE_RECEBIDO'].includes(pedido.status)) {
        throw regraNegocio('Somente pedidos enviados podem ser recebidos.');
      }
      const itensPedido = await tx.pedidoCompraItem.findMany({ where: { pedidoCompraId: id } });
      const porId = new Map(itensPedido.map((i) => [i.id, i]));

      const recebidos = new Map<string, Prisma.Decimal>();
      for (const r of dados.itens) {
        const item = porId.get(r.itemId);
        if (!item) throw regraNegocio('Item não pertence ao pedido de compra.');
        recebidos.set(item.id, (recebidos.get(item.id) ?? new D(0)).add(r.quantidade));
      }
      for (const [itemId, qtd] of recebidos) {
        const item = porId.get(itemId)!;
        const pendente = item.quantidade.sub(item.quantidadeRecebida);
        if (qtd.gt(pendente)) {
          throw regraNegocio(
            `Quantidade recebida maior que a pendente (pendente: ${pendente.toString()}).`,
            {
              itemId,
              pendente: pendente.toString(),
            },
          );
        }
        await tx.pedidoCompraItem.update({
          where: { id: itemId },
          data: { quantidadeRecebida: { increment: qtd } },
        });
        await tx.produtoFornecedor.upsert({
          where: {
            produtoId_fornecedorId: {
              produtoId: item.produtoId,
              fornecedorId: pedido.fornecedor_id,
            },
          },
          update: { ultimoPrecoCompra: item.precoUnitario },
          create: {
            produtoId: item.produtoId,
            fornecedorId: pedido.fornecedor_id,
            ultimoPrecoCompra: item.precoUnitario,
          },
        });
      }

      const mov = await this.motor.registrar(tx, {
        tipo: 'ENTRADA',
        motivo: 'COMPRA',
        origem: 'COMPRA',
        ator,
        dataMovimentacao: dados.dataMovimentacao,
        observacao: dados.observacao,
        itens: dados.itens.map((r) => {
          const item = porId.get(r.itemId)!;
          return {
            produtoId: item.produtoId,
            localDestinoId: r.localId,
            quantidade: r.quantidade,
            custoUnitario: item.precoUnitario,
          };
        }),
        entrada: {
          fornecedorId: pedido.fornecedor_id,
          pedidoCompraId: id,
          numeroDocumento: dados.numeroDocumento,
          serieDocumento: dados.serieDocumento,
          dataDocumento: dados.dataDocumento ?? null,
        },
      });

      const atualizados = await tx.pedidoCompraItem.findMany({ where: { pedidoCompraId: id } });
      const completo = atualizados.every((i) => i.quantidadeRecebida.gte(i.quantidade));
      await tx.pedidoCompra.update({
        where: { id },
        data: { status: completo ? 'RECEBIDO' : 'PARCIALMENTE_RECEBIDO' },
      });
      return mov.id;
    });
    return { pedido: await this.obter(id), movimentacaoId };
  }

  private total(dados: PedidoCompraInput) {
    return dados.itens
      .reduce((t, i) => t.add(new D(i.quantidade).mul(i.precoUnitario)), new D(0))
      .toDecimalPlaces(2);
  }

  private async validar(dados: PedidoCompraInput) {
    const fornecedor = await this.prisma.fornecedor.findUnique({
      where: { id: dados.fornecedorId },
    });
    if (!fornecedor) throw regraNegocio('Fornecedor inexistente.');
    if (fornecedor.situacao !== 'ATIVO') throw regraNegocio('O fornecedor não está ativo.');
    const ids = dados.itens.map((i) => i.produtoId);
    const produtos = await this.prisma.produto.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true, sku: true },
    });
    if (produtos.length !== ids.length) throw regraNegocio('Produto inexistente no pedido.');
    const inativo = produtos.find((p) => p.status !== 'ATIVO');
    if (inativo) throw regraNegocio(`O produto ${inativo.sku} está inativo.`);
  }
}
