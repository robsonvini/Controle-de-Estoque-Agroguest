'use client';

import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

const BASE =
  'block w-full rounded-md border border-borda bg-white px-3 text-sm text-texto placeholder:text-gray-500 disabled:bg-gray-100 disabled:text-gray-600 aria-[invalid=true]:border-red-700';

/**
 * Campo com rótulo, dica e mensagem de erro associados ao controle
 * (label/for, aria-describedby, aria-invalid, aria-required) — WCAG 1.3.1, 3.3.1, 3.3.2.
 */
export function Campo({
  rotulo,
  erro,
  dica,
  obrigatorio,
  children,
  className,
}: {
  rotulo: string;
  erro?: string;
  dica?: string;
  obrigatorio?: boolean;
  children: ReactElement<Record<string, unknown>>;
  className?: string;
}) {
  const id = useId();
  const idDica = dica ? `${id}-dica` : undefined;
  const idErro = erro ? `${id}-erro` : undefined;
  const controle = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': erro ? true : undefined,
        'aria-required': obrigatorio || undefined,
        'aria-describedby': [idDica, idErro].filter(Boolean).join(' ') || undefined,
      })
    : children;
  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-texto">
        {rotulo}
        {obrigatorio && (
          <span className="ml-0.5 text-red-700" aria-hidden>
            *
          </span>
        )}
      </label>
      {controle}
      {dica && (
        <p id={idDica} className="text-xs text-suave">
          {dica}
        </p>
      )}
      {erro && (
        <p id={idErro} className="text-xs font-medium text-red-700">
          {erro}
        </p>
      )}
    </div>
  );
}

export const Entrada = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Entrada({ className, ...props }, ref) {
    return <input ref={ref} className={cn(BASE, 'h-10', className)} {...props} />;
  },
);

export const Selecao = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }
>(function Selecao({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(BASE, 'h-10 pr-8', className)} {...props}>
      {children}
    </select>
  );
});

export const AreaTexto = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function AreaTexto({ className, rows = 3, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(BASE, 'py-2', className)} {...props} />;
});

export const Caixa = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { rotulo: string }
>(function Caixa({ rotulo, className, ...props }, ref) {
  const id = useId();
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className="h-4 w-4 rounded border-borda accent-marca-700"
        {...props}
      />
      <label htmlFor={id} className="text-sm">
        {rotulo}
      </label>
    </div>
  );
});
