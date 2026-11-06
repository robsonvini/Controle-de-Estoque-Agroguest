import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ListarProdutosQuery, ProdutoInput } from '@estoque/shared';
import { Prisma } from '../../generated/prisma/client';
import type { ContextoAtor } from '../../common/auth/tipos';
import { conflito, naoEncontrado, regraNegocio } from '../../common/erros';
import { resultadoPaginado } from '../../common/paginacao';
import {
  normalizarLinha,
  SQL_SALDO_POR_PRODUTO,
  SQL_SITUACAO,
  sqlCategoriaComFilhas,
  sqlFiltroSituacao,
  termoBusca,
} from '../../common/sql';
import { PrismaService } from '../../prisma/prisma.service';
import { ArmazenamentoService, detectarImagem } from '../arquivos/armazenamento.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

const ORDENACAO: Record<string, Prisma.Sql> = {
  nome: Prisma.sql`p.nome`,
  sku: Prisma.sql`p.sku`,
  codigoInterno: Prisma.sql`p.codigo_interno`,
  disponivel: Prisma.sql`COALESCE(s.disponivel, 0)`,
  criadoEm: Prisma.sql`p.criado_em`,
};

const MAX_IMAGENS = 10;
const MAX_BYTES_IMAGEM = 5 * 1024 * 1024;

