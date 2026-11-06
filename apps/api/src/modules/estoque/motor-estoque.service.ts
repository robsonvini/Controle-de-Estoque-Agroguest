import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type MotivoMovimentacao,
  type OrigemMovimentacao,
  type TipoMovimentacao,
} from '../../generated/prisma/client';
import type { ContextoAtor } from '../../common/auth/tipos';
import { regraNegocio, saldoInsuficiente } from '../../common/erros';
import type { Tx } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { TAREFAS, TarefasService } from '../tarefas/tarefas.service';

const D = Prisma.Decimal;
type Decimal = Prisma.Decimal;

/**
 * Item de movimentação. A direção é definida pelos locais:
 * só destino = entrada; só origem = saída; ambos = transferência.
 */
export interface ItemMovimento {
  produtoId: string;
  localOrigemId?: string | null;
  localDestinoId?: string | null;
  quantidade: Decimal | number | string;
  /** Custo unitário da entrada. Se informado, recalcula o custo médio ponderado. */
  custoUnitario?: Decimal | number | string | null;
  /** Saída que consome uma reserva já existente (confirmação de pedido). */
  consumirReserva?: boolean;
}

export interface NovaMovimentacao {
  tipo: TipoMovimentacao;
  motivo: MotivoMovimentacao;
  origem: OrigemMovimentacao;
  ator: ContextoAtor;
  itens: ItemMovimento[];
  dataMovimentacao?: Date;
  observacao?: string | null;
  estornoDeId?: string;
  pedidoId?: string;
  ajusteId?: string;
  /** Permite entrada em produto inativo (estornos e ajustes). */
  permitirProdutoInativo?: boolean;
  entrada?: {
    fornecedorId?: string | null;
    clienteCrmId?: string | null;
    pedidoCompraId?: string | null;
    numeroDocumento?: string | null;
    serieDocumento?: string | null;
    dataDocumento?: Date | null;
  };
  saida?: {
    clienteCrmId?: string | null;
    fornecedorId?: string | null;
    destino?: string | null;
    numeroDocumento?: string | null;
  };
}

interface ProdutoTravado {
  id: string;
  sku: string;
  nome: string;
  status: 'ATIVO' | 'INATIVO';
  custo_medio: Decimal;
  casas_decimais: number;
}

const dec = (v: Decimal | number | string) => (v instanceof D ? v : new D(v));

/**
 * Motor de estoque: ÚNICO ponto do sistema que altera saldos.
 *
 * Garantias:
 * - Executa dentro da transação recebida (atomicidade com o restante da operação).
 * - Trava os produtos envolvidos em ordem determinística (evita deadlock e
 *   serializa o recálculo do custo médio).
 * - Baixas usam UPDATE condicional (quantidade - reservado >= q): nunca deixa o
 *   saldo negativo, mesmo com requisições simultâneas; o CHECK do banco é a
 *   segunda barreira.
 * - Grava o livro-razão imutável, o evento no outbox e a auditoria.
 */
