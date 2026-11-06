import { Injectable } from '@nestjs/common';
import {
  ROTULOS_MOTIVO,
  ROTULOS_RELATORIO,
  ROTULOS_TIPO_MOVIMENTACAO,
  type FiltroRelatorio,
  type TipoRelatorio,
} from '@estoque/shared';
import { Prisma } from '../../generated/prisma/client';
import { intervaloDatas } from '../../common/paginacao';
import {
  normalizarLinha,
  SQL_SALDO_POR_PRODUTO,
  SQL_SITUACAO,
  sqlCategoriaComFilhas,
} from '../../common/sql';
import { PrismaService } from '../../prisma/prisma.service';

export type TipoColuna =
  'texto' | 'numero' | 'quantidade' | 'moeda' | 'data' | 'dataHora' | 'percentual';

export interface Coluna {
  chave: string;
  titulo: string;
  tipo: TipoColuna;
  /** Peso relativo da largura (PDF). */
  largura?: number;
}

export interface Relatorio {
  tipo: TipoRelatorio;
  titulo: string;
  colunas: Coluna[];
  linhas: Record<string, unknown>[];
  totais?: Record<string, unknown>;
  filtros: Record<string, string>;
  geradoEm: string;
}

const ROTULO_SITUACAO: Record<string, string> = {
  DISPONIVEL: 'Disponível',
  BAIXO: 'Baixo',
  ESGOTADO: 'Esgotado',
};

@Injectable()
export class RelatoriosService {
  constructor(private readonly prisma: PrismaService) {}

  async gerar(tipo: TipoRelatorio, f: FiltroRelatorio): Promise<Relatorio> {
    const base = {
      tipo,
      titulo: ROTULOS_RELATORIO[tipo],
      filtros: await this.descreverFiltros(f),
      geradoEm: new Date().toISOString(),
    };
    switch (tipo) {
      case 'posicao-estoque':
        return { ...base, ...(await this.posicaoEstoque(f)) };
      case 'historico-movimentacoes':
        return { ...base, ...(await this.historicoMovimentacoes(f)) };
      case 'mais-vendidos':
        return { ...base, ...(await this.maisVendidos(f)) };
      case 'baixo-giro':
        return { ...base, ...(await this.baixoGiro(f)) };
      case 'sem-movimentacao':
        return { ...base, ...(await this.semMovimentacao(f)) };
      case 'inventarios-divergencias':
        return { ...base, ...(await this.divergencias(f)) };
      case 'valor-estoque':
        return { ...base, ...(await this.valorEstoque(f)) };
      case 'historico-compras':
        return { ...base, ...(await this.historicoCompras(f)) };
      case 'perdas-ajustes':
        return { ...base, ...(await this.perdasAjustes(f)) };
    }
  }

  // ------------------------------------------------------------------

  private filtrosProduto(f: FiltroRelatorio, alias = 'p') {
    const p = Prisma.raw(alias);
    const c: Prisma.Sql[] = [];
    if (f.produtoId) c.push(Prisma.sql`${p}.id = ${f.produtoId}::uuid`);
    if (f.categoriaId) c.push(sqlCategoriaComFilhas(Prisma.sql`${p}.categoria_id`, f.categoriaId));
    if (f.fornecedorId) {
      c.push(
        Prisma.sql`EXISTS (SELECT 1 FROM produto_fornecedores pf WHERE pf.produto_id = ${p}.id AND pf.fornecedor_id = ${f.fornecedorId}::uuid)`,
      );
    }
    return c;
  }

  private periodo(f: FiltroRelatorio, coluna: Prisma.Sql) {
    const i = intervaloDatas(f.dataInicio, f.dataFim);
    const c: Prisma.Sql[] = [];
    if (i?.gte) c.push(Prisma.sql`${coluna} >= ${i.gte}`);
    if (i?.lte) c.push(Prisma.sql`${coluna} <= ${i.lte}`);
    return c;
  }

  private onde(condicoes: Prisma.Sql[]) {
    return condicoes.length ? Prisma.sql`WHERE ${Prisma.join(condicoes, ' AND ')}` : Prisma.empty;
  }

