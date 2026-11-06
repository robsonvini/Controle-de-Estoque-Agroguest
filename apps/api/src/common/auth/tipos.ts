import type { Request } from 'express';

export interface UsuarioAutenticado {
  tipo: 'usuario';
  id: string;
  sessaoId: string;
  nome: string;
  email: string;
  perfilId: string;
  perfilNome: string;
  permissoes: Set<string>;
  deveTrocarSenha: boolean;
}

export interface ClienteApiAutenticado {
  tipo: 'clienteApi';
  id: string;
  clientId: string;
  nome: string;
  escopos: Set<string>;
}

export type Ator = UsuarioAutenticado | ClienteApiAutenticado;

export interface RequisicaoAutenticada extends Request {
  usuario?: UsuarioAutenticado;
  clienteApi?: ClienteApiAutenticado;
}

/** Contexto de quem executa a operação, usado em auditoria e no livro-razão. */
export interface ContextoAtor {
  usuarioId?: string | null;
  clienteApiId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export function contextoDe(req: RequisicaoAutenticada): ContextoAtor {
  return {
    usuarioId: req.usuario?.id ?? null,
    clienteApiId: req.clienteApi?.id ?? null,
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent']?.slice(0, 300) ?? null,
  };
}
