'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { api, type OpcoesRequisicao, type Paginado } from './api';

/** Filtros e paginação refletidos na URL (links compartilháveis, botão voltar funciona). */
export function useFiltrosUrl<T extends Record<string, string>>(padrao: T) {
  const params = useSearchParams();
  const router = useRouter();
  const caminho = usePathname();
  const valores = useMemo(() => {
    const atuais = { ...padrao } as T & { pagina: string };
    params.forEach((v, k) => ((atuais as Record<string, string>)[k] = v));
    atuais.pagina ??= '1';
    return atuais;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  const definir = useCallback(
    (novos: Partial<Record<keyof T | 'pagina', string | number | undefined>>) => {
      const p = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(novos)) {
        if (v === undefined || v === '') p.delete(k);
        else p.set(k, String(v));
      }
      if (!('pagina' in novos)) p.delete('pagina');
      router.replace(`${caminho}${p.size ? `?${p}` : ''}`, { scroll: false });
    },
    [params, router, caminho],
  );
  return [valores, definir] as const;
}

export function useConsulta<T>(
  caminho: string | null,
  consulta?: OpcoesRequisicao['consulta'],
  opcoes?: { intervalo?: number },
) {
  return useQuery({
    queryKey: [caminho, consulta],
    queryFn: ({ signal }) => api<T>(caminho!, { consulta, sinal: signal }),
    enabled: !!caminho,
    placeholderData: keepPreviousData,
    refetchInterval: opcoes?.intervalo,
  });
}

export function useListagem<T>(
  caminho: string,
  consulta: OpcoesRequisicao['consulta'],
  opcoes?: { intervalo?: number },
) {
  return useConsulta<Paginado<T>>(caminho, consulta, opcoes);
}

// ------------------------- Listas auxiliares -------------------------

export interface LocalResumo {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
  ativo: boolean;
}
export interface UnidadeResumo {
  id: string;
  sigla: string;
  nome: string;
  casasDecimais: number;
  ativo: boolean;
}
export interface FornecedorResumo {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  documento: string;
  situacao: string;
}
export interface NoCategoria {
  id: string;
  nome: string;
  caminho: string;
  ativo: boolean;
  filhas: NoCategoria[];
}

const longo = { staleTime: 60_000 };

export function useLocais(somenteAtivos = true) {
  return useQuery({
    queryKey: ['/locais', 'todos', somenteAtivos],
    queryFn: () =>
      api<Paginado<LocalResumo>>('/locais', {
        consulta: { porPagina: 200, ativo: somenteAtivos ? 'true' : undefined },
      }),
    select: (r) => r.dados,
    ...longo,
  });
}

export function useUnidades() {
  return useQuery({
    queryKey: ['/unidades', 'todas'],
    queryFn: () =>
      api<Paginado<UnidadeResumo>>('/unidades', { consulta: { porPagina: 200, ativo: 'true' } }),
    select: (r) => r.dados,
    ...longo,
  });
}

export function useFornecedoresAtivos(habilitado = true) {
  return useQuery({
    queryKey: ['/fornecedores', 'ativos'],
    queryFn: () =>
      api<Paginado<FornecedorResumo>>('/fornecedores', {
        consulta: { porPagina: 200, situacao: 'ATIVO', ordenarPor: 'razaoSocial' },
      }),
    select: (r) => r.dados,
    enabled: habilitado,
    ...longo,
  });
}

/** Árvore de categorias achatada com o caminho completo (ex.: "Insumos › Sementes"). */
export function useCategorias() {
  return useQuery({
    queryKey: ['/categorias/arvore'],
    queryFn: () => api<NoCategoria[]>('/categorias/arvore'),
    select: (arvore) => {
      const lista: NoCategoria[] = [];
      const percorrer = (nos: NoCategoria[]) =>
        nos.forEach((n) => (lista.push(n), percorrer(n.filhas)));
      percorrer(arvore);
      return lista;
    },
    ...longo,
  });
}
