import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const VARIANTES = {
  primario: 'bg-marca-700 text-white hover:bg-marca-800 disabled:bg-marca-700/60',
  secundario: 'bg-white text-texto border border-borda hover:bg-gray-50',
  perigo: 'bg-red-700 text-white hover:bg-red-800',
  fantasma: 'text-texto hover:bg-gray-100',
} as const;

const TAMANHOS = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  icone: 'h-9 w-9 justify-center',
} as const;

export interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: keyof typeof VARIANTES;
  tamanho?: keyof typeof TAMANHOS;
  carregando?: boolean;
  icone?: ReactNode;
}

export const Botao = forwardRef<HTMLButtonElement, BotaoProps>(function Botao(
  {
    variante = 'primario',
    tamanho = 'md',
    carregando,
    icone,
    className,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={cn(
        'inline-flex items-center rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70',
        VARIANTES[variante],
        TAMANHOS[tamanho],
        className,
      )}
      {...props}
    >
      {carregando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icone}
      {children}
    </button>
  );
});

export function BotaoLink({
  href,
  variante = 'primario',
  tamanho = 'md',
  icone,
  children,
  className,
}: {
  href: string;
  variante?: keyof typeof VARIANTES;
  tamanho?: keyof typeof TAMANHOS;
  icone?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center rounded-md font-medium transition-colors',
        VARIANTES[variante],
        TAMANHOS[tamanho],
        className,
      )}
    >
      {icone}
      {children}
    </Link>
  );
}
