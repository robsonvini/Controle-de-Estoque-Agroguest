import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { env } from '../../config/env';
import { naoAutenticado, proibido } from '../erros';
import { ContextoUsuarioService } from './contexto-usuario.service';
import { CHAVE_PERMISSOES, CHAVE_PUBLICO } from './decoradores';
import type { RequisicaoAutenticada } from './tipos';

export const AUDIENCIA_WEB = 'estoque-web';

interface ClaimsAcesso {
  sub: string;
  sid: string;
}

/** Guard global: exige access token JWT válido, exceto em rotas @Publico(). */
@Injectable()
export class AutenticacaoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly contexto: ContextoUsuarioService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const publico = this.reflector.getAllAndOverride<boolean>(CHAVE_PUBLICO, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (publico) return true;

    const req = ctx.switchToHttp().getRequest<RequisicaoAutenticada>();
    const [tipo, token] = req.headers.authorization?.split(' ') ?? [];
    if (tipo !== 'Bearer' || !token) throw naoAutenticado();

    let claims: ClaimsAcesso;
    try {
      claims = await this.jwt.verifyAsync<ClaimsAcesso>(token, {
        secret: env.JWT_ACCESS_SECRET,
        audience: AUDIENCIA_WEB,
        algorithms: ['HS256'],
      });
    } catch {
      throw naoAutenticado('Sessão expirada ou token inválido.');
    }

    const usuario = await this.contexto.obter(claims.sub, claims.sid);
    if (!usuario) throw naoAutenticado('Sessão encerrada ou usuário inativo.');
    req.usuario = usuario;
    return true;
  }
}

/** Guard global de autorização por permissões `modulo:acao`. */
@Injectable()
export class PermissoesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const exigidas = this.reflector.getAllAndOverride<string[]>(CHAVE_PERMISSOES, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!exigidas?.length) return true;
    const req = ctx.switchToHttp().getRequest<RequisicaoAutenticada>();
    const usuario = req.usuario;
    if (!usuario) throw naoAutenticado();
    const faltando = exigidas.filter((p) => !usuario.permissoes.has(p));
    if (faltando.length) throw proibido();
    return true;
  }
}