  private async posicaoEstoque(f: FiltroRelatorio) {
    const saldo = f.localId
      ? Prisma.sql`(SELECT produto_id, SUM(quantidade) AS quantidade, SUM(reservado) AS reservado, SUM(quantidade - reservado) AS disponivel
                     FROM saldos_estoque WHERE local_id = ${f.localId}::uuid GROUP BY produto_id)`
      : SQL_SALDO_POR_PRODUTO;
    const linhas = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT p.sku, p.nome, c.nome AS categoria, u.sigla AS unidade,
             COALESCE(s.quantidade, 0) AS quantidade, COALESCE(s.reservado, 0) AS reservado,
             COALESCE(s.disponivel, 0) AS disponivel, p.estoque_minimo AS minimo,
             ${SQL_SITUACAO} AS situacao, p.custo_medio AS "custoMedio",
             ROUND(COALESCE(s.quantidade, 0) * p.custo_medio, 2) AS valor
        FROM produtos p
        JOIN unidades_medida u ON u.id = p.unidade_medida_id
        LEFT JOIN categorias c ON c.id = p.categoria_id
        LEFT JOIN ${saldo} s ON s.produto_id = p.id
        ${this.onde([Prisma.sql`p.status = 'ATIVO'`, ...this.filtrosProduto(f)])}
       ORDER BY p.nome
       LIMIT ${f.limite}`;
    const dados = linhas.map((l) => ({
      ...normalizarLinha(l),
      situacao: ROTULO_SITUACAO[String(l.situacao)],
    }));
    return {
      colunas: [
        { chave: 'sku', titulo: 'SKU', tipo: 'texto', largura: 1.2 },
        { chave: 'nome', titulo: 'Produto', tipo: 'texto', largura: 2.6 },
        { chave: 'categoria', titulo: 'Categoria', tipo: 'texto', largura: 1.4 },
        { chave: 'unidade', titulo: 'Un.', tipo: 'texto', largura: 0.5 },
        { chave: 'quantidade', titulo: 'Saldo', tipo: 'quantidade' },
        { chave: 'reservado', titulo: 'Reservado', tipo: 'quantidade' },
        { chave: 'disponivel', titulo: 'Disponível', tipo: 'quantidade' },
        { chave: 'minimo', titulo: 'Mínimo', tipo: 'quantidade' },
        { chave: 'situacao', titulo: 'Situação', tipo: 'texto', largura: 0.9 },
        { chave: 'custoMedio', titulo: 'Custo médio', tipo: 'moeda' },
        { chave: 'valor', titulo: 'Valor', tipo: 'moeda' },
      ] satisfies Coluna[],
      linhas: dados,
      totais: { valor: this.somar(dados, 'valor'), produtos: dados.length },
    };
  }

  private async historicoMovimentacoes(f: FiltroRelatorio) {
    const c = [
      ...this.periodo(f, Prisma.sql`m.data_movimentacao`),
      ...this.filtrosProduto(f),
      ...(f.tipo ? [Prisma.sql`m.tipo = ${f.tipo}::"TipoMovimentacao"`] : []),
      ...(f.motivo ? [Prisma.sql`m.motivo = ${f.motivo}::"MotivoMovimentacao"`] : []),
      ...(f.localId
        ? [
            Prisma.sql`(mi.local_origem_id = ${f.localId}::uuid OR mi.local_destino_id = ${f.localId}::uuid)`,
          ]
        : []),
    ];
    const linhas = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT m.data_movimentacao AS data, m.numero, m.tipo::text AS tipo, m.motivo::text AS motivo,
             p.sku, p.nome AS produto, lo.codigo AS origem, ld.codigo AS destino,
             mi.quantidade, mi.custo_unitario AS "custoUnitario", mi.valor_total AS valor,
             COALESCE(us.nome, ca.nome) AS responsavel,
             COALESCE(e.numero_documento, s.numero_documento) AS documento,
             COALESCE(fe.razao_social, fs.razao_social, ce.nome, cs.nome, s.destino) AS "parceiro"
        FROM movimentacao_itens mi
        JOIN movimentacoes m ON m.id = mi.movimentacao_id
        JOIN produtos p ON p.id = mi.produto_id
        LEFT JOIN locais_armazenamento lo ON lo.id = mi.local_origem_id
        LEFT JOIN locais_armazenamento ld ON ld.id = mi.local_destino_id
        LEFT JOIN usuarios us ON us.id = m.usuario_id
        LEFT JOIN clientes_api ca ON ca.id = m.cliente_api_id
        LEFT JOIN entradas e ON e.movimentacao_id = m.id
        LEFT JOIN saidas s ON s.movimentacao_id = m.id
        LEFT JOIN fornecedores fe ON fe.id = e.fornecedor_id
        LEFT JOIN fornecedores fs ON fs.id = s.fornecedor_id
        LEFT JOIN crm_clientes ce ON ce.id = e.cliente_crm_id
        LEFT JOIN crm_clientes cs ON cs.id = s.cliente_crm_id
        ${this.onde(c)}
       ORDER BY m.data_movimentacao DESC, m.numero DESC
       LIMIT ${f.limite}`;
    const dados = linhas.map((l) => ({
      ...normalizarLinha(l),
      tipo: ROTULOS_TIPO_MOVIMENTACAO[l.tipo as keyof typeof ROTULOS_TIPO_MOVIMENTACAO],
      motivo: ROTULOS_MOTIVO[l.motivo as keyof typeof ROTULOS_MOTIVO],
    }));
    return {
      colunas: [
        { chave: 'data', titulo: 'Data/hora', tipo: 'dataHora', largura: 1.3 },
        { chave: 'numero', titulo: 'Nº', tipo: 'numero', largura: 0.6 },
        { chave: 'tipo', titulo: 'Tipo', tipo: 'texto', largura: 0.9 },
        { chave: 'motivo', titulo: 'Motivo', tipo: 'texto', largura: 1.3 },
        { chave: 'sku', titulo: 'SKU', tipo: 'texto', largura: 1.1 },
        { chave: 'produto', titulo: 'Produto', tipo: 'texto', largura: 2 },
        { chave: 'origem', titulo: 'Origem', tipo: 'texto', largura: 0.8 },
        { chave: 'destino', titulo: 'Destino', tipo: 'texto', largura: 0.8 },
        { chave: 'quantidade', titulo: 'Qtd.', tipo: 'quantidade', largura: 0.8 },
        { chave: 'valor', titulo: 'Valor', tipo: 'moeda', largura: 0.9 },
        { chave: 'responsavel', titulo: 'Responsável', tipo: 'texto', largura: 1.2 },
        { chave: 'documento', titulo: 'Documento', tipo: 'texto', largura: 0.9 },
        { chave: 'parceiro', titulo: 'Parceiro / destino', tipo: 'texto', largura: 1.5 },
      ] satisfies Coluna[],
      linhas: dados,
      totais: { registros: dados.length },
    };
  }

