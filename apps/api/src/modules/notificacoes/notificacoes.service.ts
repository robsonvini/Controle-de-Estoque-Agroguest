import { Injectable } from '@nestjs/common';
import { listarNotificacoesSchema, type Permissao } from '@estoque/shared';
import { z } from 'zod';
import { Prisma, type Severidade, type TipoNotificacao } from '../../generated/prisma/client';
import type { UsuarioAutenticado } from '../../common/auth/tipos';
import { paginar, resultadoPaginado } from '../../common/paginacao';
import { PrismaService, type Tx } from '../../prisma/prisma.service';
import { ConfiguracoesService } from '../configuracoes/configuracoes.service';
import { TAREFAS, TarefasService } from '../tarefas/tarefas.service';

export interface NovaNotificacao {
  tipo: TipoNotificacao;
  severidade: Severidade;
  titulo: string;
  mensagem: string;
  permissaoAlvo: Permissao;
  entidade?: string;
  entidadeId?: string;
  link?: string;
  /** Mesmo alerta não é repetido enquanto não for resolvido. */
  chaveDeduplicacao?: string;
}

@Injectable()
export class NotificacoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tarefas: TarefasService,
    private readonly configuracoes: ConfiguracoesService,
  ) {}

  /** Cria a notificação (ou mantém a já aberta com a mesma chave). Retorna true se criou. */
  async notificar(n: NovaNotificacao, tx?: Tx): Promise<boolean> {
    const cliente = tx ?? this.prisma;
    const linhas = await cliente.$queryRaw<{ id: string }[]>`
      INSERT INTO notificacoes (id, tipo, severidade, titulo, mensagem, permissao_alvo, entidade, entidade_id, link, chave_deduplicacao)
      VALUES (gen_random_uuid(), ${n.tipo}::"TipoNotificacao", ${n.severidade}::"Severidade", ${n.titulo}, ${n.mensagem},
              ${n.permissaoAlvo}, ${n.entidade ?? null}, ${n.entidadeId ?? null}, ${n.link ?? null}, ${n.chaveDeduplicacao ?? null})
      ON CONFLICT (chave_deduplicacao) WHERE resolvida = false AND chave_deduplicacao IS NOT NULL
      DO NOTHING
      RETURNING id`;
    const criada = linhas.length > 0;
    if (criada) {
      const config = await this.configuracoes.obter();
      if (
        config.notificacoes.emailHabilitado &&
        config.notificacoes.emailsDestino.length &&
        config.notificacoes.tiposPorEmail.includes(n.tipo)
      ) {
        await this.tarefas.enfileirar(
          TAREFAS.NOTIFICACAO_EMAIL,
          { notificacaoId: linhas[0]!.id },
          {},
          tx,
        );
      }
    }
    return criada;
  }

  /** Marca como resolvido o alerta aberto com a chave informada. */
  async resolver(chaveDeduplicacao: string, tx?: Tx) {
    const cliente = tx ?? this.prisma;
    await cliente.notificacao.updateMany({
      where: { chaveDeduplicacao, resolvida: false },
      data: { resolvida: true, resolvidaEm: new Date() },
    });
  }

  async listar(usuario: UsuarioAutenticado, q: z.infer<typeof listarNotificacoesSchema>) {
    const where: Prisma.NotificacaoWhereInput = {
      permissaoAlvo: { in: [...usuario.permissoes] },
      ...(q.tipo && { tipo: q.tipo }),
      ...(q.naoLidas && { leituras: { none: { usuarioId: usuario.id } } }),
    };
    const [dados, total] = await Promise.all([
      this.prisma.notificacao.findMany({
        where,
        include: { leituras: { where: { usuarioId: usuario.id }, select: { lidaEm: true } } },
        orderBy: { criadoEm: 'desc' },
        ...paginar(q),
      }),
      this.prisma.notificacao.count({ where }),
    ]);
    return resultadoPaginado(
      dados.map(({ leituras, ...n }) => ({
        ...n,
        lida: leituras.length > 0,
        lidaEm: leituras[0]?.lidaEm ?? null,
      })),
      total,
      q,
    );
  }

  async contarNaoLidas(usuario: UsuarioAutenticado) {
    const naoLidas = await this.prisma.notificacao.count({
      where: {
        permissaoAlvo: { in: [...usuario.permissoes] },
        leituras: { none: { usuarioId: usuario.id } },
      },
    });
    const criticas = await this.prisma.notificacao.count({
      where: {
        permissaoAlvo: { in: [...usuario.permissoes] },
        severidade: 'CRITICA',
        resolvida: false,
        leituras: { none: { usuarioId: usuario.id } },
      },
    });
    return { naoLidas, criticas };
  }

  async marcarLida(usuario: UsuarioAutenticado, id: string) {
    await this.prisma.notificacaoLeitura.upsert({
      where: { notificacaoId_usuarioId: { notificacaoId: id, usuarioId: usuario.id } },
      update: {},
      create: { notificacaoId: id, usuarioId: usuario.id },
    });
  }

  async marcarTodasLidas(usuario: UsuarioAutenticado) {
    await this.prisma.$executeRaw`
      INSERT INTO notificacao_leituras (notificacao_id, usuario_id)
      SELECT n.id, ${usuario.id}::uuid FROM notificacoes n
       WHERE n.permissao_alvo = ANY(${[...usuario.permissoes]}::text[])
      ON CONFLICT DO NOTHING`;
  }
}
