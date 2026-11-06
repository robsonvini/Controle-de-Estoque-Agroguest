import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { LoginInput, TrocarSenhaInput } from '@estoque/shared';
import { env } from '../../config/env';
import { AUDIENCIA_WEB } from '../../common/auth/guards';
import { ContextoUsuarioService } from '../../common/auth/contexto-usuario.service';
import type { ContextoAtor, UsuarioAutenticado } from '../../common/auth/tipos';
import { CriptoService } from '../../common/cripto.service';
import { ErroDominio, naoAutenticado, regraNegocio } from '../../common/erros';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ProvedorLocal } from './provedores';
import { SenhaService } from './senha.service';

/** Janela em que a reapresentação de um refresh token já rotacionado é tratada como concorrência benigna. */
const JANELA_CONCORRENCIA_MS = 15_000;

export interface SessaoEmitida {
  accessToken: string;
  expiraEm: string;
  refreshToken: string;
  refreshExpiraEm: Date;
  usuario: PerfilUsuario;
}

export interface PerfilUsuario {
  id: string;
  nome: string;
  email: string;
  perfil: { id: string; nome: string };
  permissoes: string[];
  deveTrocarSenha: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly senhas: SenhaService,
    private readonly provedorLocal: ProvedorLocal,
    private readonly contexto: ContextoUsuarioService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async login(dados: LoginInput, ator: ContextoAtor): Promise<SessaoEmitida> {
    const resultado = await this.provedorLocal.autenticar(dados);

    if (!resultado.ok) {
      if (resultado.motivo === 'CREDENCIAIS_INVALIDAS' && resultado.usuarioId) {
        await this.registrarFalha(resultado.usuarioId, ator);
      }
      if (resultado.motivo === 'BLOQUEADO') {
        const minutos = Math.ceil(
          ((resultado.bloqueadoAte?.getTime() ?? Date.now()) - Date.now()) / 60000,
        );
        throw new ErroDominio(
          HttpStatus.TOO_MANY_REQUESTS,
          'CONTA_BLOQUEADA',
          `Acesso temporariamente bloqueado por excesso de tentativas. Tente novamente em ${minutos} minuto(s).`,
        );
      }
      throw naoAutenticado('E-mail ou senha inválidos.');
    }

    await this.prisma.usuario.update({
      where: { id: resultado.usuarioId },
      data: { tentativasFalhas: 0, bloqueadoAte: null, ultimoLoginEm: new Date() },
    });
    const sessao = await this.criarSessao(resultado.usuarioId, randomUUID(), ator);
    await this.auditoria.registrar(
      { ...ator, usuarioId: resultado.usuarioId },
      { acao: 'LOGIN', entidade: 'usuario', entidadeId: resultado.usuarioId },
    );
    return sessao;
  }

  /** Rotaciona o refresh token. Reuso de token já rotacionado revoga toda a família de sessões. */
  async renovar(refreshToken: string | undefined, ator: ContextoAtor): Promise<SessaoEmitida> {
    if (!refreshToken) throw naoAutenticado('Sessão expirada. Faça login novamente.');
    const hash = CriptoService.sha256(refreshToken);
    const sessao = await this.prisma.sessao.findUnique({
      where: { refreshTokenHash: hash },
      include: { usuario: { select: { ativo: true } } },
    });
    if (!sessao) throw naoAutenticado('Sessão expirada. Faça login novamente.');

    if (sessao.substituidaEm) {
      if (Date.now() - sessao.substituidaEm.getTime() < JANELA_CONCORRENCIA_MS) {
        throw new ErroDominio(
          HttpStatus.CONFLICT,
          'RENOVACAO_CONCORRENTE',
          'Sessão já renovada. Tente novamente.',
        );
      }
      await this.prisma.sessao.updateMany({
        where: { familia: sessao.familia, revogadaEm: null },
        data: { revogadaEm: new Date(), motivoRevogacao: 'REUSO_DETECTADO' },
      });
      this.contexto.invalidarUsuario(sessao.usuarioId);
      await this.auditoria.registrar(
        { ...ator, usuarioId: sessao.usuarioId },
        { acao: 'REUSO_REFRESH_TOKEN', entidade: 'sessao', entidadeId: sessao.id },
      );
      throw naoAutenticado('Sessão inválida. Faça login novamente.');
    }
    if (sessao.revogadaEm || sessao.expiraEm < new Date() || !sessao.usuario.ativo) {
      throw naoAutenticado('Sessão expirada. Faça login novamente.');
    }

    const marcada = await this.prisma.sessao.updateMany({
      where: { id: sessao.id, substituidaEm: null },
      data: { substituidaEm: new Date(), revogadaEm: new Date(), motivoRevogacao: 'ROTACIONADA' },
    });
    if (marcada.count === 0) {
      throw new ErroDominio(
        HttpStatus.CONFLICT,
        'RENOVACAO_CONCORRENTE',
        'Sessão já renovada. Tente novamente.',
      );
    }
    return this.criarSessao(sessao.usuarioId, sessao.familia, ator);
  }

  async logout(
    refreshToken: string | undefined,
    usuario: UsuarioAutenticado | undefined,
    ator: ContextoAtor,
  ) {
    if (refreshToken) {
      const sessao = await this.prisma.sessao.findUnique({
        where: { refreshTokenHash: CriptoService.sha256(refreshToken) },
      });
      if (sessao) {
        await this.prisma.sessao.updateMany({
          where: { familia: sessao.familia, revogadaEm: null },
          data: { revogadaEm: new Date(), motivoRevogacao: 'LOGOUT' },
        });
        this.contexto.invalidarUsuario(sessao.usuarioId);
        await this.auditoria.registrar(
          { ...ator, usuarioId: sessao.usuarioId },
          { acao: 'LOGOUT', entidade: 'sessao', entidadeId: sessao.id },
        );
      }
    }
    if (usuario) {
      await this.prisma.sessao.updateMany({
        where: { id: usuario.sessaoId, revogadaEm: null },
        data: { revogadaEm: new Date(), motivoRevogacao: 'LOGOUT' },
      });
      this.contexto.invalidarUsuario(usuario.id);
    }
  }

