import { Injectable } from '@nestjs/common';
import type {
  AtualizarUsuarioInput,
  CriarUsuarioInput,
  RedefinirSenhaInput,
} from '@estoque/shared';
import { z } from 'zod';
import { listarUsuariosSchema } from '@estoque/shared';
import type { Prisma } from '../../generated/prisma/client';
import { ContextoUsuarioService } from '../../common/auth/contexto-usuario.service';
import type { ContextoAtor } from '../../common/auth/tipos';
import { conflito, naoEncontrado, regraNegocio } from '../../common/erros';
import { ordenacao, paginar, resultadoPaginado } from '../../common/paginacao';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { SenhaService } from '../auth/senha.service';

const SELECAO = {
  id: true,
  nome: true,
  email: true,
  ativo: true,
  provedorAuth: true,
  deveTrocarSenha: true,
  bloqueadoAte: true,
  ultimoLoginEm: true,
  criadoEm: true,
  atualizadoEm: true,
  perfil: { select: { id: true, nome: true } },
} satisfies Prisma.UsuarioSelect;

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly senhas: SenhaService,
    private readonly auditoria: AuditoriaService,
    private readonly contexto: ContextoUsuarioService,
  ) {}

  async listar(q: z.infer<typeof listarUsuariosSchema>) {
    const where: Prisma.UsuarioWhereInput = {
      anonimizadoEm: null,
      ...(q.perfilId && { perfilId: q.perfilId }),
      ...(q.ativo !== undefined && { ativo: q.ativo }),
      ...(q.busca && {
        OR: [
          { nome: { contains: q.busca, mode: 'insensitive' } },
          { email: { contains: q.busca, mode: 'insensitive' } },
        ],
      }),
    };
    const [dados, total] = await Promise.all([
      this.prisma.usuario.findMany({
        where,
        select: SELECAO,
        orderBy: ordenacao(q, ['nome', 'email', 'criadoEm', 'ultimoLoginEm'], 'nome'),
        ...paginar(q),
      }),
      this.prisma.usuario.count({ where }),
    ]);
    return resultadoPaginado(dados, total, q);
  }

  async obter(id: string) {
    const u = await this.prisma.usuario.findUnique({ where: { id }, select: SELECAO });
    if (!u) throw naoEncontrado('Usuário');
    return u;
  }

  async criar(dados: CriarUsuarioInput, ator: ContextoAtor) {
    await this.garantirPerfil(dados.perfilId);
    const existe = await this.prisma.usuario.findUnique({ where: { email: dados.email } });
    if (existe) throw conflito('Já existe um usuário com este e-mail.');
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.usuario.create({
        data: {
          nome: dados.nome,
          email: dados.email,
          perfilId: dados.perfilId,
          senhaHash: await this.senhas.gerarHash(dados.senhaInicial),
          deveTrocarSenha: true,
        },
        select: SELECAO,
      });
      await this.auditoria.registrar(
        ator,
        {
          acao: 'CRIAR',
          entidade: 'usuario',
          entidadeId: u.id,
          dados: { nome: u.nome, email: u.email, perfil: u.perfil.nome },
        },
        tx,
      );
      return u;
    });
  }

  async atualizar(id: string, dados: AtualizarUsuarioInput, ator: ContextoAtor) {
    const atual = await this.obter(id);
    if (id === ator.usuarioId && dados.ativo === false) {
      throw regraNegocio('Você não pode desativar o seu próprio usuário.');
    }
    if (dados.perfilId) await this.garantirPerfil(dados.perfilId);

    const resultado = await this.prisma.$transaction(async (tx) => {
      const u = await tx.usuario.update({ where: { id }, data: dados, select: SELECAO });
      await this.garantirAdministradorAtivo(tx);
      if (dados.ativo === false) {
        await tx.sessao.updateMany({
          where: { usuarioId: id, revogadaEm: null },
          data: { revogadaEm: new Date(), motivoRevogacao: 'USUARIO_DESATIVADO' },
        });
      }
      await this.auditoria.registrar(
        ator,
        {
          acao: 'ATUALIZAR',
          entidade: 'usuario',
          entidadeId: id,
          dados: {
            antes: { nome: atual.nome, ativo: atual.ativo, perfil: atual.perfil.nome },
            alteracoes: dados,
          },
        },
        tx,
      );
      return u;
    });
    this.contexto.invalidarUsuario(id);
    return resultado;
  }

  async redefinirSenha(id: string, dados: RedefinirSenhaInput, ator: ContextoAtor) {
    await this.obter(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id },
        data: {
          senhaHash: await this.senhas.gerarHash(dados.novaSenha),
          deveTrocarSenha: true,
          tentativasFalhas: 0,
          bloqueadoAte: null,
        },
      });
      await tx.sessao.updateMany({
        where: { usuarioId: id, revogadaEm: null },
        data: { revogadaEm: new Date(), motivoRevogacao: 'SENHA_REDEFINIDA' },
      });
      await this.auditoria.registrar(
        ator,
        { acao: 'REDEFINIR_SENHA', entidade: 'usuario', entidadeId: id },
        tx,
      );
    });
    this.contexto.invalidarUsuario(id);
  }

  async desbloquear(id: string, ator: ContextoAtor) {
    await this.obter(id);
    await this.prisma.usuario.update({
      where: { id },
      data: { tentativasFalhas: 0, bloqueadoAte: null },
    });
    await this.auditoria.registrar(ator, {
      acao: 'DESBLOQUEAR',
      entidade: 'usuario',
      entidadeId: id,
    });
  }

  private async garantirPerfil(perfilId: string) {
    const perfil = await this.prisma.perfil.findUnique({ where: { id: perfilId } });
    if (!perfil) throw regraNegocio('Perfil inexistente.');
  }

  /** Impede que o sistema fique sem nenhum usuário ativo capaz de gerenciar perfis. */
  private async garantirAdministradorAtivo(tx: Prisma.TransactionClient) {
    const admins = await tx.usuario.count({
      where: {
        ativo: true,
        perfil: { permissoes: { some: { permissaoCodigo: 'perfis:gerenciar' } } },
      },
    });
    if (admins === 0) {
      throw regraNegocio('A operação deixaria o sistema sem nenhum administrador ativo.');
    }
  }
}
