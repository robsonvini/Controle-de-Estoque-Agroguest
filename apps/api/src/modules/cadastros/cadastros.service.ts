import { Injectable } from '@nestjs/common';
import type { CategoriaInput, LocalInput, UnidadeMedidaInput } from '@estoque/shared';
import { z } from 'zod';
import { listarAtivosSchema } from '@estoque/shared';
import type { ContextoAtor } from '../../common/auth/tipos';
import { conflito, naoEncontrado, regraNegocio } from '../../common/erros';
import { ordenacao, paginar, resultadoPaginado } from '../../common/paginacao';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

type ListarAtivos = z.infer<typeof listarAtivosSchema>;

@Injectable()
export class CadastrosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // ============================ Categorias ============================

  async listarCategorias(q: ListarAtivos) {
    const where = {
      ...(q.ativo !== undefined && { ativo: q.ativo }),
      ...(q.busca && { nome: { contains: q.busca, mode: 'insensitive' as const } }),
    };
    const [dados, total] = await Promise.all([
      this.prisma.categoria.findMany({
        where,
        include: {
          pai: { select: { id: true, nome: true } },
          _count: { select: { produtos: true, filhas: true } },
        },
        orderBy: ordenacao(q, ['nome', 'criadoEm'], 'nome'),
        ...paginar(q),
      }),
      this.prisma.categoria.count({ where }),
    ]);
    return resultadoPaginado(dados, total, q);
  }

  /** Árvore completa (para seletores e filtros). */
  async arvoreCategorias() {
    const todas = await this.prisma.categoria.findMany({ orderBy: { nome: 'asc' } });
    type No = (typeof todas)[number] & { filhas: No[]; caminho: string };
    const mapa = new Map<string, No>(
      todas.map((c) => [c.id, { ...c, filhas: [], caminho: c.nome }]),
    );
    const raizes: No[] = [];
    for (const no of mapa.values()) {
      const pai = no.paiId ? mapa.get(no.paiId) : undefined;
      if (pai) pai.filhas.push(no);
      else raizes.push(no);
    }
    const preencher = (nos: No[], prefixo: string) =>
      nos.forEach((n) => {
        n.caminho = prefixo ? `${prefixo} › ${n.nome}` : n.nome;
        preencher(n.filhas, n.caminho);
      });
    preencher(raizes, '');
    return raizes;
  }

  async obterCategoria(id: string) {
    const c = await this.prisma.categoria.findUnique({ where: { id }, include: { pai: true } });
    if (!c) throw naoEncontrado('Categoria');
    return c;
  }

  async criarCategoria(dados: CategoriaInput, ator: ContextoAtor) {
    if (dados.paiId) await this.obterCategoria(dados.paiId);
    await this.garantirNomeCategoriaUnico(dados.nome, dados.paiId);
    const c = await this.prisma.categoria.create({ data: dados });
    await this.auditoria.registrar(ator, {
      acao: 'CRIAR',
      entidade: 'categoria',
      entidadeId: c.id,
      dados,
    });
    return c;
  }

  async atualizarCategoria(id: string, dados: CategoriaInput, ator: ContextoAtor) {
    const atual = await this.obterCategoria(id);
    if (dados.paiId) {
      await this.obterCategoria(dados.paiId);
      await this.impedirCiclo('categoria', id, dados.paiId);
    }
    await this.garantirNomeCategoriaUnico(dados.nome, dados.paiId, id);
    const c = await this.prisma.categoria.update({ where: { id }, data: dados });
    await this.auditoria.registrar(ator, {
      acao: 'ATUALIZAR',
      entidade: 'categoria',
      entidadeId: id,
      dados: { antes: { nome: atual.nome, paiId: atual.paiId, ativo: atual.ativo }, depois: dados },
    });
    return c;
  }

  async excluirCategoria(id: string, ator: ContextoAtor) {
    const c = await this.prisma.categoria.findUnique({
      where: { id },
      include: { _count: { select: { produtos: true, filhas: true, inventarios: true } } },
    });
    if (!c) throw naoEncontrado('Categoria');
    if (c._count.produtos || c._count.filhas || c._count.inventarios) {
      throw regraNegocio('A categoria está em uso. Desative-a em vez de excluir.');
    }
    await this.prisma.categoria.delete({ where: { id } });
    await this.auditoria.registrar(ator, {
      acao: 'EXCLUIR',
      entidade: 'categoria',
      entidadeId: id,
      dados: { nome: c.nome },
    });
  }

  private async garantirNomeCategoriaUnico(nome: string, paiId: string | null, ignorarId?: string) {
    const existente = await this.prisma.categoria.findFirst({
      where: {
        nome: { equals: nome, mode: 'insensitive' },
        paiId,
        ...(ignorarId && { id: { not: ignorarId } }),
      },
    });
    if (existente) throw conflito('Já existe uma categoria com este nome neste nível.');
  }

  // ============================ Unidades ============================

  async listarUnidades(q: ListarAtivos) {
    const where = {
      ...(q.ativo !== undefined && { ativo: q.ativo }),
      ...(q.busca && {
        OR: [
          { nome: { contains: q.busca, mode: 'insensitive' as const } },
          { sigla: { contains: q.busca, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [dados, total] = await Promise.all([
      this.prisma.unidadeMedida.findMany({
        where,
        include: { _count: { select: { produtos: true } } },
        orderBy: ordenacao(q, ['sigla', 'nome'], 'sigla'),
        ...paginar(q),
      }),
      this.prisma.unidadeMedida.count({ where }),
    ]);
    return resultadoPaginado(dados, total, q);
  }

  async criarUnidade(dados: UnidadeMedidaInput, ator: ContextoAtor) {
    const u = await this.prisma.unidadeMedida.create({ data: dados });
    await this.auditoria.registrar(ator, {
      acao: 'CRIAR',
      entidade: 'unidade_medida',
      entidadeId: u.id,
      dados,
    });
    return u;
  }

  async atualizarUnidade(id: string, dados: UnidadeMedidaInput, ator: ContextoAtor) {
    const atual = await this.prisma.unidadeMedida.findUnique({
      where: { id },
      include: { _count: { select: { produtos: true } } },
    });
    if (!atual) throw naoEncontrado('Unidade de medida');
    if (atual._count.produtos > 0 && dados.casasDecimais < atual.casasDecimais) {
      throw regraNegocio(
        'Não é possível reduzir as casas decimais de uma unidade já usada por produtos.',
      );
    }
    const u = await this.prisma.unidadeMedida.update({ where: { id }, data: dados });
    await this.auditoria.registrar(ator, {
      acao: 'ATUALIZAR',
      entidade: 'unidade_medida',
      entidadeId: id,
      dados,
    });
    return u;
  }

  async excluirUnidade(id: string, ator: ContextoAtor) {
    const u = await this.prisma.unidadeMedida.findUnique({
      where: { id },
      include: { _count: { select: { produtos: true } } },
    });
    if (!u) throw naoEncontrado('Unidade de medida');
    if (u._count.produtos)
      throw regraNegocio('A unidade está em uso. Desative-a em vez de excluir.');
    await this.prisma.unidadeMedida.delete({ where: { id } });
    await this.auditoria.registrar(ator, {
      acao: 'EXCLUIR',
      entidade: 'unidade_medida',
      entidadeId: id,
      dados: { sigla: u.sigla },
    });
  }

  // ============================ Locais ============================

  async listarLocais(q: ListarAtivos) {
    const where = {
      ...(q.ativo !== undefined && { ativo: q.ativo }),
      ...(q.busca && {
        OR: [
          { nome: { contains: q.busca, mode: 'insensitive' as const } },
          { codigo: { contains: q.busca, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [dados, total] = await Promise.all([
      this.prisma.localArmazenamento.findMany({
        where,
        include: { pai: { select: { id: true, codigo: true, nome: true } } },
        orderBy: ordenacao(q, ['codigo', 'nome', 'tipo'], 'codigo'),
        ...paginar(q),
      }),
      this.prisma.localArmazenamento.count({ where }),
    ]);
    return resultadoPaginado(dados, total, q);
  }

  async obterLocal(id: string) {
    const l = await this.prisma.localArmazenamento.findUnique({
      where: { id },
      include: { pai: true },
    });
    if (!l) throw naoEncontrado('Local de armazenamento');
    return l;
  }

  async criarLocal(dados: LocalInput, ator: ContextoAtor) {
    if (dados.paiId) await this.obterLocal(dados.paiId);
    const l = await this.prisma.localArmazenamento.create({ data: dados });
    await this.auditoria.registrar(ator, {
      acao: 'CRIAR',
      entidade: 'local',
      entidadeId: l.id,
      dados,
    });
    return l;
  }

  async atualizarLocal(id: string, dados: LocalInput, ator: ContextoAtor) {
    await this.obterLocal(id);
    if (dados.paiId) {
      await this.obterLocal(dados.paiId);
      await this.impedirCiclo('local', id, dados.paiId);
    }
    if (!dados.ativo) {
      const saldo = await this.prisma.saldoEstoque.aggregate({
        where: { localId: id },
        _sum: { quantidade: true },
      });
      if (saldo._sum.quantidade && saldo._sum.quantidade.gt(0)) {
        throw regraNegocio(
          'Não é possível desativar um local com saldo em estoque. Transfira os itens antes.',
        );
      }
    }
    const l = await this.prisma.localArmazenamento.update({ where: { id }, data: dados });
    await this.auditoria.registrar(ator, {
      acao: 'ATUALIZAR',
      entidade: 'local',
      entidadeId: id,
      dados,
    });
    return l;
  }

  async excluirLocal(id: string, ator: ContextoAtor) {
    const l = await this.obterLocal(id);
    const [filhos, saldos, movimentos] = await Promise.all([
      this.prisma.localArmazenamento.count({ where: { paiId: id } }),
      this.prisma.saldoEstoque.count({ where: { localId: id } }),
      this.prisma.movimentacaoItem.count({
        where: { OR: [{ localOrigemId: id }, { localDestinoId: id }] },
      }),
    ]);
    if (filhos || saldos || movimentos) {
      throw regraNegocio('O local possui histórico ou sublocais. Desative-o em vez de excluir.');
    }
    await this.prisma.localArmazenamento.delete({ where: { id } });
    await this.auditoria.registrar(ator, {
      acao: 'EXCLUIR',
      entidade: 'local',
      entidadeId: id,
      dados: { codigo: l.codigo },
    });
  }

  /** Impede que um registro seja definido como descendente de si mesmo. */
  private async impedirCiclo(tipo: 'categoria' | 'local', id: string, novoPaiId: string) {
    let atual: string | null = novoPaiId;
    for (let nivel = 0; atual && nivel < 50; nivel++) {
      if (atual === id)
        throw regraNegocio('Hierarquia inválida: o registro não pode ser pai de si mesmo.');
      const registro: { paiId: string | null } | null =
        tipo === 'categoria'
          ? await this.prisma.categoria.findUnique({
              where: { id: atual },
              select: { paiId: true },
            })
          : await this.prisma.localArmazenamento.findUnique({
              where: { id: atual },
              select: { paiId: true },
            });
      atual = registro?.paiId ?? null;
    }
  }
}
