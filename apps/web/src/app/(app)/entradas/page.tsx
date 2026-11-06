'use client';

import { Plus } from 'lucide-react';
import { ListaMovimentacoes } from '@/components/lista-movimentacoes';
import { CabecalhoPagina } from '@/components/ui/basicos';
import { BotaoLink } from '@/components/ui/botao';
import { useAuth } from '@/lib/auth';

export default function PaginaEntradas() {
  const { tem } = useAuth();
  return (
    <>
      <CabecalhoPagina
        titulo="Entradas"
        descricao="Compras, recebimentos, devoluções de clientes e ajustes positivos"
        acoes={
          <>
            {tem('compras:ler') && (
              <BotaoLink variante="secundario" href="/compras">
                Receber pedido de compra
              </BotaoLink>
            )}
            {tem('entradas:registrar') && (
              <BotaoLink href="/entradas/nova" icone={<Plus className="h-4 w-4" aria-hidden />}>
                Nova entrada
              </BotaoLink>
            )}
          </>
        }
      />
      <ListaMovimentacoes tipo="ENTRADA" />
    </>
  );
}