  private async maisVendidos(f: FiltroRelatorio) {
    const c = [
      Prisma.sql`m.motivo = 'VENDA'`,
      Prisma.sql`mi.local_origem_id IS NOT NULL`,
      ...this.periodo(f, Prisma.sql`m.data_movimentacao`),
      ...this.filtrosProduto(f),
    ];
    const linhas = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT p.sku, p.nome, c.nome AS categoria, u.sigla AS unidade,
             COUNT(DISTINCT m.id) AS vendas, SUM(mi.quantidade) AS quantidade,
             SUM(mi.valor_total) AS "valorCusto",
             ROUND(SUM(mi.quantidade * COALESCE(pi.preco_unitario, p.preco_venda)), 2) AS "valorVenda"
        FROM movimentacao_itens mi
        JOIN movimentacoes m ON m.id = mi.movimentacao_id
        JOIN produtos p ON p.id = mi.produto_id
        JOIN unidades_medida u ON u.id = p.unidade_medida_id
        LEFT JOIN categorias c ON c.id = p.categoria_id
        LEFT JOIN pedido_itens pi ON pi.pedido_id = m.pedido_id AND pi.produto_id = mi.produto_id AND pi.local_id = mi.local_origem_id
        ${this.onde(c)}
       GROUP BY p.sku, p.nome, c.nome, u.sigla
       ORDER BY quantidade DESC
       LIMIT ${f.limite}`;
    const dados = linhas.map((l, i) => ({ posicao: i + 1, ...normalizarLinha(l) }));
    return {
      colunas: [
        { chave: 'posicao', titulo: '#', tipo: 'numero', largura: 0.4 },
        { chave: 'sku', titulo: 'SKU', tipo: 'texto', largura: 1.2 },
        { chave: 'nome', titulo: 'Produto', tipo: 'texto', largura: 2.6 },
        { chave: 'categoria', titulo: 'Categoria', tipo: 'texto', largura: 1.4 },
        { chave: 'unidade', titulo: 'Un.', tipo: 'texto', largura: 0.5 },
        { chave: 'vendas', titulo: 'Vendas', tipo: 'numero' },
        { chave: 'quantidade', titulo: 'Quantidade', tipo: 'quantidade' },
        { chave: 'valorVenda', titulo: 'Valor de venda', tipo: 'moeda' },
        { chave: 'valorCusto', titulo: 'Custo', tipo: 'moeda' },
      ] satisfies Coluna[],
      linhas: dados,
      totais: {
        valorVenda: this.somar(dados, 'valorVenda'),
        valorCusto: this.somar(dados, 'valorCusto'),
      },
    };
  }

  private async baixoGiro(f: FiltroRelatorio) {
    const dias = f.dias ?? 90;
    const linhas = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      WITH saidas AS (
        SELECT mi.produto_id, SUM(mi.quantidade) AS quantidade
          FROM movimentacao_itens mi
          JOIN movimentacoes m ON m.id = mi.movimentacao_id
         WHERE mi.local_origem_id IS NOT NULL AND mi.local_destino_id IS NULL
           AND m.tipo = 'SAIDA' AND m.data_movimentacao >= now() - make_interval(days => ${dias})
         GROUP BY mi.produto_id)
      SELECT p.sku, p.nome, u.sigla AS unidade, COALESCE(s.quantidade, 0) AS saldo,
             COALESCE(sa.quantidade, 0) AS "saidasPeriodo",
             ROUND(COALESCE(sa.quantidade, 0) / NULLIF(s.quantidade, 0), 4) AS giro,
             CASE WHEN COALESCE(sa.quantidade, 0) = 0 THEN NULL
                  ELSE ROUND(s.quantidade / (sa.quantidade / ${dias}::numeric), 0) END AS "diasCobertura",
             ROUND(COALESCE(s.quantidade, 0) * p.custo_medio, 2) AS "valorParado"
        FROM produtos p
        JOIN unidades_medida u ON u.id = p.unidade_medida_id
        JOIN ${SQL_SALDO_POR_PRODUTO} s ON s.produto_id = p.id AND s.quantidade > 0
        LEFT JOIN saidas sa ON sa.produto_id = p.id
        ${this.onde([Prisma.sql`p.status = 'ATIVO'`, ...this.filtrosProduto(f)])}
       ORDER BY giro ASC NULLS FIRST, "valorParado" DESC
       LIMIT ${f.limite}`;
    const dados = linhas.map(normalizarLinha);
    return {
      colunas: [
        { chave: 'sku', titulo: 'SKU', tipo: 'texto', largura: 1.2 },
        { chave: 'nome', titulo: 'Produto', tipo: 'texto', largura: 2.6 },
        { chave: 'unidade', titulo: 'Un.', tipo: 'texto', largura: 0.5 },
        { chave: 'saldo', titulo: 'Saldo', tipo: 'quantidade' },
        { chave: 'saidasPeriodo', titulo: `Saídas (${dias} dias)`, tipo: 'quantidade' },
        { chave: 'giro', titulo: 'Giro', tipo: 'numero' },
        { chave: 'diasCobertura', titulo: 'Dias de cobertura', tipo: 'numero' },
        { chave: 'valorParado', titulo: 'Valor em estoque', tipo: 'moeda' },
      ] satisfies Coluna[],
      linhas: dados,
      totais: { valorParado: this.somar(dados, 'valorParado') },
    };
  }

