'use client';

import { useSearchParams } from 'next/navigation';
import { useConsulta } from './hooks';
import type { ProdutoOpcao } from '@/components/busca-produto';

/** Carrega o produto informado em ?produtoId= (atalho a partir da tela do produto). */
export function useProdutoInicial() {
  const id = useSearchParams().get('produtoId');
  const { data, isLoading } = useConsulta<{
    id: string;
    sku: string;
    nome: string;
    status: string;
    custoMedio: string;
    precoVenda: string;
    unidadeMedida: { sigla: string; casasDecimais: number };
    totais: { disponivel: string };
  }>(id && /^[0-9a-f-]{36}$/i.test(id) ? `/produtos/${id}` : null);
  const produto: ProdutoOpcao | null = data
    ? {
        id: data.id,
        sku: data.sku,
        nome: data.nome,
        status: data.status,
        custoMedio: data.custoMedio,
        precoVenda: data.precoVenda,
        unidadeSigla: data.unidadeMedida.sigla,
        casasDecimais: data.unidadeMedida.casasDecimais,
        disponivel: data.totais.disponivel,
      }
    : null;
  return { produto, carregando: !!id && isLoading };
}
