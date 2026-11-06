'use client';

import { CabecalhoPagina } from '@/components/ui/basicos';
import { FormularioFornecedor } from '../formulario-fornecedor';

export default function NovoFornecedor() {
  return (
    <>
      <CabecalhoPagina
        titulo="Novo fornecedor"
        descricao="Campos marcados com * são obrigatórios"
      />
      <FormularioFornecedor />
    </>
  );
}