@Injectable()
export class ProdutosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly arquivos: ArmazenamentoService,
  ) {}

  async listar(q: ListarProdutosQuery) {
    const condicoes: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (q.status) condicoes.push(Prisma.sql`p.status = ${q.status}::"StatusProduto"`);
    if (q.categoriaId)
      condicoes.push(sqlCategoriaComFilhas(Prisma.sql`p.categoria_id`, q.categoriaId));
    if (q.fornecedorId) {
      condicoes.push(
        Prisma.sql`EXISTS (SELECT 1 FROM produto_fornecedores pf WHERE pf.produto_id = p.id AND pf.fornecedor_id = ${q.fornecedorId}::uuid)`,
      );
    }
    if (q.busca) {
      const termo = termoBusca(q.busca);
      condicoes.push(
        Prisma.sql`(p.nome ILIKE ${termo} OR p.sku ILIKE ${termo} OR p.codigo_interno ILIKE ${termo} OR p.codigo_barras = ${q.busca})`,
      );
    }
    const ordem = ORDENACAO[q.ordenarPor ?? 'nome'] ?? ORDENACAO.nome!;
    const direcao = q.ordem === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;

    const linhas = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT p.id, p.codigo_interno AS "codigoInterno", p.sku, p.codigo_barras AS "codigoBarras",
             p.nome, p.status, p.estoque_minimo AS "estoqueMinimo", p.estoque_maximo AS "estoqueMaximo",
             p.custo_medio AS "custoMedio", p.preco_venda AS "precoVenda",
             c.id AS "categoriaId", c.nome AS "categoriaNome",
             u.sigla AS "unidadeSigla", u.casas_decimais AS "casasDecimais",
             COALESCE(s.quantidade, 0) AS quantidade,
             COALESCE(s.reservado, 0) AS reservado,
             COALESCE(s.disponivel, 0) AS disponivel,
             ${SQL_SITUACAO} AS situacao,
             (SELECT pi.chave FROM produto_imagens pi WHERE pi.produto_id = p.id ORDER BY pi.ordem, pi.criado_em LIMIT 1) AS "imagemChave",
             COUNT(*) OVER() AS "totalRegistros"
        FROM produtos p
        JOIN unidades_medida u ON u.id = p.unidade_medida_id
        LEFT JOIN categorias c ON c.id = p.categoria_id
        LEFT JOIN ${SQL_SALDO_POR_PRODUTO} s ON s.produto_id = p.id
       WHERE ${Prisma.join(condicoes, ' AND ')} ${sqlFiltroSituacao(q.situacaoEstoque)}
       ORDER BY ${ordem} ${direcao}, p.id
       LIMIT ${q.porPagina} OFFSET ${(q.pagina - 1) * q.porPagina}`;

    const total = linhas.length ? Number(linhas[0]!.totalRegistros) : 0;
    const dados = await Promise.all(
      linhas.map(async (l) => {
        const { totalRegistros: _t, imagemChave, ...resto } = normalizarLinha(l);
        return {
          ...resto,
          imagemUrl: imagemChave ? await this.arquivos.urlAssinada(String(imagemChave)) : null,
        };
      }),
    );
    return resultadoPaginado(dados, total, q);
  }

  async obter(id: string) {
    const p = await this.prisma.produto.findUnique({
      where: { id },
      include: {
        categoria: { select: { id: true, nome: true } },
        unidadeMedida: true,
        localPadrao: { select: { id: true, codigo: true, nome: true } },
        imagens: { orderBy: [{ ordem: 'asc' }, { criadoEm: 'asc' }] },
        fornecedores: {
          include: {
            fornecedor: {
              select: { id: true, razaoSocial: true, nomeFantasia: true, situacao: true },
            },
          },
        },
        saldos: {
          include: { local: { select: { id: true, codigo: true, nome: true, ativo: true } } },
          orderBy: { local: { codigo: 'asc' } },
        },
      },
    });
    if (!p) throw naoEncontrado('Produto');

    const quantidade = p.saldos.reduce((t, s) => t.add(s.quantidade), new Prisma.Decimal(0));
    const reservado = p.saldos.reduce((t, s) => t.add(s.reservado), new Prisma.Decimal(0));
    const disponivel = quantidade.sub(reservado);
    const situacao = disponivel.lte(0)
      ? 'ESGOTADO'
      : p.estoqueMinimo.gt(0) && disponivel.lte(p.estoqueMinimo)
        ? 'BAIXO'
        : 'DISPONIVEL';

    return {
      ...p,
      saldos: p.saldos.map((s) => ({ ...s, disponivel: s.quantidade.sub(s.reservado) })),
      imagens: await Promise.all(
        p.imagens.map(async (i) => ({ ...i, url: await this.arquivos.urlAssinada(i.chave) })),
      ),
      totais: {
        quantidade,
        reservado,
        disponivel,
        valorEstoque: quantidade.mul(p.custoMedio).toDecimalPlaces(2),
      },
      situacao,
    };
  }

  /** Busca exata por código de barras, SKU ou código interno (leitores de código de barras). */
  async buscarPorCodigo(codigo: string) {
    const termo = codigo.trim();
    const p = await this.prisma.produto.findFirst({
      where: {
        OR: [{ codigoBarras: termo }, { sku: termo.toUpperCase() }, { codigoInterno: termo }],
      },
      select: { id: true },
    });
    if (!p) throw naoEncontrado('Produto');
    return this.obter(p.id);
  }

  async criar(dados: ProdutoInput, ator: ContextoAtor) {
    await this.validarReferencias(dados);
    const { fornecedores, ...campos } = dados;
    const produto = await this.prisma.$transaction(async (tx) => {
      const p = await tx.produto.create({
        data: {
          ...campos,
          custoMedio: campos.precoCusto,
          fornecedores: { create: this.normalizarFornecedores(fornecedores) },
        },
      });
      await this.auditoria.registrar(
        ator,
        { acao: 'CRIAR', entidade: 'produto', entidadeId: p.id, dados },
        tx,
      );
      return p;
    });
    return this.obter(produto.id);
  }

  async atualizar(id: string, dados: ProdutoInput, ator: ContextoAtor) {
    const atual = await this.prisma.produto.findUnique({ where: { id } });
    if (!atual) throw naoEncontrado('Produto');
    await this.validarReferencias(dados, id);
    const { fornecedores, ...campos } = dados;

    if (campos.unidadeMedidaId !== atual.unidadeMedidaId) {
      const movimentos = await this.prisma.movimentacaoItem.count({ where: { produtoId: id } });
      if (movimentos > 0)
        throw regraNegocio(
          'Não é possível alterar a unidade de medida de um produto com movimentações.',
        );
    }

    await this.prisma.$transaction(async (tx) => {
      const saldo = await tx.saldoEstoque.aggregate({
        where: { produtoId: id },
        _sum: { quantidade: true },
      });
      const semEstoque = !saldo._sum.quantidade || saldo._sum.quantidade.lte(0);
      await tx.produto.update({
        where: { id },
        data: {
          ...campos,
          // Sem estoque, o custo médio acompanha o preço de custo informado
          ...(semEstoque && { custoMedio: campos.precoCusto }),
        },
      });
      await tx.produtoFornecedor.deleteMany({ where: { produtoId: id } });
      if (fornecedores.length) {
        await tx.produtoFornecedor.createMany({
          data: this.normalizarFornecedores(fornecedores).map((f) => ({ ...f, produtoId: id })),
        });
      }
      await this.auditoria.registrar(
        ator,
        {
          acao: 'ATUALIZAR',
          entidade: 'produto',
          entidadeId: id,
          dados: {
            antes: {
              nome: atual.nome,
              sku: atual.sku,
              status: atual.status,
              precoCusto: atual.precoCusto,
              precoVenda: atual.precoVenda,
              estoqueMinimo: atual.estoqueMinimo,
              estoqueMaximo: atual.estoqueMaximo,
            },
            depois: dados,
          },
        },
        tx,
      );
    });
    return this.obter(id);
  }

  async adicionarImagem(
    produtoId: string,
    arquivo: Express.Multer.File | undefined,
    textoAlternativo: string,
    ator: ContextoAtor,
  ) {
    await this.garantirExiste(produtoId);
    if (!arquivo) throw regraNegocio('Envie o arquivo da imagem no campo "arquivo".');
    if (arquivo.size > MAX_BYTES_IMAGEM) throw regraNegocio('A imagem deve ter no máximo 5 MB.');
    const mime = detectarImagem(arquivo.buffer);
    if (!mime) throw regraNegocio('Formato não suportado. Envie JPEG, PNG ou WEBP.');
    const total = await this.prisma.produtoImagem.count({ where: { produtoId } });
    if (total >= MAX_IMAGENS) throw regraNegocio(`Limite de ${MAX_IMAGENS} imagens por produto.`);

    const extensao = mime.split('/')[1];
    const chave = `produtos/${produtoId}/${randomUUID()}.${extensao}`;
    await this.arquivos.enviar(chave, arquivo.buffer, mime);
    const imagem = await this.prisma.produtoImagem.create({
      data: {
        produtoId,
        chave,
        mimeType: mime,
        nomeArquivo: arquivo.originalname.slice(0, 200),
        tamanhoBytes: arquivo.size,
        textoAlternativo,
        ordem: total,
      },
    });
    await this.auditoria.registrar(ator, {
      acao: 'ADICIONAR_IMAGEM',
      entidade: 'produto',
      entidadeId: produtoId,
      dados: { imagemId: imagem.id },
    });
    return { ...imagem, url: await this.arquivos.urlAssinada(chave) };
  }

  async removerImagem(produtoId: string, imagemId: string, ator: ContextoAtor) {
    const imagem = await this.prisma.produtoImagem.findFirst({
      where: { id: imagemId, produtoId },
    });
    if (!imagem) throw naoEncontrado('Imagem');
    await this.prisma.produtoImagem.delete({ where: { id: imagemId } });
    await this.arquivos.remover(imagem.chave).catch(() => undefined);
    await this.auditoria.registrar(ator, {
      acao: 'REMOVER_IMAGEM',
      entidade: 'produto',
      entidadeId: produtoId,
      dados: { imagemId },
    });
  }

  /** Histórico (kardex) de movimentações do produto com saldo acumulado. */
  async kardex(produtoId: string, localId?: string, limite = 200) {
    await this.garantirExiste(produtoId);
    const filtroLocal = localId
      ? Prisma.sql`AND (mi.local_origem_id = ${localId}::uuid OR mi.local_destino_id = ${localId}::uuid)`
      : Prisma.empty;
    const variacao = localId
      ? Prisma.sql`(CASE WHEN mi.local_destino_id = ${localId}::uuid THEN mi.quantidade ELSE 0 END
                  - CASE WHEN mi.local_origem_id = ${localId}::uuid THEN mi.quantidade ELSE 0 END)`
      : Prisma.sql`(CASE WHEN mi.local_destino_id IS NOT NULL THEN mi.quantidade ELSE 0 END
                  - CASE WHEN mi.local_origem_id IS NOT NULL THEN mi.quantidade ELSE 0 END)`;
    const linhas = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM (
        SELECT m.id AS "movimentacaoId", m.numero, m.tipo, m.motivo, m.data_movimentacao AS "dataMovimentacao",
               u.nome AS "usuarioNome", lo.codigo AS "localOrigem", ld.codigo AS "localDestino",
               mi.quantidade, mi.custo_unitario AS "custoUnitario", ${variacao} AS variacao,
               SUM(${variacao}) OVER (ORDER BY m.data_movimentacao, m.numero, mi.id) AS "saldoAcumulado"
          FROM movimentacao_itens mi
          JOIN movimentacoes m ON m.id = mi.movimentacao_id
          LEFT JOIN usuarios u ON u.id = m.usuario_id
          LEFT JOIN locais_armazenamento lo ON lo.id = mi.local_origem_id
          LEFT JOIN locais_armazenamento ld ON ld.id = mi.local_destino_id
         WHERE mi.produto_id = ${produtoId}::uuid ${filtroLocal}
      ) k
      ORDER BY k."dataMovimentacao" DESC, k.numero DESC
      LIMIT ${limite}`;
    return linhas.map(normalizarLinha);
  }

  private async garantirExiste(id: string) {
    const existe = await this.prisma.produto.count({ where: { id } });
    if (!existe) throw naoEncontrado('Produto');
  }

  private async validarReferencias(dados: ProdutoInput, ignorarId?: string) {
    const unidade = await this.prisma.unidadeMedida.findUnique({
      where: { id: dados.unidadeMedidaId },
    });
    if (!unidade) throw regraNegocio('Unidade de medida inexistente.');
    if (!unidade.ativo && !ignorarId) throw regraNegocio('A unidade de medida está inativa.');
    if (
      dados.categoriaId &&
      !(await this.prisma.categoria.count({ where: { id: dados.categoriaId } }))
    ) {
      throw regraNegocio('Categoria inexistente.');
    }
    if (
      dados.localPadraoId &&
      !(await this.prisma.localArmazenamento.count({ where: { id: dados.localPadraoId } }))
    ) {
      throw regraNegocio('Local padrão inexistente.');
    }
    if (dados.fornecedores.length) {
      const ids = dados.fornecedores.map((f) => f.fornecedorId);
      const encontrados = await this.prisma.fornecedor.count({ where: { id: { in: ids } } });
      if (encontrados !== ids.length) throw regraNegocio('Fornecedor inexistente na lista.');
    }
    const duplicado = await this.prisma.produto.findFirst({
      where: {
        id: ignorarId ? { not: ignorarId } : undefined,
        OR: [
          { sku: dados.sku },
          { codigoInterno: dados.codigoInterno },
          ...(dados.codigoBarras ? [{ codigoBarras: dados.codigoBarras }] : []),
        ],
      },
      select: { sku: true, codigoInterno: true, codigoBarras: true },
    });
    if (duplicado) {
      const campo =
        duplicado.sku === dados.sku
          ? 'SKU'
          : duplicado.codigoInterno === dados.codigoInterno
            ? 'código interno'
            : 'código de barras';
      throw conflito(`Já existe um produto com este ${campo}.`);
    }
  }

  private normalizarFornecedores(lista: ProdutoInput['fornecedores']) {
    const temPrincipal = lista.some((f) => f.principal);
    return lista.map((f, i) => ({
      fornecedorId: f.fornecedorId,
      codigoNoFornecedor: f.codigoNoFornecedor,
      prazoEntregaDias: f.prazoEntregaDias ?? null,
      principal: temPrincipal ? f.principal : i === 0,
    }));
  }
}
