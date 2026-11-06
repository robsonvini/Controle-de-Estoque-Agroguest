import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ErroApi } from '@/lib/api';

export function Cartao({
  titulo,
  acoes,
  children,
  className,
}: {
  titulo?: string;
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn('rounded-lg border border-borda bg-white shadow-sm', className)}
      aria-label={titulo}
    >
      {(titulo || acoes) && (
        <header className="flex items-center justify-between gap-2 border-b border-borda px-4 py-3">
          {titulo && <h2 className="text-base font-semibold">{titulo}</h2>}
          {acoes}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const CORES = {
  verde: 'bg-green-100 text-green-900',
  amarelo: 'bg-amber-100 text-amber-900',
  vermelho: 'bg-red-100 text-red-900',
  azul: 'bg-blue-100 text-blue-900',
  cinza: 'bg-gray-100 text-gray-800',
  roxo: 'bg-purple-100 text-purple-900',
} as const;

export type CorEtiqueta = keyof typeof CORES;

export function Etiqueta({ cor = 'cinza', children }: { cor?: CorEtiqueta; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        CORES[cor],
      )}
    >
      {children}
    </span>
  );
}

export function CabecalhoPagina({
  titulo,
  descricao,
  acoes,
}: {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-suave">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-suave">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span>{texto}</span>
    </div>
  );
}

export function Vazio({ texto, acao }: { texto: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-suave">
      <Inbox className="h-8 w-8" aria-hidden />
      <p>{texto}</p>
      {acao}
    </div>
  );
}

export function ErroCarregamento({
  erro,
  tentarNovamente,
}: {
  erro: unknown;
  tentarNovamente?: () => void;
}) {
  const mensagem = erro instanceof ErroApi ? erro.message : 'Não foi possível carregar os dados.';
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-2 rounded-md border border-red-200 bg-red-50 p-6 text-center text-red-900"
    >
      <AlertTriangle className="h-6 w-6" aria-hidden />
      <p>{mensagem}</p>
      {tentarNovamente && (
        <button type="button" onClick={tentarNovamente} className="text-sm font-medium underline">
          Tentar novamente
        </button>
      )}
    </div>
  );
}

export function Indicador({
  rotulo,
  valor,
  detalhe,
  icone,
  tom = 'neutro',
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  icone?: ReactNode;
  tom?: 'neutro' | 'alerta' | 'critico' | 'positivo';
}) {
  const tons = {
    neutro: 'text-marca-700 bg-marca-50',
    alerta: 'text-amber-800 bg-amber-50',
    critico: 'text-red-800 bg-red-50',
    positivo: 'text-green-800 bg-green-50',
  };
  return (
    <div className="flex items-start gap-3 rounded-lg border border-borda bg-white p-4 shadow-sm">
      {icone && (
        <div className={cn('rounded-md p-2', tons[tom])} aria-hidden>
          {icone}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-sm text-suave">{rotulo}</p>
        <p className="text-2xl font-semibold tabular-nums">{valor}</p>
        {detalhe && <p className="text-xs text-suave">{detalhe}</p>}
      </div>
    </div>
  );
}

/** Lista de pares rótulo/valor (dl) para telas de detalhe. */
export function ListaDados({ itens }: { itens: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {itens.map(([rotulo, valor]) => (
        <div key={rotulo}>
          <dt className="text-xs font-medium tracking-wide text-suave uppercase">{rotulo}</dt>
          <dd className="mt-0.5 text-sm break-words">{valor ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