  private async semMovimentacao(f: FiltroRelatorio) {
    const dias = f.dias ?? 90;
    const linhas = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT p.sku, p.nome, u.sigla AS unidade, COALESCE(s.quantidade, 0) AS saldo,
             ROUND(COALESCE(s.quantidade, 0) * p.custo_medio, 2) AS valor,
             (SELECT MAX(m.data_movimentacao) FROM movimentacao_itens mi
                JOIN movimentacoes m ON m.id = mi.movimentacao_id WHERE mi.produto_id = p.id) AS "ultimaMovimentacao"
        FROM produtos p
        JOIN unidades_medida u ON u.id = p.unidade_medida_id
        LEFT JOIN ${SQL_SALDO_POR_PRODUTO} s ON s.produto_id = p.id
        ${this.onde([
          Prisma.sql`p.status = 'ATIVO'`,
          Prisma.sql`NOT EXISTS (SELECT 1 FROM movimentacao_itens mi JOIN movimentacoes m ON m.id = mi.movimentacao_id
                                  WHERE mi.produto_id = p.id AND m.data_movimentacao >= now() - make_interval(days => ${dias}))`,
          ...this.filtrosProduto(f),
        ])}
       ORDER BY valor DESC, p.nome
       LIMIT ${f.limite}`;
    const dados = linhas.map(normalizarLinha);
    return {
      colunas: [
        { chave: 'sku', titulo: 'SKU', tipo: 'texto', largura: 1.2 },
        { chave: 'nome', titulo: 'Produto', tipo: 'texto', largura: 2.8 },
        { chave: 'unidade', titulo: 'Un.', tipo: 'texto', largura: 0.5 },
        { chave: 'saldo', titulo: 'Saldo', tipo: 'quantidade' },
        { chave: 'valor', titulo: 'Valor parado', tipo: 'moeda' },
        {
          chave: 'ultimaMovimentacao',
          titulo: 'Última movimentação',
          tipo: 'dataHora',
          largura: 1.3,
        },
      ] satisfies Coluna[],
      linhas: dados,
      totais: { valor: this.somar(dados, 'valor'), produtos: dados.length, dias },
    };
  }

  private async divergencias(f: FiltroRelatorio) {
    const c = [
      Prisma.sql`ii.divergencia IS NOT NULL AND ii.divergencia <> 0`,
      ...this.periodo(f, Prisma.sql`i.iniciado_em`),
      ...this.filtrosProduto(f),
      ...(f.localId ? [Prisma.sql`ii.local_id = ${f.localId}::uuid`] : []),
    ];
    const linhas = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT i.numero AS inventario, i.descricao, i.iniciado_em AS data, i.status::text AS status,
             p.sku, p.nome AS produto, l.codigo AS local,
             ii.quantidade_sistema AS sistema, ii.quantidade_contada AS contado, ii.divergencia,
             ROUND(ii.divergencia * p.custo_medio, 2) AS "valorDivergencia",
             (SELECT a.status::text FROM ajustes a WHERE a.inventario_id = i.id ORDER BY a.solicitado_em DESC LIMIT 1) AS ajuste
        FROM inventario_itens ii
        JOIN inventarios i ON i.id = ii.inventario_id
        JOIN produtos p ON p.id = ii.produto_id
        JOIN locais_armazenamento l ON l.id = ii.local_id
        ${this.onde(c)}
       ORDER BY i.numero DESC, p.nome
       LIMIT ${f.limite}`;
    const dados = linhas.map(normalizarLinha);
    return {
      colunas: [
        { chave: 'inventario', titulo: 'Inventário', tipo: 'numero', largura: 0.7 },
        { chave: 'descricao', titulo: 'Descrição', tipo: 'texto', largura: 1.6 },
        { chave: 'data', titulo: 'Início', tipo: 'data' },
        { chave: 'status', titulo: 'Status', tipo: 'texto' },
        { chave: 'sku', titulo: 'SKU', tipo: 'texto', largura: 1.1 },
        { chave: 'produto', titulo: 'Produto', tipo: 'texto', largura: 2 },
        { chave: 'local', titulo: 'Local', tipo: 'texto', largura: 0.8 },
        { chave: 'sistema', titulo: 'Sistema', tipo: 'quantidade' },
        { chave: 'contado', titulo: 'Contado', tipo: 'quantidade' },
        { chave: 'divergencia', titulo: 'Divergência', tipo: 'quantidade' },
        { chave: 'valorDivergencia', titulo: 'Valor', tipo: 'moeda' },
        { chave: 'ajuste', titulo: 'Ajuste', tipo: 'texto' },
      ] satisfies Coluna[],
      linhas: dados,
      totais: { valorDivergencia: this.somar(dados, 'valorDivergencia') },
    };
  }

