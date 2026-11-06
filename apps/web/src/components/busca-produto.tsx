'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { formatarQuantidade } from '@estoque/shared';
import { api, type Paginado } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface ProdutoOpcao {
  id: string;
  sku: string;
  nome: string;
  unidadeSigla: string;
  casasDecimais: number;
  disponivel: string;
  custoMedio: string;
  precoVenda: string;
  status: string;
}

/**
 * Combobox de produtos com busca assíncrona (padrão ARIA 1.2: role=combobox,
 * listbox, aria-activedescendant). Aceita leitura de código de barras: o leitor
 * digita o código e envia Enter, selecionando o primeiro resultado.
 */
export function BuscaProduto({
  valor,
  aoSelecionar,
  rotulo = 'Produto',
  erro,
  somenteAtivos = true,
  autoFocus,
}: {
  valor?: ProdutoOpcao | null;
  aoSelecionar: (p: ProdutoOpcao | null) => void;
  rotulo?: string;
  erro?: string;
  somenteAtivos?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [texto, setTexto] = useState(valor ? `${valor.sku} — ${valor.nome}` : '');
  const [termo, setTermo] = useState('');
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const lista = useRef<HTMLUListElement>(null);

  useEffect(() => {
    setTexto(valor ? `${valor.sku} — ${valor.nome}` : '');
  }, [valor]);

  useEffect(() => {
    const t = setTimeout(() => setTermo(texto), 250);
    return () => clearTimeout(t);
  }, [texto]);

  const { data, isFetching } = useQuery({
    queryKey: ['busca-produto', termo, somenteAtivos],
    queryFn: () =>
      api<Paginado<ProdutoOpcao>>('/produtos', {
        consulta: { busca: termo, porPagina: 15, status: somenteAtivos ? 'ATIVO' : undefined },
      }),
    enabled: aberto && termo.length >= 2 && termo !== (valor ? `${valor.sku} — ${valor.nome}` : ''),
    staleTime: 15_000,
  });
  const opcoes = data?.dados ?? [];

  const selecionar = (p: ProdutoOpcao) => {
    aoSelecionar(p);
    setAberto(false);
  };

  return (
    <div className="relative space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {rotulo}{' '}
        <span className="text-red-700" aria-hidden>
          *
        </span>
      </label>
      <input
        id={id}
        role="combobox"
        aria-expanded={aberto && opcoes.length > 0}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        aria-activedescendant={aberto && opcoes[ativo] ? `${id}-op-${ativo}` : undefined}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : `${id}-dica`}
        aria-required
        autoComplete="off"
        autoFocus={autoFocus}
        value={texto}
        placeholder="Digite nome, SKU ou leia o código de barras"
        onChange={(e) => {
          setTexto(e.target.value);
          setAberto(true);
          setAtivo(0);
          if (valor) aoSelecionar(null);
        }}
        onFocus={() => texto.length >= 2 && setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setAberto(true);
            setAtivo((a) => Math.min(a + 1, opcoes.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setAtivo((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && aberto && opcoes[ativo]) {
            e.preventDefault();
            selecionar(opcoes[ativo]);
          } else if (e.key === 'Escape') {
            setAberto(false);
          }
        }}
        className={cn(
          'block h-10 w-full rounded-md border border-borda bg-white px-3 text-sm',
          erro && 'border-red-700',
        )}
      />
      <p id={`${id}-dica`} className="sr-only">
        Digite ao menos 2 caracteres. Use as setas para navegar e Enter para selecionar.
      </p>
      {erro && (
        <p id={`${id}-erro`} className="text-xs font-medium text-red-700">
          {erro}
        </p>
      )}
      <ul
        id={`${id}-lista`}
        ref={lista}
        role="listbox"
        aria-label="Produtos encontrados"
        hidden={!aberto || (!opcoes.length && !isFetching)}
        className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-borda bg-white shadow-lg"
      >
        {isFetching && !opcoes.length && (
          <li className="px-3 py-2 text-sm text-suave">Buscando…</li>
        )}
        {opcoes.map((p, i) => (
          <li
            key={p.id}
            id={`${id}-op-${i}`}
            role="option"
            aria-selected={i === ativo}
            onMouseDown={(e) => {
              e.preventDefault();
              selecionar(p);
            }}
            onMouseEnter={() => setAtivo(i)}
            className={cn('cursor-pointer px-3 py-2 text-sm', i === ativo && 'bg-marca-100')}
          >
            <span className="font-medium">{p.sku}</span> — {p.nome}
            <span className="block text-xs text-suave">
              Disponível: {formatarQuantidade(p.disponivel)} {p.unidadeSigla}
            </span>
          </li>
        ))}
      </ul>
      <div aria-live="polite" className="sr-only">
        {aberto && termo.length >= 2 && !isFetching
          ? `${opcoes.length} produto(s) encontrado(s)`
          : ''}
      </div>
    </div>
  );
}
