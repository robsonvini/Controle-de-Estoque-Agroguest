'use client';

import { useParams } from 'next/navigation';
import { CabecalhoPagina, Carregando, ErroCarregamento } from '@/components/ui/basicos';
import { useConsulta } from '@/lib/hooks';
import { FormularioProduto } from '../../formulario-produto';
import type { ProdutoDetalhe } from '../page';

export default function EditarProduto() {
  const { id } = useParams<{ id: string }>();
  const { data: p, error, isLoading } = useConsulta<ProdutoDetalhe>(`/produtos/${id}`);
  if (isLoading) return <Carregando />;
  if (error || !p) return <ErroCarregamento erro={error} />;
  return (
    <>
      <CabecalhoPagina
        titulo={`Editar: ${p.nome}`}
        descricao="Campos marcados com * são obrigatórios"
      />
      <FormularioProduto
        id={id}
        inicial={{
          codigoInterno: p.codigoInterno,
          sku: p.sku,
          codigoBarras: p.codigoBarras ?? '',
          nome: p.nome,
          descricao: p.descricao ?? '',
          categoriaId: p.categoria?.id ?? '',
          unidadeMedidaId: p.unidadeMedida.id,
          localPadraoId: p.localPadrao?.id ?? '',
          precoCusto: p.precoCusto,
          precoVenda: p.precoVenda,
          estoqueMinimo: p.estoqueMinimo,
          estoqueMaximo: p.estoqueMaximo,
          status: p.status as 'ATIVO' | 'INATIVO',
          fornecedores: p.fornecedores.map((f) => ({
            fornecedorId: f.fornecedor.id,
            codigoNoFornecedor: f.codigoNoFornecedor ?? '',
            prazoEntregaDias: f.prazoEntregaDias,
            principal: f.principal,
          })),
        }}
      />
    </>
  );
}
