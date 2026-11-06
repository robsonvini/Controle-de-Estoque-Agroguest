import { Injectable } from '@nestjs/common';
import { normalizarLinha, SQL_SALDO_POR_PRODUTO, SQL_SITUACAO } from '../../common/sql';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async resumo(dias = 30) {
    const [indicadores] = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT COUNT(*) FILTER (WHERE p.status = 'ATIVO') AS "totalProdutos",
             COUNT(*) FILTER (WHERE p.status = 'ATIVO' AND COALESCE(s.disponivel, 0) > 0) AS "produtosDisponiveis",
             COUNT(*) FILTER (WHERE p.status = 'ATIVO' AND COALESCE(s.disponivel, 0) > 0
                                AND p.estoque_minimo > 0 AND COALESCE(s.disponivel, 0) <= p.estoque_minimo) AS "produtosEstoqueBaixo",
             COUNT(*) FILTER (WHERE p.status = 'ATIVO' AND COALESCE(s.disponivel, 0) <= 0) AS "produtosSemEstoque",
             COALESCE(ROUND(SUM(COALESCE(s.quantidade, 0) * p.custo_medio), 2), 0) AS "valorTotalEstoque",
             COALESCE(SUM(s.reservado), 0) AS "totalReservado"
        FROM produtos p
        LEFT JOIN ${SQL_SALDO_POR_PRODUTO} s ON s.produto_id = p.id`;

    const historico = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT to_char(d.dia, 'YYYY-MM-DD') AS dia,
             COALESCE(SUM(mi.quantidade) FILTER (WHERE mi.local_destino_id IS NOT NULL AND mi.local_origem_id IS NULL), 0) AS entradas,
             COALESCE(SUM(mi.quantidade) FILTER (WHERE mi.local_origem_id IS NOT NULL AND mi.local_destino_id IS NULL), 0) AS saidas,
             COALESCE(SUM(mi.valor_total) FILTER (WHERE mi.local_destino_id IS NOT NULL AND mi.local_origem_id IS NULL), 0) AS "valorEntradas",
             COALESCE(SUM(mi.valor_total) FILTER (WHERE mi.local_origem_id IS NOT NULL AND mi.local_destino_id IS NULL), 0) AS "valorSaidas"
        FROM generate_series((now() AT TIME ZONE 'America/Sao_Paulo')::date - ${dias - 1}::int,
                             (now() AT TIME ZONE 'America/Sao_Paulo')::date, interval '1 day') AS d(dia)
        LEFT JOIN movimentacoes m ON (m.data_movimentacao AT TIME ZONE 'America/Sao_Paulo')::date = d.dia
        LEFT JOIN movimentacao_itens mi ON mi.movimentacao_id = m.id
       GROUP BY d.dia
       ORDER BY d.dia`;

    const maisMovimentados = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT p.id, p.sku, p.nome, u.sigla AS unidade,
             COUNT(DISTINCT m.id) AS movimentacoes,
             SUM(mi.quantidade) AS quantidade
        FROM movimentacao_itens mi
        JOIN movimentacoes m ON m.id = mi.movimentacao_id
        JOIN produtos p ON p.id = mi.produto_id
        JOIN unidades_medida u ON u.id = p.unidade_medida_id
       WHERE m.data_movimentacao >= now() - make_interval(days => ${dias})
         AND m.tipo IN ('ENTRADA', 'SAIDA')
       GROUP BY p.id, p.sku, p.nome, u.sigla
       ORDER BY movimentacoes DESC, quantidade DESC
       LIMIT 10`;

    const alertasReposicao = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT p.id, p.sku, p.nome, u.sigla AS unidade, p.estoque_minimo AS "estoqueMinimo",
             p.estoque_maximo AS "estoqueMaximo", COALESCE(s.disponivel, 0) AS disponivel,
             ${SQL_SITUACAO} AS situacao,
             GREATEST(COALESCE(p.estoque_maximo, p.estoque_minimo * 2) - COALESCE(s.disponivel, 0), 0) AS "sugestaoCompra"
        FROM produtos p
        JOIN unidades_medida u ON u.id = p.unidade_medida_id
        LEFT JOIN ${SQL_SALDO_POR_PRODUTO} s ON s.produto_id = p.id
       WHERE p.status = 'ATIVO' AND p.estoque_minimo > 0 AND COALESCE(s.disponivel, 0) <= p.estoque_minimo
       ORDER BY COALESCE(s.disponivel, 0) / NULLIF(p.estoque_minimo, 0), p.nome
       LIMIT 10`;

    const recentes = (tipo: 'ENTRADA' | 'SAIDA') =>
      this.prisma.movimentacao.findMany({
        where: { tipo },
        orderBy: [{ dataMovimentacao: 'desc' }, { numero: 'desc' }],
        take: 8,
        select: {
          id: true,
          numero: true,
          motivo: true,
          dataMovimentacao: true,
          valorTotal: true,
          usuario: { select: { nome: true } },
          clienteApi: { select: { nome: true } },
          _count: { select: { itens: true } },
        },
      });

    const [
      entradasRecentes,
      saidasRecentes,
      ajustesPendentes,
      inventariosAbertos,
      pedidosReservados,
      integracao,
    ] = await Promise.all([
      recentes('ENTRADA'),
      recentes('SAIDA'),
      this.prisma.ajuste.count({ where: { status: 'PENDENTE' } }),
      this.prisma.inventario.count({ where: { status: { in: ['EM_CONTAGEM', 'EM_REVISAO'] } } }),
      this.prisma.pedido.count({ where: { status: 'RESERVADO' } }),
      this.prisma.integracao.findFirst({
        select: {
          ativo: true,
          falhasConsecutivas: true,
          ultimoSucessoEm: true,
          ultimaSincronizacaoEm: true,
        },
      }),
    ]);

    return {
      indicadores: normalizarLinha(indicadores ?? {}),
      historico: historico.map(normalizarLinha),
      maisMovimentados: maisMovimentados.map(normalizarLinha),
      alertasReposicao: alertasReposicao.map(normalizarLinha),
      entradasRecentes,
      saidasRecentes,
      pendencias: { ajustesPendentes, inventariosAbertos, pedidosReservados },
      integracao,
      geradoEm: new Date().toISOString(),
    };
  }
}
