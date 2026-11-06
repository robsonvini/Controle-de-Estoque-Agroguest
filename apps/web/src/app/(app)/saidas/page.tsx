'use client';

import { ArrowLeftRight, Plus } from 'lucide-react';
import { ListaMovimentacoes } from '@/components/lista-movimentacoes';
import { CabecalhoPagina } from '@/components/ui/basicos';
import { BotaoLink } from '@/components/ui/botao';
import { useAuth } from '@/lib/auth';

export default function PaginaSaidas() {
  const { tem } = useAuth();
  return (
    <>
      <CabecalhoPagina
        titulo="Saídas"
        descricao="Vendas, consumo interno, perdas, avarias e devoluções a fornecedores"
        acoes={
          <>
            {tem('transferencias:registrar') && (
              <BotaoLink
                variante="secundario"
                href="/estoque/transferencia"
                icone={<ArrowLeftRight className="h-4 w-4" aria-hidden />}
              >
                Transferência
              </BotaoLink>
            )}
            {tem('saidas:registrar') && (
              <BotaoLink href="/saidas/nova" icone={<Plus className="h-4 w-4" aria-hidden />}>
                Nova saída
              </BotaoLink>
            )}
          </>
        }
      />
      <ListaMovimentacoes tipo="SAIDA" />
    </>
  );
}
