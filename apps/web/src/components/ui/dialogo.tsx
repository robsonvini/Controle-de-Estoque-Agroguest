'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Botao } from './botao';

/** Diálogo modal acessível (foco preso, Esc fecha, título e descrição anunciados). */
export function Dialogo({
  aberto,
  aoMudar,
  titulo,
  descricao,
  children,
  largura = 'max-w-lg',
}: {
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  titulo: string;
  descricao?: string;
  children: ReactNode;
  largura?: string;
}) {
  return (
    <Dialog.Root open={aberto} onOpenChange={aoMudar}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[95vw] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-white p-5 shadow-xl',
            largura,
          )}
          aria-describedby={descricao ? undefined : undefined}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold">{titulo}</Dialog.Title>
              {descricao ? (
                <Dialog.Description className="mt-1 text-sm text-suave">
                  {descricao}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{titulo}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="rounded p-1 text-suave hover:bg-gray-100" aria-label="Fechar">
              <X className="h-5 w-5" aria-hidden />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Confirmação de ação, opcionalmente exigindo justificativa (estornos, rejeições, cancelamentos). */
export function Confirmacao({
  aberto,
  aoMudar,
  titulo,
  mensagem,
  rotuloConfirmar = 'Confirmar',
  perigo,
  exigirJustificativa,
  rotuloJustificativa = 'Justificativa',
  aoConfirmar,
}: {
  aberto: boolean;
  aoMudar: (a: boolean) => void;
  titulo: string;
  mensagem: ReactNode;
  rotuloConfirmar?: string;
  perigo?: boolean;
  exigirJustificativa?: boolean;
  rotuloJustificativa?: string;
  aoConfirmar: (justificativa: string) => Promise<unknown>;
}) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  return (
    <Dialogo
      aberto={aberto}
      aoMudar={(a) => {
        if (!a) {
          setTexto('');
          setErro('');
        }
        aoMudar(a);
      }}
      titulo={titulo}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (exigirJustificativa && texto.trim().length < 3) {
            setErro('Informe a justificativa (mínimo de 3 caracteres).');
            return;
          }
          setEnviando(true);
          try {
            await aoConfirmar(texto.trim());
            setTexto('');
            aoMudar(false);
          } catch {
            // O erro já foi exibido por quem chamou; o diálogo permanece aberto para nova tentativa
          } finally {
            setEnviando(false);
          }
        }}
      >
        <div className="text-sm">{mensagem}</div>
        {exigirJustificativa && (
          <div className="mt-4 space-y-1">
            <label htmlFor="justificativa-confirmacao" className="block text-sm font-medium">
              {rotuloJustificativa}{' '}
              <span className="text-red-700" aria-hidden>
                *
              </span>
            </label>
            <textarea
              id="justificativa-confirmacao"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={3}
              maxLength={500}
              aria-required
              aria-invalid={!!erro || undefined}
              aria-describedby={erro ? 'erro-justificativa' : undefined}
              className="block w-full rounded-md border border-borda px-3 py-2 text-sm"
            />
            {erro && (
              <p id="erro-justificativa" className="text-xs font-medium text-red-700">
                {erro}
              </p>
            )}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Botao variante="secundario" onClick={() => aoMudar(false)}>
            Voltar
          </Botao>
          <Botao type="submit" variante={perigo ? 'perigo' : 'primario'} carregando={enviando}>
            {rotuloConfirmar}
          </Botao>
        </div>
      </form>
    </Dialogo>
  );
}
