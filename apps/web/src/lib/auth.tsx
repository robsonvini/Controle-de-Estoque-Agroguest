'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Permissao } from '@estoque/shared';
import * as cliente from './api';

export interface UsuarioSessao {
  id: string;
  nome: string;
  email: string;
  perfil: { id: string; nome: string };
  permissoes: string[];
  deveTrocarSenha: boolean;
}

interface ContextoAuth {
  usuario: UsuarioSessao | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<UsuarioSessao>;
  sair: () => Promise<void>;
  tem: (...permissoes: Permissao[]) => boolean;
  algum: (...permissoes: Permissao[]) => boolean;
  atualizar: () => Promise<void>;
}

const Contexto = createContext<ContextoAuth | null>(null);

export function ProvedorAuth({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSessao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelado = false;
    cliente.aoSessaoExpirar(() => {
      setUsuario(null);
      queryClient.clear();
      router.replace(`/login?expirada=1&destino=${encodeURIComponent(window.location.pathname)}`);
    });
    // Restaura a sessão a partir do cookie de refresh (o access token vive só em memória)
    cliente
      .renovarSessao()
      .then((ok) => {
        if (!cancelado && ok && cliente.ultimaSessao)
          setUsuario(cliente.ultimaSessao.usuario as UsuarioSessao);
      })
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [router, queryClient]);

  const entrar = useCallback(async (email: string, senha: string) => {
    const dados = await cliente.login(email, senha);
    setUsuario(dados.usuario);
    return dados.usuario as UsuarioSessao;
  }, []);

  const sair = useCallback(async () => {
    await cliente.logout();
    setUsuario(null);
    queryClient.clear();
    router.replace('/login');
  }, [router, queryClient]);

  const atualizar = useCallback(async () => {
    setUsuario(await cliente.api<UsuarioSessao>('/auth/me'));
  }, []);

  const valor = useMemo<ContextoAuth>(() => {
    const conjunto = new Set(usuario?.permissoes ?? []);
    return {
      usuario,
      carregando,
      entrar,
      sair,
      atualizar,
      tem: (...p) => p.every((x) => conjunto.has(x)),
      algum: (...p) => p.some((x) => conjunto.has(x)),
    };
  }, [usuario, carregando, entrar, sair, atualizar]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAuth() {
  const c = useContext(Contexto);
  if (!c) throw new Error('useAuth deve ser usado dentro de ProvedorAuth');
  return c;
}
