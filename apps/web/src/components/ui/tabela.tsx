'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Carregando, ErroCarregamento, Vazio } from './basicos';

export interface ColunaTabela<T> {
  titulo: string;
  celula: (linha: T) => ReactNode;
  alinhamento?: 'esquerda' | 'direita' | 'centro';
  /** Oculta a coluna em telas pequenas. */
  secundaria?: boolean;
  className?: string;
}

/** Tabela de dados acessível (caption, th com scope) e responsiva (rolagem horizontal). */
export function Tabela<T>({
  legenda,
  colunas,
  dados,
  chave,
  carregando,
  erro,
  tentarNovamente,
  textoVazio = 'Nenhum registro encontrado.',
  rodape,
}: {
  legenda: string;
  colunas: ColunaTabela<T>[];
  dados: T[] | undefined;
  chave: (linha: T) => string;
  carregando?: boolean;
  erro?: unknown;
  tentarNovamente?: () => void;
  textoVazio?: string;
  rodape?: ReactNode;
}) {
  if (erro) return <ErroCarregamento erro={erro} tentarNovamente={tentarNovamente} />;
  if (carregando && !dados) return <Carregando />;
  if (!dados?.length) return <Vazio texto={textoVazio} />;
  const alinhar = (a?: string) =>
    a === 'direita' ? 'text-right' : a === 'centro' ? 'text-center' : 'text-left';
  return (
    <div
      className="overflow-x-auto rounded-lg border border-borda bg-white"
      role="region"
      aria-label={legenda}
      tabIndex={0}
    >
      <table className="min-w-full divide-y divide-borda text-sm">
        <caption className="sr-only">{legenda}</caption>
        <thead className="bg-gray-50">
          <tr>
            {colunas.map((c) => (
              <th
                key={c.titulo}
                scope="col"
                className={cn(
                  'px-3 py-2.5 font-semibold whitespace-nowrap text-texto',
                  alinhar(c.alinhamento),
                  c.secundaria && 'hidden md:table-cell',
                )}
              >
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={cn('divide-y divide-gray-100', carregando && 'opacity-60')}>
          {dados.map((linha) => (
            <tr key={chave(linha)} className="hover:bg-marca-50/60">
              {colunas.map((c) => (
                <td
                  key={c.titulo}
                  className={cn(
                    'px-3 py-2 align-top',
                    alinhar(c.alinhamento),
                    c.secundaria && 'hidden md:table-cell',
                    c.className,
                  )}
                >
                  {c.celula(linha)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {rodape && <tfoot className="bg-gray-50 font-semibold">{rodape}</tfoot>}
      </table>
    </div>
  );
}

export function Paginacao({
  pagina,
  totalPaginas,
  total,
  aoMudar,
}: {
  pagina: number;
  totalPaginas: number;
  total: number;
  aoMudar: (pagina: number) => void;
}) {
  if (total === 0) return null;
  return (
    <nav aria-label="Paginação" className="mt-3 flex items-center justify-between gap-2 text-sm">
      <p className="text-suave" aria-live="polite">
        {total} registro{total === 1 ? '' : 's'} · página {pagina} de {totalPaginas}
      </p>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => aoMudar(pagina - 1)}
          disabled={pagina <= 1}
          className="inline-flex h-9 items-center gap-1 rounded-md border border-borda bg-white px-3 disabled:opacity-50"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden /> Anterior
        </button>
        <button
          type="button"
          onClick={() => aoMudar(pagina + 1)}
          disabled={pagina >= totalPaginas}
          className="inline-flex h-9 items-center gap-1 rounded-md border border-borda bg-white px-3 disabled:opacity-50"
        >
          Próxima <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </nav>
  );
}
