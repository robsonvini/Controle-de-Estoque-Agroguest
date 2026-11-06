'use client';

import * as Tabs from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';

/** Abas acessíveis (role=tablist, setas do teclado alternam entre as abas). */
export function Abas({
  abas,
  padrao,
  rotulo,
}: {
  abas: { valor: string; titulo: string; conteudo: ReactNode; oculta?: boolean }[];
  padrao?: string;
  rotulo: string;
}) {
  const visiveis = abas.filter((a) => !a.oculta);
  return (
    <Tabs.Root defaultValue={padrao ?? visiveis[0]?.valor}>
      <Tabs.List aria-label={rotulo} className="mb-4 flex flex-wrap gap-1 border-b border-borda">
        {visiveis.map((a) => (
          <Tabs.Trigger
            key={a.valor}
            value={a.valor}
            className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-suave hover:text-texto data-[state=active]:border-marca-700 data-[state=active]:text-marca-800"
          >
            {a.titulo}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {visiveis.map((a) => (
        <Tabs.Content key={a.valor} value={a.valor}>
          {a.conteudo}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
