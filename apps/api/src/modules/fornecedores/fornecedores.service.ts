import { Injectable } from '@nestjs/common';
import { listarFornecedoresSchema, type FornecedorInput } from '@estoque/shared';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client';
import type { ContextoAtor } from '../../common/auth/tipos';
import { conflito, naoEncontrado } from '../../common/erros';
import { ordenacao, paginar, resultadoPaginado } from '../../common/paginacao';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

@Injectable()
export class FornecedoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(q: z.infer<typeof listarFornecedoresSchema>) {
    const digitos = q.busca?.replace(/\D/g, '');
    const where: Prisma.FornecedorWhereInput = {
      anonimizadoEm: null,
      ...(q.situacao && { situacao: q.situacao }),
      ...(q.busca && {
        OR: [
          { razaoSocial: { contains: q.busca, mode: 'insensitive' } },
          { nomeFantasia: { contains: q.busca, mode: 'insensitive' } },
          ...(digitos && digitos.length >= 3 ? [{ documento: { contains: digitos } }] : []),
        ],
      }),
    };
    const [dados, total] = await Promise.all([
      this.prisma.fornecedor.findMany({
        where,
        include: { _count: { select: { produtos: true, pedidosCompra: true } } },
        orderBy: ordenacao(
          q,
          ['razaoSocial', 'nomeFantasia', 'criadoEm', 'situacao'],
          'razaoSocial',
        ),
        ...paginar(q),
      }),
      this.prisma.fornecedor.count({ where }),
    ]);
    return resultadoPaginado(dados, total, q);
  }

  async obter(id: string) {
    const f = await this.prisma.fornecedor.findUnique({
      where: { id },
      include: {
        contatos: { orderBy: { nome: 'asc' } },
        produtos: {
          include: { produto: { select: { id: true, nome: true, sku: true, status: true } } },
          orderBy: { produto: { nome: 'asc' } },
        },
      },
    });
    if (!f) throw naoEncontrado('Fornecedor');
    return f;
  }

  /** Histórico de compras: pedidos de compra e entradas vinculadas ao fornecedor. */
  async historicoCompras(id: string) {
    await this.obter(id);
    const [pedidos, entradas, totais] = await Promise.all([
      this.prisma.pedidoCompra.findMany({
        where: { fornecedorId: id },
        orderBy: { dataPedido: 'desc' },
        take: 100,
        select: {
          id: true,
          numero: true,
          status: true,
          dataPedido: true,
          valorTotal: true,
          previsaoEntrega: true,
        },
      }),
      this.prisma.entrada.findMany({
        where: { fornecedorId: id },
        orderBy: { movimentacao: { dataMovimentacao: 'desc' } },
        take: 100,
        select: {
          numeroDocumento: true,
          movimentacao: {
            select: {
              id: true,
              numero: true,
              motivo: true,
              dataMovimentacao: true,
              valorTotal: true,
            },
          },
        },
      }),
      this.prisma.movimentacao.aggregate({
        where: { entrada: { fornecedorId: id }, tipo: 'ENTRADA' },
        _sum: { valorTotal: true },
        _count: true,
      }),
    ]);
    return {
      pedidos,
      entradas,
      totais: { valorRecebido: totais._sum.valorTotal ?? 0, quantidadeEntradas: totais._count },
    };
  }

  async criar(dados: FornecedorInput, ator: ContextoAtor) {
    await this.garantirDocumentoUnico(dados.documento);
    const { contatos, ...campos } = dados;
    return this.prisma.$transaction(async (tx) => {
      const f = await tx.fornecedor.create({
        data: { ...campos, contatos: { create: contatos } },
        include: { contatos: true },
      });
      await this.auditoria.registrar(
        ator,
        { acao: 'CRIAR', entidade: 'fornecedor', entidadeId: f.id, dados },
        tx,
      );
      return f;
    });
  }

  async atualizar(id: string, dados: FornecedorInput, ator: ContextoAtor) {
    const atual = await this.obter(id);
    await this.garantirDocumentoUnico(dados.documento, id);
    const { contatos, ...campos } = dados;
    return this.prisma.$transaction(async (tx) => {
      await tx.fornecedorContato.deleteMany({ where: { fornecedorId: id } });
      const f = await tx.fornecedor.update({
        where: { id },
        data: { ...campos, contatos: { create: contatos } },
        include: { contatos: true },
      });
      await this.auditoria.registrar(
        ator,
        {
          acao: 'ATUALIZAR',
          entidade: 'fornecedor',
          entidadeId: id,
          dados: {
            antes: { razaoSocial: atual.razaoSocial, situacao: atual.situacao },
            depois: dados,
          },
        },
        tx,
      );
      return f;
    });
  }

  private async garantirDocumentoUnico(documento: string, ignorarId?: string) {
    const existe = await this.prisma.fornecedor.findFirst({
      where: { documento, ...(ignorarId && { id: { not: ignorarId } }) },
    });
    if (existe) throw conflito('Já existe um fornecedor com este CPF/CNPJ.');
  }
}
