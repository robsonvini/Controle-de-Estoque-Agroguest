import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permissao } from '@estoque/shared';
import {
  contextoDe,
  type ContextoAtor,
  type RequisicaoAutenticada,
  type UsuarioAutenticado,
} from './tipos';

export const CHAVE_PUBLICO = 'rota:publica';
export const CHAVE_PERMISSOES = 'rota:permissoes';
export const CHAVE_ESCOPOS = 'rota:escopos';

/** Rota sem autenticação de usuário (login, health, API de integração com guard próprio). */
export const Publico = () => SetMetadata(CHAVE_PUBLICO, true);

/** Exige todas as permissões listadas. */
export const RequerPermissoes = (...permissoes: Permissao[]) =>
  SetMetadata(CHAVE_PERMISSOES, permissoes);

/** Exige os escopos listados (clientes da API de integração). */
export const RequerEscopos = (...escopos: string[]) => SetMetadata(CHAVE_ESCOPOS, escopos);

export const UsuarioAtual = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): UsuarioAutenticado => {
    const req = ctx.switchToHttp().getRequest<RequisicaoAutenticada>();
    return req.usuario!;
  },
);

/** Injeta o contexto do ator (usuário ou cliente de API, IP e user agent). */
export const Ator = createParamDecorator((_: unknown, ctx: ExecutionContext): ContextoAtor => {
  return contextoDe(ctx.switchToHttp().getRequest<RequisicaoAutenticada>());
});