  private async valorEstoque(f: FiltroRelatorio) {
    const filtroLocal = f.localId ? Prisma.sql`AND se.local_id = ${f.localId}::uuid` : Prisma.empty;
    const linhas = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      WITH base AS (
        SELECT COALESCE(c.nome, 'Sem categoria') AS categoria, p.id,
               COALESCE(SUM(se.quantidade), 0) AS quantidade,
               ROUND(COALESCE(SUM(se.quantidade), 0) * p.custo_medio, 2) AS valor
          FROM produtos p
          LEFT JOIN categorias c ON c.id = p.categoria_id
          LEFT JOIN saldos_estoque se ON se.produto_id = p.id ${filtroLocal}
          ${this.onde(this.filtrosProduto(f))}
         GROUP BY c.nome, p.id, p.custo_medio)
      SELECT categoria, COUNT(*) FILTER (WHERE quantidade > 0) AS produtos,
             SUM(quantidade) AS quantidade, SUM(valor) AS valor,
             ROUND(100 * SUM(valor) / NULLIF(SUM(SUM(valor)) OVER (), 0), 2) AS percentual
        FROM base
       GROUP BY categoria
       ORDER BY valor DESC`;
    const dados = linhas.map(normalizarLinha);
    return {
      colunas: [
        { chave: 'categoria', titulo: 'Categoria', tipo: 'texto', largura: 2.5 },
        { chave: 'produtos', titulo: 'Produtos com saldo', tipo: 'numero' },
        { chave: 'quantidade', titulo: 'Quantidade total', tipo: 'quantidade' },
        { chave: 'valor', titulo: 'Valor (custo médio)', tipo: 'moeda' },
        { chave: 'percentual', titulo: '% do total', tipo: 'percentual' },
      ] satisfies Coluna[],
      linhas: dados,
      totais: { valor: this.somar(dados, 'valor') },
    };
  }

  private async historicoCompras(f: FiltroRelatorio) {
    const c = [
      ...this.periodo(f, Prisma.sql`pc.data_pedido`),
      ...(f.fornecedorId ? [Prisma.sql`pc.fornecedor_id = ${f.fornecedorId}::uuid`] : []),
      ...(f.produtoId
        ? [
            Prisma.sql`EXISTS (SELECT 1 FROM pedidos_compra_itens x WHERE x.pedido_compra_id = pc.id AND x.produto_id = ${f.produtoId}::uuid)`,
          ]
        : []),
    ];
    const linhas = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT pc.numero, pc.data_pedido AS data, f.razao_social AS fornecedor, pc.status::text AS status,
             (SELECT COUNT(*) FROM pedidos_compra_itens x WHERE x.pedido_compra_id = pc.id) AS itens,
             pc.valor_total AS "valorPedido",
             COALESCE((SELECT SUM(m.valor_total) FROM entradas e JOIN movimentacoes m ON m.id = e.movimentacao_id
                        WHERE e.pedido_compra_id = pc.id
                          AND NOT EXISTS (SELECT 1 FROM movimentacoes es WHERE es.estorno_de_id = m.id)), 0) AS "valorRecebido",
             pc.previsao_entrega AS previsao
        FROM pedidos_compra pc
        JOIN fornecedores f ON f.id = pc.fornecedor_id
        ${this.onde(c)}
       ORDER BY pc.data_pedido DESC
       LIMIT ${f.limite}`;
    const dados = linhas.map(normalizarLinha);
    return {
      colunas: [
        { chave: 'numero', titulo: 'Pedido', tipo: 'numero', largura: 0.6 },
        { chave: 'data', titulo: 'Data', tipo: 'data' },
        { chave: 'fornecedor', titulo: 'Fornecedor', tipo: 'texto', largura: 2.6 },
        { chave: 'status', titulo: 'Status', tipo: 'texto', largura: 1.3 },
        { chave: 'itens', titulo: 'Itens', tipo: 'numero', largura: 0.5 },
        { chave: 'valorPedido', titulo: 'Valor do pedido', tipo: 'moeda' },
        { chave: 'valorRecebido', titulo: 'Valor recebido', tipo: 'moeda' },
        { chave: 'previsao', titulo: 'Previsão', tipo: 'data' },
      ] satisfies Coluna[],
      linhas: dados,
      totais: {
        valorPedido: this.somar(dados, 'valorPedido'),
        valorRecebido: this.somar(dados, 'valorRecebido'),
      },
    };
  }

