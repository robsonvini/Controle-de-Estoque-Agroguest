import { Injectable } from '@nestjs/common';
import type {
  EntradaInput,
  EstornoInput,
  ListarMovimentacoesQuery,
  SaidaInput,
  TransferenciaInput,
} from '@estoque/shared';
import { z } from 'zod';
import { listarSaldosSchema } from '@estoque/shared';
import { Prisma } from '../../generated/prisma/client';
import type { ContextoAtor, UsuarioAutenticado } from '../../common/auth/tipos';
import { naoEncontrado, proibido, regraNegocio } from '../../common/erros';
import { intervaloDatas, paginar, resultadoPaginado } from '../../common/paginacao';
import { normalizarLinha, sqlCategoriaComFilhas } from '../../common/sql';
import { PrismaService, type Tx } from '../../prisma/prisma.service';
import { MotorEstoqueService } from './motor-estoque.service';

const INCLUDE_DETALHE = {
  usuario: { select: { id: true, nome: true } },
  clienteApi: { select: { id: true, nome: true } },
  itens: {
    include: {
      produto: {
        select: { id: true, sku: true, nome: true, unidadeMedida: { select: { sigla: true } } },
      },
      localOrigem: { select: { id: true, codigo: true, nome: true } },
      localDestino: { select: { id: true, codigo: true, nome: true } },
    },
  },
  entrada: {
    include: {
      fornecedor: { select: { id: true, razaoSocial: true } },
      clienteCrm: { select: { id: true, nome: true } },
      pedidoCompra: { select: { id: true, numero: true } },
    },
  },
  saida: {
    include: {
      fornecedor: { select: { id: true, razaoSocial: true } },
      clienteCrm: { select: { id: true, nome: true } },
    },
  },
  pedido: { select: { id: true, numero: true, idExterno: true, origem: true } },
  ajuste: { select: { id: true, numero: true } },
  estornoDe: { select: { id: true, numero: true } },
  estornadaPor: { select: { id: true, numero: true, dataMovimentacao: true, observacao: true } },
} satisfies Prisma.MovimentacaoInclude;