@Injectable()
export class MotorEstoqueService {
  constructor(
    private readonly tarefas: TarefasService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async registrar(tx: Tx, mov: NovaMovimentacao) {
    if (!mov.itens.length) throw regraNegocio('A movimentação deve ter ao menos um item.');

    const itens = this.consolidar(mov.itens);
    const produtos = await this.travarProdutos(tx, [...new Set(itens.map((i) => i.produtoId))]);
    await this.validarLocais(tx, itens);
    const saldoAntes = await this.saldosTotais(tx, [...produtos.keys()]);
    const novosCustos = new Map<string, Decimal>();

    const itensGravados: Prisma.MovimentacaoItemCreateManyMovimentacaoInput[] = [];

    for (const item of itens) {
      const produto = produtos.get(item.produtoId)!;
      const q = item.quantidade;
      this.validarQuantidade(produto, q);

      const ehEntradaPura = !!item.localDestinoId && !item.localOrigemId;
      if (ehEntradaPura && produto.status === 'INATIVO' && !mov.permitirProdutoInativo) {
        throw regraNegocio(`O produto ${produto.sku} está inativo e não pode receber entradas.`);
      }

      const custoAtual = novosCustos.get(produto.id) ?? produto.custo_medio;
      let custoUnitario = custoAtual;

      if (item.localOrigemId) {
        await this.baixar(tx, produto, item.localOrigemId, q, !!item.consumirReserva);
      }
      if (item.localDestinoId) {
        await this.acrescentar(tx, produto.id, item.localDestinoId, q);
      }

      // Custo médio ponderado: recalculado em entradas valorizadas
      if (ehEntradaPura && item.custoUnitario != null) {
        custoUnitario = dec(item.custoUnitario);
        const qtdAntes = saldoAntes.get(produto.id) ?? new D(0);
        const base = qtdAntes.gt(0) ? qtdAntes : new D(0);
        const novoCusto = base.mul(custoAtual).add(q.mul(custoUnitario)).div(base.add(q));
        novosCustos.set(produto.id, novoCusto.toDecimalPlaces(4));
        saldoAntes.set(produto.id, base.add(q));
      } else if (ehEntradaPura) {
        saldoAntes.set(produto.id, (saldoAntes.get(produto.id) ?? new D(0)).add(q));
      } else if (item.localOrigemId && !item.localDestinoId) {
        // Saída valorizada pelo custo informado (estorno de entrada) reverte o custo médio
        if (item.custoUnitario != null) {
          custoUnitario = dec(item.custoUnitario);
          const qtdAntes = saldoAntes.get(produto.id) ?? new D(0);
          const restante = qtdAntes.sub(q);
          if (restante.gt(0)) {
            const revertido = qtdAntes.mul(custoAtual).sub(q.mul(custoUnitario)).div(restante);
            if (revertido.gte(0)) novosCustos.set(produto.id, revertido.toDecimalPlaces(4));
          }
        }
        saldoAntes.set(produto.id, (saldoAntes.get(produto.id) ?? new D(0)).sub(q));
      }

      itensGravados.push({
        produtoId: produto.id,
        localOrigemId: item.localOrigemId ?? null,
        localDestinoId: item.localDestinoId ?? null,
        quantidade: q,
        custoUnitario,
        valorTotal: q.mul(custoUnitario).toDecimalPlaces(2),
      });
    }

    const valorTotal = itensGravados.reduce((t, i) => t.add(i.valorTotal as Decimal), new D(0));

    const movimentacao = await tx.movimentacao.create({
      data: {
        tipo: mov.tipo,
        motivo: mov.motivo,
        origem: mov.origem,
        dataMovimentacao: mov.dataMovimentacao ?? new Date(),
        usuarioId: mov.ator.usuarioId ?? null,
        clienteApiId: mov.ator.clienteApiId ?? null,
        observacao: mov.observacao ?? null,
        valorTotal: valorTotal.toDecimalPlaces(2),
        estornoDeId: mov.estornoDeId,
        pedidoId: mov.pedidoId,
        ajusteId: mov.ajusteId,
        itens: { createMany: { data: itensGravados } },
        ...(mov.entrada && { entrada: { create: mov.entrada } }),
        ...(mov.saida && { saida: { create: mov.saida } }),
      },
      include: { itens: true },
    });

    for (const [produtoId, custo] of novosCustos) {
      await tx.produto.update({ where: { id: produtoId }, data: { custoMedio: custo } });
    }

    await this.tarefas.enfileirar(
      TAREFAS.ESTOQUE_MOVIMENTADO,
      { movimentacaoId: movimentacao.id },
      {},
      tx,
    );
    await this.auditoria.registrar(
      mov.ator,
      {
        acao: 'MOVIMENTAR_ESTOQUE',
        entidade: 'movimentacao',
        entidadeId: movimentacao.id,
        dados: {
          numero: movimentacao.numero,
          tipo: mov.tipo,
          motivo: mov.motivo,
          itens: itensGravados.length,
        },
      },
      tx,
    );
    return movimentacao;
  }

  /** Reserva saldo disponível (pedido de venda). */
  async reservar(tx: Tx, produtoId: string, localId: string, quantidade: Decimal) {
    const linhas = await tx.$queryRaw<{ quantidade: Decimal }[]>`
      UPDATE saldos_estoque
         SET reservado = reservado + ${quantidade.toString()}::numeric, atualizado_em = now()
       WHERE produto_id = ${produtoId}::uuid AND local_id = ${localId}::uuid
         AND quantidade - reservado >= ${quantidade.toString()}::numeric
      RETURNING quantidade`;
    if (!linhas.length) await this.lancarSaldoInsuficiente(tx, produtoId, localId, quantidade);
  }

  /** Libera reserva (cancelamento de pedido). */
  async liberarReserva(tx: Tx, produtoId: string, localId: string, quantidade: Decimal) {
    const afetadas = await tx.$executeRaw`
      UPDATE saldos_estoque
         SET reservado = reservado - ${quantidade.toString()}::numeric, atualizado_em = now()
       WHERE produto_id = ${produtoId}::uuid AND local_id = ${localId}::uuid
         AND reservado >= ${quantidade.toString()}::numeric`;
    if (afetadas === 0)
      throw regraNegocio('Reserva inconsistente: quantidade reservada não encontrada.');
  }

  /** Trava produtos (SELECT ... FOR UPDATE) em ordem de id para evitar deadlocks. */
  async travarProdutos(tx: Tx, ids: string[]) {
    const ordenados = [...ids].sort();
    const linhas = await tx.$queryRaw<ProdutoTravado[]>`
      SELECT p.id, p.sku, p.nome, p.status::text AS status, p.custo_medio, u.casas_decimais
        FROM produtos p
        JOIN unidades_medida u ON u.id = p.unidade_medida_id
       WHERE p.id = ANY(${ordenados}::uuid[])
       ORDER BY p.id
         FOR UPDATE OF p`;
    if (linhas.length !== ordenados.length)
      throw regraNegocio('Produto inexistente na movimentação.');
    return new Map(linhas.map((l) => [l.id, { ...l, custo_medio: dec(l.custo_medio) }]));
  }

  private consolidar(itens: ItemMovimento[]) {
    // Soma itens repetidos (mesmo produto e mesmos locais) e ordena para travar saldos sempre na mesma ordem
    const mapa = new Map<string, ItemMovimento & { quantidade: Decimal }>();
    for (const item of itens) {
      const q = dec(item.quantidade);
      if (q.lte(0)) throw regraNegocio('A quantidade deve ser maior que zero.');
      if (!item.localOrigemId && !item.localDestinoId)
        throw regraNegocio('Item sem local de origem ou destino.');
      if (item.localOrigemId && item.localOrigemId === item.localDestinoId) {
        throw regraNegocio('Origem e destino não podem ser o mesmo local.');
      }
      const chave = `${item.produtoId}|${item.localOrigemId ?? ''}|${item.localDestinoId ?? ''}|${item.custoUnitario ?? ''}|${item.consumirReserva ? 1 : 0}`;
      const existente = mapa.get(chave);
      if (existente) existente.quantidade = existente.quantidade.add(q);
      else mapa.set(chave, { ...item, quantidade: q });
    }
    return [...mapa.values()].sort((a, b) =>
      `${a.produtoId}|${a.localOrigemId ?? a.localDestinoId}`.localeCompare(
        `${b.produtoId}|${b.localOrigemId ?? b.localDestinoId}`,
      ),
    );
  }

  private validarQuantidade(produto: ProdutoTravado, q: Decimal) {
    if (q.decimalPlaces() > produto.casas_decimais) {
      throw regraNegocio(
        `A unidade do produto ${produto.sku} aceita no máximo ${produto.casas_decimais} casa(s) decimal(is).`,
      );
    }
  }

  private async validarLocais(tx: Tx, itens: ItemMovimento[]) {
    const destinos = [...new Set(itens.map((i) => i.localDestinoId).filter(Boolean))] as string[];
    const todos = [
      ...new Set(itens.flatMap((i) => [i.localOrigemId, i.localDestinoId]).filter(Boolean)),
    ] as string[];
    const locais = await tx.localArmazenamento.findMany({
      where: { id: { in: todos } },
      select: { id: true, codigo: true, ativo: true },
    });
    if (locais.length !== todos.length) throw regraNegocio('Local de armazenamento inexistente.');
    const inativo = locais.find((l) => !l.ativo && destinos.includes(l.id));
    if (inativo)
      throw regraNegocio(`O local ${inativo.codigo} está inativo e não pode receber itens.`);
  }

  private async saldosTotais(tx: Tx, produtoIds: string[]) {
    const linhas = await tx.$queryRaw<{ produto_id: string; total: Decimal }[]>`
      SELECT produto_id, SUM(quantidade) AS total
        FROM saldos_estoque WHERE produto_id = ANY(${produtoIds}::uuid[])
       GROUP BY produto_id`;
    return new Map(linhas.map((l) => [l.produto_id, dec(l.total)]));
  }

  private async baixar(
    tx: Tx,
    produto: ProdutoTravado,
    localId: string,
    q: Decimal,
    consumirReserva: boolean,
  ) {
    const qtd = q.toString();
    const linhas = consumirReserva
      ? await tx.$queryRaw<{ quantidade: Decimal }[]>`
          UPDATE saldos_estoque
             SET quantidade = quantidade - ${qtd}::numeric,
                 reservado = reservado - ${qtd}::numeric,
                 atualizado_em = now()
           WHERE produto_id = ${produto.id}::uuid AND local_id = ${localId}::uuid
             AND reservado >= ${qtd}::numeric AND quantidade >= ${qtd}::numeric
          RETURNING quantidade`
      : await tx.$queryRaw<{ quantidade: Decimal }[]>`
          UPDATE saldos_estoque
             SET quantidade = quantidade - ${qtd}::numeric, atualizado_em = now()
           WHERE produto_id = ${produto.id}::uuid AND local_id = ${localId}::uuid
             AND quantidade - reservado >= ${qtd}::numeric
          RETURNING quantidade`;
    if (!linhas.length) await this.lancarSaldoInsuficiente(tx, produto.id, localId, q);
  }

  private async acrescentar(tx: Tx, produtoId: string, localId: string, q: Decimal) {
    await tx.$executeRaw`
      INSERT INTO saldos_estoque (produto_id, local_id, quantidade, reservado, atualizado_em)
      VALUES (${produtoId}::uuid, ${localId}::uuid, ${q.toString()}::numeric, 0, now())
      ON CONFLICT (produto_id, local_id)
      DO UPDATE SET quantidade = saldos_estoque.quantidade + EXCLUDED.quantidade, atualizado_em = now()`;
  }

  private async lancarSaldoInsuficiente(
    tx: Tx,
    produtoId: string,
    localId: string,
    solicitado: Decimal,
  ): Promise<never> {
    // Consultas sequenciais: a conexão de uma transação não aceita consultas em paralelo
    const produto = await tx.produto.findUnique({
      where: { id: produtoId },
      select: { sku: true, nome: true },
    });
    const local = await tx.localArmazenamento.findUnique({
      where: { id: localId },
      select: { codigo: true },
    });
    const saldo = await tx.saldoEstoque.findUnique({
      where: { produtoId_localId: { produtoId, localId } },
    });
    const disponivel = saldo ? saldo.quantidade.sub(saldo.reservado) : new D(0);
    throw saldoInsuficiente({
      produtoId,
      sku: produto?.sku,
      produto: produto?.nome,
      local: local?.codigo,
      disponivel: disponivel.toString(),
      solicitado: solicitado.toString(),
    });
  }
}
