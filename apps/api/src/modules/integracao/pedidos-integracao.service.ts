import { Injectable } from '@nestjs/common';
import type { IntegracaoPedidoInput } from '@estoque/shared';
import { Prisma } from '../../generated/prisma/client';
import type { ContextoAtor } from '../../common/auth/tipos';
import { naoEncontrado, regraNegocio } from '../../common/erros';
import { resultadoPaginado } from '../../common/paginacao';
import { normalizarLinha, SQL_SALDO_POR_PRODUTO, SQL_SITUACAO, termoBusca } from '../../common/sql';
import { PrismaService } from '../../prisma/prisma.service';
import { PedidosService } from '../pedidos/pedidos.service';
import { CrmSyncService } from './crm-sync.service';

type PedidoInterno = Awaited<ReturnType<PedidosService['obter']>>;

/** Representação pública (contrato da API de integração) de um pedido. */
export function pedidoExterno(p: PedidoInterno) {
  return {
    id: p.id,
    numero: p.numero.toString(),
    idExterno: p.idExterno,
    status: p.status,
    clienteCrmId: p.clienteCrm?.crmId ?? null,
    valorTotal: p.valorTotal.toString(),
    itens: p.itens.map((i) => ({
      sku: i.produto.sku,
      localCodigo: i.local.codigo,
      quantidade: i.quantidade.toString(),
      precoUnitario: i.precoUnitario.toString(),
    })),
    criadoEm: p.criadoEm,
    confirmadoEm: p.confirmadoEm,
    canceladoEm: p.canceladoEm,
    motivoCancelamento: p.motivoCancelamento,
  };
}

@Injectable()
export class PedidosIntegracaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pedidos: PedidosService,
    private readonly sync: CrmSyncService,
  ) {}

  async criar(dados: IntegracaoPedidoInput, ator: ContextoAtor, _viaWebhook = false) {
    const skus = [...new Set(dados.itens.map((i) => i.sku))];
    const produtos = await this.prisma.produto.findMany({
      where: { sku: { in: skus } },
      select: { id: true, sku: true },
    });
    const porSku = new Map(produtos.map((p) => [p.sku, p.id]));
    const faltando = skus.filter((s) => !porSku.has(s));
    if (faltando.length)
      throw regraNegocio(`SKU não cadastrado no estoque: ${faltando.join(', ')}`, {
        skus: faltando,
      });

    const codigos = [...new Set(dados.itens.map((i) => i.localCodigo).filter(Boolean))] as string[];
    const locais = codigos.length
      ? await this.prisma.localArmazenamento.findMany({
          where: { codigo: { in: codigos.map((c) => c.toUpperCase()) } },
        })
      : [];
    const porCodigo = new Map(locais.map((l) => [l.codigo, l.id]));

    const clienteCrmId = dados.clienteCrmId
      ? await this.sync.resolverClienteLocal(dados.clienteCrmId)
      : null;

    const r = await this.pedidos.criar(
      {
        origem: 'CRM_API',
        idExterno: dados.idExterno,
        clienteCrmId,
        observacao: dados.observacao,
        itens: dados.itens.map((i) => {
          const localId = i.localCodigo ? porCodigo.get(i.localCodigo.toUpperCase()) : null;
          if (i.localCodigo && !localId)
            throw regraNegocio(`Local não encontrado: ${i.localCodigo}`);
          return {
            produtoId: porSku.get(i.sku)!,
            localId,
            quantidade: i.quantidade,
            precoUnitario: i.precoUnitario,
          };
        }),
      },
      ator,
    );
    return { pedido: r.pedido, jaExistia: r.jaExistia };
  }

  async obter(idExterno: string) {
    return this.pedidos.obterPorExterno('CRM_API', idExterno);
  }

  async confirmar(idExterno: string, ator: ContextoAtor, _viaWebhook = false) {
    const p = await this.obter(idExterno);
    return this.pedidos.confirmar(p.id, ator);
  }

  async cancelar(idExterno: string, motivo: string, ator: ContextoAtor, _viaWebhook = false) {
    const p = await this.obter(idExterno);
    return this.pedidos.cancelar(p.id, { motivo }, ator);
  }

  /** Catálogo com disponibilidade (somente dados comerciais, sem custos). */
  async catalogo(q: {
    pagina: number;
    porPagina: number;
    busca?: string;
    incluirInativos?: boolean;
  }) {
    const condicoes: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (!q.incluirInativos) condicoes.push(Prisma.sql`p.status = 'ATIVO'`);
    if (q.busca) {
      const termo = termoBusca(q.busca);
      condicoes.push(Prisma.sql`(p.nome ILIKE ${termo} OR p.sku ILIKE ${termo})`);
    }
    const linhas = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT p.sku, p.nome, p.descricao, p.codigo_barras AS "codigoBarras", p.status,
             u.sigla AS unidade, c.nome AS categoria, p.preco_venda AS "precoVenda",
             COALESCE(s.disponivel, 0) AS disponivel, ${SQL_SITUACAO} AS situacao,
             p.atualizado_em AS "atualizadoEm", COUNT(*) OVER() AS "totalRegistros"
        FROM produtos p
        JOIN unidades_medida u ON u.id = p.unidade_medida_id
        LEFT JOIN categorias c ON c.id = p.categoria_id
        LEFT JOIN ${SQL_SALDO_POR_PRODUTO} s ON s.produto_id = p.id
       WHERE ${Prisma.join(condicoes, ' AND ')}
       ORDER BY p.sku
       LIMIT ${q.porPagina} OFFSET ${(q.pagina - 1) * q.porPagina}`;
    const total = linhas.length ? Number(linhas[0]!.totalRegistros) : 0;
    return resultadoPaginado(
      linhas.map((l) => {
        const { totalRegistros: _t, ...resto } = normalizarLinha(l);
        return resto;
      }),
      total,
      { pagina: q.pagina, porPagina: q.porPagina, ordem: 'asc' },
    );
  }

  async saldos(skus: string[]) {
    const normalizados = [...new Set(skus.map((s) => s.trim().toUpperCase()))];
    const linhas = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT p.sku, p.status, u.sigla AS unidade,
             COALESCE(SUM(se.quantidade), 0) AS quantidade,
             COALESCE(SUM(se.reservado), 0) AS reservado,
             COALESCE(SUM(se.quantidade - se.reservado), 0) AS disponivel,
             COALESCE(json_agg(json_build_object('localCodigo', l.codigo, 'disponivel', se.quantidade - se.reservado)
                               ORDER BY l.codigo) FILTER (WHERE se.quantidade > 0), '[]') AS "porLocal"
        FROM produtos p
        JOIN unidades_medida u ON u.id = p.unidade_medida_id
        LEFT JOIN saldos_estoque se ON se.produto_id = p.id
        LEFT JOIN locais_armazenamento l ON l.id = se.local_id
       WHERE p.sku = ANY(${normalizados}::text[])
       GROUP BY p.sku, p.status, u.sigla`;
    const encontrados = new Map(linhas.map((l) => [String(l.sku), normalizarLinha(l)]));
    return normalizados.map((sku) => encontrados.get(sku) ?? { sku, encontrado: false });
  }

  async saldo(sku: string) {
    const [r] = await this.saldos([sku]);
    if (!r || 'encontrado' in r) throw naoEncontrado('Produto');
    return r;
  }
}