@Injectable()
export class MovimentacoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly motor: MotorEstoqueService,
  ) {}

  async registrarEntrada(dados: EntradaInput, usuario: UsuarioAutenticado, ator: ContextoAtor) {
    if (dados.motivo === 'AJUSTE_POSITIVO' && !usuario.permissoes.has('ajustes:aprovar')) {
      throw proibido('Ajustes positivos exigem a permissão de aprovar ajustes.');
    }
    if (dados.fornecedorId) await this.validarFornecedor(dados.fornecedorId, true);
    if (dados.clienteCrmId) await this.validarCliente(dados.clienteCrmId);

    const mov = await this.prisma.$transaction((tx) =>
      this.motor.registrar(tx, {
        tipo: 'ENTRADA',
        motivo: dados.motivo,
        origem: 'MANUAL',
        ator,
        dataMovimentacao: dados.dataMovimentacao,
        observacao: dados.observacao,
        itens: dados.itens.map((i) => ({
          produtoId: i.produtoId,
          localDestinoId: i.localId,
          quantidade: i.quantidade,
          custoUnitario: i.custoUnitario ?? null,
        })),
        entrada: {
          fornecedorId: dados.fornecedorId,
          clienteCrmId: dados.clienteCrmId,
          numeroDocumento: dados.numeroDocumento,
          serieDocumento: dados.serieDocumento,
          dataDocumento: dados.dataDocumento ?? null,
        },
      }),
    );
    return this.obter(mov.id);
  }

  async registrarSaida(dados: SaidaInput, ator: ContextoAtor) {
    if (dados.fornecedorId) await this.validarFornecedor(dados.fornecedorId, false);
    if (dados.clienteCrmId) await this.validarCliente(dados.clienteCrmId);
    const mov = await this.prisma.$transaction((tx) =>
      this.motor.registrar(tx, {
        tipo: 'SAIDA',
        motivo: dados.motivo,
        origem: 'MANUAL',
        ator,
        dataMovimentacao: dados.dataMovimentacao,
        observacao: dados.observacao,
        itens: dados.itens.map((i) => ({
          produtoId: i.produtoId,
          localOrigemId: i.localId,
          quantidade: i.quantidade,
        })),
        saida: {
          clienteCrmId: dados.clienteCrmId,
          fornecedorId: dados.fornecedorId,
          destino: dados.destino,
          numeroDocumento: dados.numeroDocumento,
        },
      }),
    );
    return this.obter(mov.id);
  }

  async registrarTransferencia(dados: TransferenciaInput, ator: ContextoAtor) {
    const mov = await this.prisma.$transaction((tx) =>
      this.motor.registrar(tx, {
        tipo: 'TRANSFERENCIA',
        motivo: 'TRANSFERENCIA',
        origem: 'MANUAL',
        ator,
        dataMovimentacao: dados.dataMovimentacao,
        observacao: dados.observacao,
        permitirProdutoInativo: true,
        itens: dados.itens.map((i) => ({
          produtoId: i.produtoId,
          localOrigemId: dados.localOrigemId,
          localDestinoId: dados.localDestinoId,
          quantidade: i.quantidade,
        })),
      }),
    );
    return this.obter(mov.id);
  }

  /**
   * Estorno: gera uma movimentação inversa vinculada à original (o registro original
   * permanece imutável). Movimentações de venda e de ajuste não são estornáveis por
   * aqui: use devolução ou um novo ajuste.
   */
  async estornar(id: string, dados: EstornoInput, ator: ContextoAtor) {
    const estorno = await this.prisma.$transaction(async (tx) => {
      const original = await tx.movimentacao.findUnique({
        where: { id },
        include: { itens: true, entrada: true, estornadaPor: { select: { id: true } } },
      });
      if (!original) throw naoEncontrado('Movimentação');
      if (original.tipo === 'ESTORNO') throw regraNegocio('Um estorno não pode ser estornado.');
      if (original.estornadaPor) throw regraNegocio('Esta movimentação já foi estornada.');
      if (original.origem === 'PEDIDO_VENDA') {
        throw regraNegocio(
          'Saídas de pedidos de venda não podem ser estornadas. Registre uma entrada por devolução.',
        );
      }
      if (original.origem === 'AJUSTE') {
        throw regraNegocio('Ajustes aprovados não podem ser estornados. Solicite um novo ajuste.');
      }

      if (original.entrada?.pedidoCompraId) {
        await this.reverterRecebimento(tx, original.entrada.pedidoCompraId, original.itens);
      }

      return this.motor.registrar(tx, {
        tipo: 'ESTORNO',
        motivo: 'ESTORNO',
        origem: 'ESTORNO',
        ator,
        estornoDeId: original.id,
        permitirProdutoInativo: true,
        observacao: `Estorno da movimentação nº ${original.numero}: ${dados.justificativa}`,
        itens: original.itens.map((i) => ({
          produtoId: i.produtoId,
          localOrigemId: i.localDestinoId,
          localDestinoId: i.localOrigemId,
          quantidade: i.quantidade,
          // Estorno de entrada valorizada reverte o custo médio pelo mesmo custo
          custoUnitario:
            i.localDestinoId && !i.localOrigemId && original.tipo === 'ENTRADA'
              ? i.custoUnitario
              : null,
        })),
      });
    });
    return this.obter(estorno.id);
  }

  async listar(q: ListarMovimentacoesQuery) {
    const itemFiltro: Prisma.MovimentacaoItemWhereInput = {
      ...(q.produtoId && { produtoId: q.produtoId }),
      ...(q.localId && { OR: [{ localOrigemId: q.localId }, { localDestinoId: q.localId }] }),
    };
    const where: Prisma.MovimentacaoWhereInput = {
      ...(q.tipo && { tipo: q.tipo }),
      ...(q.motivo && { motivo: q.motivo }),
      ...(q.usuarioId && { usuarioId: q.usuarioId }),
      ...((q.produtoId || q.localId) && { itens: { some: itemFiltro } }),
      AND: [
        ...(q.fornecedorId
          ? [
              {
                OR: [
                  { entrada: { fornecedorId: q.fornecedorId } },
                  { saida: { fornecedorId: q.fornecedorId } },
                ],
              },
            ]
          : []),
        ...(q.clienteCrmId
          ? [
              {
                OR: [
                  { entrada: { clienteCrmId: q.clienteCrmId } },
                  { saida: { clienteCrmId: q.clienteCrmId } },
                ],
              },
            ]
          : []),
      ],
      ...(intervaloDatas(q.dataInicio, q.dataFim) && {
        dataMovimentacao: intervaloDatas(q.dataInicio, q.dataFim),
      }),
      ...(q.busca && /^\d+$/.test(q.busca) && { numero: BigInt(q.busca) }),
    };
    const [dados, total] = await Promise.all([
      this.prisma.movimentacao.findMany({
        where,
        include: {
          usuario: { select: { nome: true } },
          clienteApi: { select: { nome: true } },
          entrada: {
            select: {
              numeroDocumento: true,
              fornecedor: { select: { razaoSocial: true } },
              clienteCrm: { select: { nome: true } },
            },
          },
          saida: {
            select: {
              destino: true,
              clienteCrm: { select: { nome: true } },
              fornecedor: { select: { razaoSocial: true } },
            },
          },
          estornadaPor: { select: { id: true, numero: true } },
          _count: { select: { itens: true } },
          itens: {
            take: 3,
            select: { quantidade: true, produto: { select: { sku: true, nome: true } } },
          },
        },
        orderBy: [{ dataMovimentacao: q.ordem === 'asc' ? 'asc' : 'desc' }, { numero: 'desc' }],
        ...paginar(q),
      }),
      this.prisma.movimentacao.count({ where }),
    ]);
    return resultadoPaginado(dados, total, q);
  }

  async obter(id: string) {
    const m = await this.prisma.movimentacao.findUnique({
      where: { id },
      include: INCLUDE_DETALHE,
    });
    if (!m) throw naoEncontrado('Movimentação');
    return m;
  }

  async listarSaldos(q: z.infer<typeof listarSaldosSchema>) {
    const condicoes: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (q.produtoId) condicoes.push(Prisma.sql`s.produto_id = ${q.produtoId}::uuid`);
    if (q.localId) condicoes.push(Prisma.sql`s.local_id = ${q.localId}::uuid`);
    if (q.categoriaId)
      condicoes.push(sqlCategoriaComFilhas(Prisma.sql`p.categoria_id`, q.categoriaId));
    if (q.somenteComSaldo) condicoes.push(Prisma.sql`s.quantidade > 0`);
    if (q.busca) {
      const termo = `%${q.busca.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      condicoes.push(
        Prisma.sql`(p.nome ILIKE ${termo} OR p.sku ILIKE ${termo} OR l.codigo ILIKE ${termo})`,
      );
    }
    const linhas = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT s.produto_id AS "produtoId", p.sku, p.nome AS "produtoNome", u.sigla AS "unidadeSigla",
             s.local_id AS "localId", l.codigo AS "localCodigo", l.nome AS "localNome",
             s.quantidade, s.reservado, (s.quantidade - s.reservado) AS disponivel,
             p.custo_medio AS "custoMedio", ROUND(s.quantidade * p.custo_medio, 2) AS "valorTotal",
             s.atualizado_em AS "atualizadoEm", COUNT(*) OVER() AS "totalRegistros"
        FROM saldos_estoque s
        JOIN produtos p ON p.id = s.produto_id
        JOIN unidades_medida u ON u.id = p.unidade_medida_id
        JOIN locais_armazenamento l ON l.id = s.local_id
       WHERE ${Prisma.join(condicoes, ' AND ')}
       ORDER BY p.nome, l.codigo
       LIMIT ${q.porPagina} OFFSET ${(q.pagina - 1) * q.porPagina}`;
    const total = linhas.length ? Number(linhas[0]!.totalRegistros) : 0;
    return resultadoPaginado(
      linhas.map((l) => {
        const { totalRegistros: _t, ...resto } = normalizarLinha(l);
        return resto;
      }),
      total,
      q,
    );
  }

  /** Divergências entre saldo materializado e livro-razão (deve retornar lista vazia). */
  async conciliacao() {
    const linhas = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT c.*, p.sku, l.codigo AS "localCodigo"
        FROM vw_conciliacao_saldos c
        JOIN produtos p ON p.id = c.produto_id
        JOIN locais_armazenamento l ON l.id = c.local_id`;
    return { consistente: linhas.length === 0, divergencias: linhas.map(normalizarLinha) };
  }

  private async validarFornecedor(id: string, exigirAtivo: boolean) {
    const f = await this.prisma.fornecedor.findUnique({
      where: { id },
      select: { situacao: true },
    });
    if (!f) throw regraNegocio('Fornecedor inexistente.');
    if (exigirAtivo && f.situacao !== 'ATIVO') throw regraNegocio('O fornecedor não está ativo.');
  }

  private async validarCliente(id: string) {
    const c = await this.prisma.clienteCrm.count({ where: { id } });
    if (!c) throw regraNegocio('Cliente inexistente.');
  }

  private async reverterRecebimento(
    tx: Tx,
    pedidoCompraId: string,
    itens: { produtoId: string; quantidade: Prisma.Decimal }[],
  ) {
    for (const item of itens) {
      const afetadas = await tx.$executeRaw`
        UPDATE pedidos_compra_itens
           SET quantidade_recebida = quantidade_recebida - ${item.quantidade.toString()}::numeric
         WHERE pedido_compra_id = ${pedidoCompraId}::uuid AND produto_id = ${item.produtoId}::uuid
           AND quantidade_recebida >= ${item.quantidade.toString()}::numeric`;
      if (afetadas === 0)
        throw regraNegocio('Recebimento do pedido de compra inconsistente para estorno.');
    }
    const restantes = await tx.pedidoCompraItem.findMany({ where: { pedidoCompraId } });
    const algumRecebido = restantes.some((i) => i.quantidadeRecebida.gt(0));
    await tx.pedidoCompra.update({
      where: { id: pedidoCompraId },
      data: { status: algumRecebido ? 'PARCIALMENTE_RECEBIDO' : 'ENVIADO' },
    });
  }
}
