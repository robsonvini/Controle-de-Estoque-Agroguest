import { Injectable } from '@nestjs/common';
import {
  listarAjustesSchema,
  listarInventariosSchema,
  type AjusteInput,
  type ContagemInput,
  type InventarioInput,
} from '@estoque/shared';
import { z } from 'zod';
import { Prisma, type MotivoMovimentacao } from '../../generated/prisma/client';
import type { ContextoAtor, UsuarioAutenticado } from '../../common/auth/tipos';
import { naoEncontrado, regraNegocio } from '../../common/erros';
import { paginar, resultadoPaginado } from '../../common/paginacao';
import { sqlCategoriaComFilhas } from '../../common/sql';
import { PrismaService, type Tx } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { MotorEstoqueService } from '../estoque/motor-estoque.service';
import { TAREFAS, TarefasService } from '../tarefas/tarefas.service';

const D = Prisma.Decimal;
const STATUS_ABERTOS = ['EM_CONTAGEM', 'EM_REVISAO'] as const;

@Injectable()
export class InventariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly motor: MotorEstoqueService,
    private readonly tarefas: TarefasService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // =========================== Inventários ===========================

  async listar(q: z.infer<typeof listarInventariosSchema>) {
    const where: Prisma.InventarioWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.busca && { descricao: { contains: q.busca, mode: 'insensitive' } }),
    };
    const [dados, total] = await Promise.all([
      this.prisma.inventario.findMany({
        where,
        include: {
          local: { select: { codigo: true, nome: true } },
          categoria: { select: { nome: true } },
          criadoPor: { select: { nome: true } },
          _count: { select: { itens: true } },
        },
        orderBy: { numero: 'desc' },
        ...paginar(q),
      }),
      this.prisma.inventario.count({ where }),
    ]);
    const ids = dados.map((d) => d.id);
    const contagens = ids.length
      ? await this.prisma.inventarioItem.groupBy({
          by: ['inventarioId'],
          where: { inventarioId: { in: ids }, quantidadeContada: { not: null } },
          _count: true,
        })
      : [];
    const divergentes = ids.length
      ? await this.prisma.inventarioItem.groupBy({
          by: ['inventarioId'],
          where: { inventarioId: { in: ids }, divergencia: { not: 0 } },
          _count: true,
        })
      : [];
    const mapa = (l: { inventarioId: string; _count: number }[]) =>
      new Map(l.map((x) => [x.inventarioId, x._count]));
    const contados = mapa(contagens);
    const diverg = mapa(divergentes);
    return resultadoPaginado(
      dados.map((d) => ({
        ...d,
        itensContados: contados.get(d.id) ?? 0,
        itensDivergentes: diverg.get(d.id) ?? 0,
      })),
      total,
      q,
    );
  }

  /** Durante a contagem, o saldo do sistema é ocultado (contagem às cegas). */
  async obter(id: string) {
    const inv = await this.prisma.inventario.findUnique({
      where: { id },
      include: {
        local: { select: { id: true, codigo: true, nome: true } },
        categoria: { select: { id: true, nome: true } },
        criadoPor: { select: { id: true, nome: true } },
        itens: {
          include: {
            produto: {
              select: {
                id: true,
                sku: true,
                nome: true,
                codigoBarras: true,
                unidadeMedida: { select: { sigla: true, casasDecimais: true } },
              },
            },
            local: { select: { id: true, codigo: true, nome: true } },
            contadoPor: { select: { nome: true } },
          },
          orderBy: [{ local: { codigo: 'asc' } }, { produto: { nome: 'asc' } }],
        },
        ajustes: {
          select: { id: true, numero: true, status: true, solicitadoEm: true, decididoEm: true },
        },
      },
    });
    if (!inv) throw naoEncontrado('Inventário');
    const cego = inv.status === 'EM_CONTAGEM';
    return {
      ...inv,
      contagemCega: cego,
      itens: inv.itens.map((i) =>
        cego ? { ...i, quantidadeSistema: null, divergencia: null } : i,
      ),
      resumo: {
        totalItens: inv.itens.length,
        contados: inv.itens.filter((i) => i.quantidadeContada !== null).length,
        divergentes: inv.itens.filter((i) => i.divergencia && !i.divergencia.isZero()).length,
      },
    };
  }

  async criar(dados: InventarioInput, ator: ContextoAtor) {
    const conflitante = await this.prisma.inventario.findFirst({
      where: {
        status: { in: [...STATUS_ABERTOS] },
        OR: [{ localId: null }, ...(dados.localId ? [{ localId: dados.localId }] : [{}])],
      },
      select: { numero: true },
    });
    if (conflitante) {
      throw regraNegocio(
        `Já existe inventário aberto (nº ${conflitante.numero}) para este escopo. Finalize-o antes.`,
      );
    }

    const id = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.inventario.create({
        data: {
          descricao: dados.descricao,
          localId: dados.localId,
          categoriaId: dados.categoriaId,
          observacao: dados.observacao,
          criadoPorId: ator.usuarioId!,
        },
      });
      const pares = await this.itensDoEscopo(tx, dados);
      if (!pares.length) throw regraNegocio('Nenhum item encontrado para o escopo informado.');
      await tx.inventarioItem.createMany({
        data: pares.map((p) => ({
          inventarioId: inv.id,
          produtoId: p.produto_id,
          localId: p.local_id,
        })),
      });
      await this.auditoria.registrar(
        ator,
        {
          acao: 'CRIAR',
          entidade: 'inventario',
          entidadeId: inv.id,
          dados: { ...dados, itens: pares.length },
        },
        tx,
      );
      return inv.id;
    });
    return this.obter(id);
  }

  /** Registra contagens. O saldo do sistema é fotografado no momento da contagem de cada item. */
  async registrarContagens(id: string, dados: ContagemInput, ator: ContextoAtor) {
    await this.prisma.$transaction(async (tx) => {
      const inv = await this.travar(tx, id);
      if (inv.status !== 'EM_CONTAGEM') throw regraNegocio('O inventário não está em contagem.');
      for (const c of dados.itens) {
        const item = await tx.inventarioItem.findFirst({
          where: { id: c.itemId, inventarioId: id },
        });
        if (!item) throw regraNegocio('Item não pertence ao inventário.');
        const saldo = await tx.saldoEstoque.findUnique({
          where: { produtoId_localId: { produtoId: item.produtoId, localId: item.localId } },
        });
        const sistema = saldo?.quantidade ?? new D(0);
        const contada = new D(c.quantidadeContada);
        await tx.inventarioItem.update({
          where: { id: item.id },
          data: {
            quantidadeSistema: sistema,
            quantidadeContada: contada,
            divergencia: contada.sub(sistema),
            contadoPorId: ator.usuarioId,
            contadoEm: new Date(),
          },
        });
      }
      await this.auditoria.registrar(
        ator,
        {
          acao: 'REGISTRAR_CONTAGEM',
          entidade: 'inventario',
          entidadeId: id,
          dados: { itens: dados.itens.length },
        },
        tx,
      );
    });
    return this.obter(id);
  }

  async concluirContagem(id: string, ator: ContextoAtor) {
    await this.prisma.$transaction(async (tx) => {
      const inv = await this.travar(tx, id);
      if (inv.status !== 'EM_CONTAGEM') throw regraNegocio('O inventário não está em contagem.');
      const pendentes = await tx.inventarioItem.count({
        where: { inventarioId: id, quantidadeContada: null },
      });
      if (pendentes) throw regraNegocio(`Existem ${pendentes} item(ns) sem contagem.`);
      await tx.inventario.update({
        where: { id },
        data: { status: 'EM_REVISAO', revisadoEm: new Date() },
      });
      const divergentes = await tx.inventarioItem.count({
        where: { inventarioId: id, divergencia: { not: 0 } },
      });
      if (divergentes) {
        await this.tarefas.enfileirar(
          TAREFAS.INVENTARIO_DIVERGENCIA,
          { inventarioId: id, divergentes },
          {},
          tx,
        );
      }
      await this.auditoria.registrar(
        ator,
        {
          acao: 'CONCLUIR_CONTAGEM',
          entidade: 'inventario',
          entidadeId: id,
          dados: { divergentes },
        },
        tx,
      );
    });
    return this.obter(id);
  }

  /** Volta para contagem (recontagem) quando não há ajuste pendente. */
  async reabrir(id: string, ator: ContextoAtor) {
    await this.prisma.$transaction(async (tx) => {
      const inv = await this.travar(tx, id);
      if (inv.status !== 'EM_REVISAO')
        throw regraNegocio('Somente inventários em revisão podem ser reabertos.');
      if (await tx.ajuste.count({ where: { inventarioId: id, status: 'PENDENTE' } })) {
        throw regraNegocio('Há ajuste pendente de aprovação para este inventário.');
      }
      await tx.inventario.update({ where: { id }, data: { status: 'EM_CONTAGEM' } });
      await this.auditoria.registrar(
        ator,
        { acao: 'REABRIR', entidade: 'inventario', entidadeId: id },
        tx,
      );
    });
    return this.obter(id);
  }

  /** Gera a solicitação de ajuste com as divergências; sem divergências, finaliza o inventário. */
  async solicitarAjuste(id: string, justificativa: string, ator: ContextoAtor) {
    const ajusteId = await this.prisma.$transaction(async (tx) => {
      const inv = await this.travar(tx, id);
      if (inv.status !== 'EM_REVISAO') throw regraNegocio('O inventário precisa estar em revisão.');
      if (await tx.ajuste.count({ where: { inventarioId: id, status: 'PENDENTE' } })) {
        throw regraNegocio('Já existe ajuste pendente para este inventário.');
      }
      const divergentes = await tx.inventarioItem.findMany({
        where: { inventarioId: id, divergencia: { not: 0 } },
      });
      if (!divergentes.length) {
        await tx.inventario.update({
          where: { id },
          data: { status: 'FINALIZADO', finalizadoEm: new Date() },
        });
        await this.auditoria.registrar(
          ator,
          { acao: 'FINALIZAR', entidade: 'inventario', entidadeId: id },
          tx,
        );
        return null;
      }
      const ajuste = await tx.ajuste.create({
        data: {
          origem: 'INVENTARIO',
          inventarioId: id,
          justificativa,
          solicitadoPorId: ator.usuarioId!,
          itens: {
            create: divergentes.map((d) => ({
              produtoId: d.produtoId,
              localId: d.localId,
              quantidadeDelta: d.divergencia!,
              quantidadeSistema: d.quantidadeSistema,
              quantidadeContada: d.quantidadeContada,
            })),
          },
        },
      });
      await this.tarefas.enfileirar(TAREFAS.AJUSTE_SOLICITADO, { ajusteId: ajuste.id }, {}, tx);
      await this.auditoria.registrar(
        ator,
        {
          acao: 'SOLICITAR_AJUSTE',
          entidade: 'inventario',
          entidadeId: id,
          dados: { ajusteId: ajuste.id },
        },
        tx,
      );
      return ajuste.id;
    });
    return { inventario: await this.obter(id), ajusteId };
  }

  async cancelar(id: string, ator: ContextoAtor) {
    await this.prisma.$transaction(async (tx) => {
      const inv = await this.travar(tx, id);
      if (!STATUS_ABERTOS.includes(inv.status as (typeof STATUS_ABERTOS)[number])) {
        throw regraNegocio('Somente inventários abertos podem ser cancelados.');
      }
      if (await tx.ajuste.count({ where: { inventarioId: id, status: 'PENDENTE' } })) {
        throw regraNegocio('Há ajuste pendente: rejeite-o antes de cancelar.');
      }
      await tx.inventario.update({
        where: { id },
        data: { status: 'CANCELADO', finalizadoEm: new Date() },
      });
      await this.auditoria.registrar(
        ator,
        { acao: 'CANCELAR', entidade: 'inventario', entidadeId: id },
        tx,
      );
    });
    return this.obter(id);
  }

  // ============================= Ajustes =============================

  async listarAjustes(q: z.infer<typeof listarAjustesSchema>) {
    const where: Prisma.AjusteWhereInput = { ...(q.status && { status: q.status }) };
    const [dados, total] = await Promise.all([
      this.prisma.ajuste.findMany({
        where,
        include: {
          solicitadoPor: { select: { nome: true } },
          decididoPor: { select: { nome: true } },
          inventario: { select: { numero: true, descricao: true } },
          _count: { select: { itens: true } },
        },
        orderBy: { numero: 'desc' },
        ...paginar(q),
      }),
      this.prisma.ajuste.count({ where }),
    ]);
    return resultadoPaginado(dados, total, q);
  }

  async obterAjuste(id: string) {
    const a = await this.prisma.ajuste.findUnique({
      where: { id },
      include: {
        solicitadoPor: { select: { id: true, nome: true } },
        decididoPor: { select: { id: true, nome: true } },
        inventario: { select: { id: true, numero: true, descricao: true } },
        movimentacao: { select: { id: true, numero: true } },
        itens: {
          include: {
            produto: {
              select: {
                id: true,
                sku: true,
                nome: true,
                custoMedio: true,
                unidadeMedida: { select: { sigla: true } },
              },
            },
            local: { select: { id: true, codigo: true, nome: true } },
          },
        },
      },
    });
    if (!a) throw naoEncontrado('Ajuste');
    const impacto = a.itens.reduce(
      (t, i) => t.add(i.quantidadeDelta.mul(i.produto.custoMedio)),
      new D(0),
    );
    return { ...a, impactoFinanceiro: impacto.toDecimalPlaces(2) };
  }

  async solicitarAjusteManual(dados: AjusteInput, ator: ContextoAtor) {
    const id = await this.prisma.$transaction(async (tx) => {
      const itens = [];
      for (const i of dados.itens) {
        const saldo = await tx.saldoEstoque.findUnique({
          where: { produtoId_localId: { produtoId: i.produtoId, localId: i.localId } },
        });
        itens.push({ ...i, quantidadeSistema: saldo?.quantidade ?? new D(0) });
      }
      const ajuste = await tx.ajuste.create({
        data: {
          origem: 'MANUAL',
          justificativa: dados.justificativa,
          solicitadoPorId: ator.usuarioId!,
          itens: { create: itens },
        },
      });
      await this.tarefas.enfileirar(TAREFAS.AJUSTE_SOLICITADO, { ajusteId: ajuste.id }, {}, tx);
      await this.auditoria.registrar(
        ator,
        { acao: 'SOLICITAR', entidade: 'ajuste', entidadeId: ajuste.id, dados },
        tx,
      );
      return ajuste.id;
    });
    return this.obterAjuste(id);
  }

  /** Aprovação com segregação de funções: o aprovador deve ser diferente do solicitante. */
  async aprovarAjuste(id: string, aprovador: UsuarioAutenticado, ator: ContextoAtor) {
    await this.prisma.$transaction(async (tx) => {
      const [ajuste] = await tx.$queryRaw<
        {
          status: string;
          solicitado_por_id: string;
          origem: string;
          inventario_id: string | null;
        }[]
      >`
        SELECT status::text AS status, solicitado_por_id, origem::text AS origem, inventario_id
          FROM ajustes WHERE id = ${id}::uuid FOR UPDATE`;
      if (!ajuste) throw naoEncontrado('Ajuste');
      if (ajuste.status !== 'PENDENTE') throw regraNegocio('O ajuste já foi decidido.');
      if (ajuste.solicitado_por_id === aprovador.id) {
        throw regraNegocio(
          'O ajuste deve ser aprovado por usuário diferente do solicitante (segregação de funções).',
        );
      }
      const itens = await tx.ajusteItem.findMany({ where: { ajusteId: id } });
      const positivos = itens.every((i) => i.quantidadeDelta.gt(0));
      const negativos = itens.every((i) => i.quantidadeDelta.lt(0));
      const motivo: MotivoMovimentacao =
        ajuste.origem === 'INVENTARIO'
          ? 'AJUSTE_INVENTARIO'
          : positivos
            ? 'AJUSTE_POSITIVO'
            : negativos
              ? 'AJUSTE_NEGATIVO'
              : 'AJUSTE_INVENTARIO';

      await tx.ajuste.update({
        where: { id },
        data: { status: 'APROVADO', decididoPorId: aprovador.id, decididoEm: new Date() },
      });
      await this.motor.registrar(tx, {
        tipo: 'AJUSTE',
        motivo,
        origem: 'AJUSTE',
        ator,
        ajusteId: id,
        permitirProdutoInativo: true,
        observacao: `Ajuste aprovado por ${aprovador.nome}`,
        itens: itens.map((i) => ({
          produtoId: i.produtoId,
          ...(i.quantidadeDelta.gt(0)
            ? { localDestinoId: i.localId }
            : { localOrigemId: i.localId }),
          quantidade: i.quantidadeDelta.abs(),
        })),
      });
      if (ajuste.inventario_id) {
        await tx.inventario.update({
          where: { id: ajuste.inventario_id },
          data: { status: 'FINALIZADO', finalizadoEm: new Date() },
        });
      }
      await tx.notificacao.updateMany({
        where: { chaveDeduplicacao: `ajuste:${id}`, resolvida: false },
        data: { resolvida: true, resolvidaEm: new Date() },
      });
      await this.auditoria.registrar(
        ator,
        { acao: 'APROVAR', entidade: 'ajuste', entidadeId: id },
        tx,
      );
    });
    return this.obterAjuste(id);
  }

  async rejeitarAjuste(
    id: string,
    motivo: string,
    aprovador: UsuarioAutenticado,
    ator: ContextoAtor,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.ajuste.updateMany({
        where: { id, status: 'PENDENTE', solicitadoPorId: { not: aprovador.id } },
        data: {
          status: 'REJEITADO',
          decididoPorId: aprovador.id,
          decididoEm: new Date(),
          motivoRejeicao: motivo,
        },
      });
      if (!r.count) {
        throw regraNegocio(
          'O ajuste não está pendente ou foi solicitado por você (segregação de funções).',
        );
      }
      await tx.notificacao.updateMany({
        where: { chaveDeduplicacao: `ajuste:${id}`, resolvida: false },
        data: { resolvida: true, resolvidaEm: new Date() },
      });
      await this.auditoria.registrar(
        ator,
        { acao: 'REJEITAR', entidade: 'ajuste', entidadeId: id, dados: { motivo } },
        tx,
      );
    });
    return this.obterAjuste(id);
  }

  // ============================ Auxiliares ============================

  private async travar(tx: Tx, id: string) {
    const [inv] = await tx.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM inventarios WHERE id = ${id}::uuid FOR UPDATE`;
    if (!inv) throw naoEncontrado('Inventário');
    return inv;
  }

  private async itensDoEscopo(tx: Tx, dados: InventarioInput) {
    const filtroCategoria = dados.categoriaId
      ? Prisma.sql`AND ${sqlCategoriaComFilhas(Prisma.sql`p.categoria_id`, dados.categoriaId)}`
      : Prisma.empty;
    if (dados.incluirSemSaldo && dados.localId) {
      // Todos os produtos ativos no local (inclusive sem saldo), para detectar itens não registrados
      return tx.$queryRaw<{ produto_id: string; local_id: string }[]>`
        SELECT p.id AS produto_id, ${dados.localId}::uuid AS local_id
          FROM produtos p
         WHERE p.status = 'ATIVO' ${filtroCategoria}
        UNION
        SELECT s.produto_id, s.local_id FROM saldos_estoque s
          JOIN produtos p ON p.id = s.produto_id
         WHERE s.local_id = ${dados.localId}::uuid AND s.quantidade > 0 ${filtroCategoria}`;
    }
    const filtroLocal = dados.localId
      ? Prisma.sql`AND s.local_id = ${dados.localId}::uuid`
      : Prisma.empty;
    const filtroSaldo = dados.incluirSemSaldo ? Prisma.empty : Prisma.sql`AND s.quantidade > 0`;
    return tx.$queryRaw<{ produto_id: string; local_id: string }[]>`
      SELECT s.produto_id, s.local_id
        FROM saldos_estoque s
        JOIN produtos p ON p.id = s.produto_id
        JOIN locais_armazenamento l ON l.id = s.local_id AND l.ativo
       WHERE TRUE ${filtroLocal} ${filtroSaldo} ${filtroCategoria}`;
  }
}