  async perfil(usuarioId: string): Promise<PerfilUsuario> {
    const u = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      include: { perfil: { include: { permissoes: true } } },
    });
    return {
      id: u.id,
      nome: u.nome,
      email: u.email,
      perfil: { id: u.perfil.id, nome: u.perfil.nome },
      permissoes: u.perfil.permissoes.map((p) => p.permissaoCodigo).sort(),
      deveTrocarSenha: u.deveTrocarSenha,
    };
  }

  async trocarSenha(usuario: UsuarioAutenticado, dados: TrocarSenhaInput, ator: ContextoAtor) {
    const atual = await this.prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });
    if (!(await this.senhas.verificar(atual.senhaHash, dados.senhaAtual))) {
      throw regraNegocio('A senha atual está incorreta.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: usuario.id },
        data: { senhaHash: await this.senhas.gerarHash(dados.novaSenha), deveTrocarSenha: false },
      });
      // Encerra as demais sessões do usuário
      await tx.sessao.updateMany({
        where: { usuarioId: usuario.id, revogadaEm: null, id: { not: usuario.sessaoId } },
        data: { revogadaEm: new Date(), motivoRevogacao: 'TROCA_DE_SENHA' },
      });
      await this.auditoria.registrar(
        ator,
        { acao: 'TROCAR_SENHA', entidade: 'usuario', entidadeId: usuario.id },
        tx,
      );
    });
    this.contexto.invalidarUsuario(usuario.id);
  }

  async listarSessoes(usuario: UsuarioAutenticado) {
    const sessoes = await this.prisma.sessao.findMany({
      where: { usuarioId: usuario.id, revogadaEm: null, expiraEm: { gt: new Date() } },
      select: {
        id: true,
        ip: true,
        userAgent: true,
        criadoEm: true,
        ultimoUsoEm: true,
        expiraEm: true,
        familia: true,
      },
      orderBy: { ultimoUsoEm: 'desc' },
    });
    const atual = await this.prisma.sessao.findUnique({
      where: { id: usuario.sessaoId },
      select: { familia: true },
    });
    return sessoes.map(({ familia, ...s }) => ({ ...s, atual: familia === atual?.familia }));
  }

  async revogarSessao(usuario: UsuarioAutenticado, sessaoId: string, ator: ContextoAtor) {
    const sessao = await this.prisma.sessao.findFirst({
      where: { id: sessaoId, usuarioId: usuario.id },
    });
    if (!sessao)
      throw new ErroDominio(HttpStatus.NOT_FOUND, 'NAO_ENCONTRADO', 'Sessão não encontrada.');
    await this.prisma.sessao.updateMany({
      where: { familia: sessao.familia, revogadaEm: null },
      data: { revogadaEm: new Date(), motivoRevogacao: 'REVOGADA_PELO_USUARIO' },
    });
    this.contexto.invalidarUsuario(usuario.id);
    await this.auditoria.registrar(ator, {
      acao: 'REVOGAR_SESSAO',
      entidade: 'sessao',
      entidadeId: sessaoId,
    });
  }

  private async registrarFalha(usuarioId: string, ator: ContextoAtor) {
    const u = await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { tentativasFalhas: { increment: 1 } },
      select: { tentativasFalhas: true },
    });
    if (u.tentativasFalhas >= env.LOGIN_MAX_TENTATIVAS) {
      await this.prisma.usuario.update({
        where: { id: usuarioId },
        data: {
          bloqueadoAte: new Date(Date.now() + env.LOGIN_BLOQUEIO_MINUTOS * 60_000),
          tentativasFalhas: 0,
        },
      });
      await this.auditoria.registrar(
        { ...ator, usuarioId },
        { acao: 'BLOQUEIO_POR_TENTATIVAS', entidade: 'usuario', entidadeId: usuarioId },
      );
    } else {
      await this.auditoria.registrar(
        { ...ator, usuarioId },
        { acao: 'LOGIN_FALHOU', entidade: 'usuario', entidadeId: usuarioId },
      );
    }
  }

  private async criarSessao(
    usuarioId: string,
    familia: string,
    ator: ContextoAtor,
  ): Promise<SessaoEmitida> {
    const refreshToken = CriptoService.tokenAleatorio(48);
    const refreshExpiraEm = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DIAS * 86_400_000);
    const sessao = await this.prisma.sessao.create({
      data: {
        usuarioId,
        familia,
        refreshTokenHash: CriptoService.sha256(refreshToken),
        expiraEm: refreshExpiraEm,
        ip: ator.ip ?? null,
        userAgent: ator.userAgent ?? null,
      },
    });
    const accessToken = await this.jwt.signAsync(
      { sub: usuarioId, sid: sessao.id },
      {
        secret: env.JWT_ACCESS_SECRET,
        audience: AUDIENCIA_WEB,
        expiresIn: env.ACCESS_TOKEN_TTL_SEGUNDOS,
        algorithm: 'HS256',
      },
    );
    return {
      accessToken,
      expiraEm: new Date(Date.now() + env.ACCESS_TOKEN_TTL_SEGUNDOS * 1000).toISOString(),
      refreshToken,
      refreshExpiraEm,
      usuario: await this.perfil(usuarioId),
    };
  }
}