  private async perdasAjustes(f: FiltroRelatorio) {
    const c = [
      Prisma.sql`m.motivo IN ('PERDA', 'AVARIA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'AJUSTE_INVENTARIO')`,
      ...this.periodo(f, Prisma.sql`m.data_movimentacao`),
      ...this.filtrosProduto(f),
      ...(f.motivo ? [Prisma.sql`m.motivo = ${f.motivo}::"MotivoMovimentacao"`] : []),
      ...(f.localId
        ? [
            Prisma.sql`(mi.local_origem_id = ${f.localId}::uuid OR mi.local_destino_id = ${f.localId}::uuid)`,
          ]
        : []),
    ];
    const linhas = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT m.data_movimentacao AS data, m.numero, m.motivo::text AS motivo, p.sku, p.nome AS produto,
             COALESCE(lo.codigo, ld.codigo) AS local,
             CASE WHEN mi.local_origem_id IS NOT NULL THEN -mi.quantidade ELSE mi.quantidade END AS quantidade,
             CASE WHEN mi.local_origem_id IS NOT NULL THEN -mi.valor_total ELSE mi.valor_total END AS valor,
             COALESCE(us.nome, 'sistema') AS responsavel, m.observacao
        FROM movimentacao_itens mi
        JOIN movimentacoes m ON m.id = mi.movimentacao_id
        JOIN produtos p ON p.id = mi.produto_id
        LEFT JOIN locais_armazenamento lo ON lo.id = mi.local_origem_id
        LEFT JOIN locais_armazenamento ld ON ld.id = mi.local_destino_id
        LEFT JOIN usuarios us ON us.id = m.usuario_id
        ${this.onde(c)}
       ORDER BY m.data_movimentacao DESC
       LIMIT ${f.limite}`;
    const dados: Record<string, unknown>[] = linhas.map((l) => ({
      ...normalizarLinha(l),
      motivo: ROTULOS_MOTIVO[l.motivo as keyof typeof ROTULOS_MOTIVO],
    }));
    const perdas = dados
      .filter((d) => d.motivo === ROTULOS_MOTIVO.PERDA || d.motivo === ROTULOS_MOTIVO.AVARIA)
      .reduce((t, d) => t + Number(d.valor ?? 0), 0);
    return {
      colunas: [
        { chave: 'data', titulo: 'Data/hora', tipo: 'dataHora', largura: 1.3 },
        { chave: 'numero', titulo: 'Nº', tipo: 'numero', largura: 0.6 },
        { chave: 'motivo', titulo: 'Motivo', tipo: 'texto', largura: 1.3 },
        { chave: 'sku', titulo: 'SKU', tipo: 'texto', largura: 1.1 },
        { chave: 'produto', titulo: 'Produto', tipo: 'texto', largura: 2 },
        { chave: 'local', titulo: 'Local', tipo: 'texto', largura: 0.8 },
        { chave: 'quantidade', titulo: 'Quantidade', tipo: 'quantidade' },
        { chave: 'valor', titulo: 'Valor', tipo: 'moeda' },
        { chave: 'responsavel', titulo: 'Responsável', tipo: 'texto', largura: 1.2 },
        { chave: 'observacao', titulo: 'Justificativa', tipo: 'texto', largura: 2.2 },
      ] satisfies Coluna[],
      linhas: dados,
      totais: { perdas: perdas.toFixed(2), saldoAjustes: this.somar(dados, 'valor') },
    };
  }

  private somar(linhas: Record<string, unknown>[], chave: string) {
    return linhas.reduce((t, l) => t + Number(l[chave] ?? 0), 0).toFixed(2);
  }

  private async descreverFiltros(f: FiltroRelatorio) {
    const d: Record<string, string> = {};
    const data = (x: Date) => x.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    if (f.dataInicio || f.dataFim) {
      d['Período'] =
        `${f.dataInicio ? data(f.dataInicio) : '…'} a ${f.dataFim ? data(f.dataFim) : '…'}`;
    }
    if (f.produtoId)
      d['Produto'] =
        (await this.prisma.produto.findUnique({ where: { id: f.produtoId } }))?.nome ?? '';
    if (f.categoriaId)
      d['Categoria'] =
        (await this.prisma.categoria.findUnique({ where: { id: f.categoriaId } }))?.nome ?? '';
    if (f.fornecedorId)
      d['Fornecedor'] =
        (await this.prisma.fornecedor.findUnique({ where: { id: f.fornecedorId } }))?.razaoSocial ??
        '';
    if (f.localId)
      d['Local'] =
        (await this.prisma.localArmazenamento.findUnique({ where: { id: f.localId } }))?.codigo ??
        '';
    if (f.tipo) d['Tipo'] = ROTULOS_TIPO_MOVIMENTACAO[f.tipo];
    if (f.motivo) d['Motivo'] = ROTULOS_MOTIVO[f.motivo];
    if (f.dias) d['Janela'] = `${f.dias} dias`;
    return d;
  }
}
