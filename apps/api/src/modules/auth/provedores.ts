import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SenhaService } from './senha.service';

/**
 * Ponto de extensão para provedores de identidade.
 *
 * Hoje o sistema usa o provedor "local" (e-mail e senha). Quando o CRM Agrogest
 * oferecer autenticação (OAuth 2.0 / OpenID Connect), basta implementar um
 * provedor que valide o token do CRM e devolva o usuário vinculado
 * (usuarios.provedor_auth + usuarios.id_externo), sem alterar o restante
 * do fluxo de sessões, perfis e permissões.
 */
export interface ProvedorAutenticacao<TCredenciais> {
  readonly nome: string;
  autenticar(credenciais: TCredenciais): Promise<ResultadoAutenticacao>;
}

export type ResultadoAutenticacao =
  | { ok: true; usuarioId: string }
  | {
      ok: false;
      motivo: 'CREDENCIAIS_INVALIDAS' | 'BLOQUEADO' | 'INATIVO';
      bloqueadoAte?: Date;
      usuarioId?: string;
    };

@Injectable()
export class ProvedorLocal implements ProvedorAutenticacao<{ email: string; senha: string }> {
  readonly nome = 'local';

  constructor(
    private readonly prisma: PrismaService,
    private readonly senhas: SenhaService,
  ) {}

  async autenticar({
    email,
    senha,
  }: {
    email: string;
    senha: string;
  }): Promise<ResultadoAutenticacao> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email },
      select: { id: true, senhaHash: true, ativo: true, bloqueadoAte: true, provedorAuth: true },
    });

    const valida = await this.senhas.verificar(
      usuario?.provedorAuth === 'local' ? usuario.senhaHash : null,
      senha,
    );
    if (!usuario) return { ok: false, motivo: 'CREDENCIAIS_INVALIDAS' };
    if (usuario.bloqueadoAte && usuario.bloqueadoAte > new Date()) {
      return {
        ok: false,
        motivo: 'BLOQUEADO',
        bloqueadoAte: usuario.bloqueadoAte,
        usuarioId: usuario.id,
      };
    }
    if (!valida) return { ok: false, motivo: 'CREDENCIAIS_INVALIDAS', usuarioId: usuario.id };
    if (!usuario.ativo) return { ok: false, motivo: 'INATIVO', usuarioId: usuario.id };
    return { ok: true, usuarioId: usuario.id };
  }
}
