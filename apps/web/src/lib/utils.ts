import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { toast } from 'sonner';
import { ErroApi } from './api';

export function cn(...classes: ClassValue[]) {
  return twMerge(clsx(classes));
}

/**
 * Exibe o erro da API: erros de validação vão para os campos do formulário
 * (associados por aria-describedby) e o resumo vai para um toast anunciado.
 */
export function tratarErro<T extends FieldValues>(erro: unknown, setError?: UseFormSetError<T>) {
  if (erro instanceof ErroApi) {
    if (setError && erro.erros.length) {
      for (const e of erro.erros)
        setError(e.campo as Path<T>, { type: 'servidor', message: e.mensagem });
      toast.error('Revise os campos destacados.');
      return;
    }
    const extra =
      erro.codigo === 'SALDO_INSUFICIENTE' && erro.detalhes
        ? ` ${erro.detalhes.sku ?? ''} ${erro.detalhes.local ? `no local ${erro.detalhes.local}` : ''}: disponível ${erro.detalhes.disponivel}, solicitado ${erro.detalhes.solicitado}.`
        : '';
    toast.error(erro.message + extra);
    return;
  }
  toast.error('Falha de comunicação com o servidor. Verifique sua conexão.');
}

/** Converte valores do formulário vazios em undefined antes de enviar. */
export function limparVazios<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined),
  ) as T;
}
