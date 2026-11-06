'use client';

import { CabecalhoPagina } from '@/components/ui/basicos';
import { FormularioProduto } from '../formulario-produto';

export default function NovoProduto() {
  return (
    <>
      <CabecalhoPagina titulo="Novo produto" descricao="Campos marcados com * são obrigatórios" />
      <FormularioProduto />
    </>
  );
}
