'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  Controller,
  useFieldArray,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form';
import { formatarMoeda, formatarQuantidade } from '@estoque/shared';
import { BuscaProduto, type ProdutoOpcao } from './busca-produto';
import { Botao } from './ui/botao';
import { Campo, Entrada, Selecao } from './ui/campos';
import { api, type Paginado } from '@/lib/api';
import { useLocais } from '@/lib/hooks';

export interface ItemFormulario {
  produtoId: string;
  localId?: string;
  quantidade: number | string;
  custoUnitario?: number | string | null;
}

/**
 * Lista de itens de uma movimentação. Cada linha tem busca de produto,
 * local (exceto em transferências, cujo local é do cabeçalho), quantidade e custo.
 */
export function ItensMovimento({
  control: controlBruto,
  register: registerBruto,
  erros: errosBrutos,
  comLocal = true,
  comCusto = false,
  rotuloLocal = 'Local',
  produtoInicial,
}: {
  /** Control/register do formulário pai (qualquer formulário com o campo itens). */
  control: unknown;
  register: unknown;
  erros?: unknown;
  comLocal?: boolean;
  comCusto?: boolean;
  rotuloLocal?: string;
  produtoInicial?: ProdutoOpcao | null;
}) {
  const control = controlBruto as Control<{ itens: ItemFormulario[] }>;
  const register = registerBruto as UseFormRegister<{ itens: ItemFormulario[] }>;
  const erros = errosBrutos as FieldErrors<{ itens: ItemFormulario[] }>['itens'];
  const { fields, append, remove } = useFieldArray({ control, name: 'itens' });
  const { data: locais } = useLocais();
  const [produtos, setProdutos] = useState<Record<string, ProdutoOpcao | null>>(
    produtoInicial ? { [fields[0]?.id ?? '0']: produtoInicial } : {},
  );

  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-base font-semibold">Itens</legend>
      {fields.map((campo, i) => {
        const produto = produtos[campo.id] ?? (i === 0 ? produtoInicial : null) ?? null;
        const erro = erros?.[i];
        return (
          <div key={campo.id} className="rounded-md border border-gray-200 p-3">
            <div
              className={`grid grid-cols-1 items-start gap-3 ${comCusto ? 'md:grid-cols-[3fr_2fr_1fr_1fr_auto]' : comLocal ? 'md:grid-cols-[3fr_2fr_1fr_auto]' : 'md:grid-cols-[4fr_1fr_auto]'}`}
            >
              <Controller
                control={control}
                name={`itens.${i}.produtoId`}
                render={({ field }) => (
                  <BuscaProduto
                    rotulo={`Produto do item ${i + 1}`}
                    valor={produto}
                    erro={erro?.produtoId?.message}
                    aoSelecionar={(p) => {
                      setProdutos((m) => ({ ...m, [campo.id]: p }));
                      field.onChange(p?.id ?? '');
                    }}
                  />
                )}
              />
              {comLocal && (
                <Campo rotulo={rotuloLocal} erro={erro?.localId?.message} obrigatorio>
                  <Selecao {...register(`itens.${i}.localId`)}>
                    <option value="">Selecione…</option>
                    {locais?.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.codigo} — {l.nome}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
              )}
              <Campo
                rotulo={`Quantidade${produto ? ` (${produto.unidadeSigla})` : ''}`}
                erro={erro?.quantidade?.message}
                obrigatorio
                dica={produto ? `Disponível: ${formatarQuantidade(produto.disponivel)}` : undefined}
              >
                <Entrada
                  type="number"
                  step={
                    produto ? (produto.casasDecimais ? 1 / 10 ** produto.casasDecimais : 1) : 'any'
                  }
                  min="0"
                  inputMode="decimal"
                  {...register(`itens.${i}.quantidade`)}
                />
              </Campo>
              {comCusto && (
                <Campo
                  rotulo="Custo unitário (R$)"
                  erro={erro?.custoUnitario?.message}
                  dica={produto ? `Custo médio: ${formatarMoeda(produto.custoMedio)}` : undefined}
                >
                  <Entrada
                    type="number"
                    step="0.0001"
                    min="0"
                    inputMode="decimal"
                    {...register(`itens.${i}.custoUnitario`, {
                      setValueAs: (v) => (v === '' ? null : v),
                    })}
                  />
                </Campo>
              )}
              <div className="md:pt-6">
                <Botao
                  variante="fantasma"
                  tamanho="icone"
                  aria-label={`Remover item ${i + 1}`}
                  disabled={fields.length === 1}
                  onClick={() => remove(i)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Botao>
              </div>
            </div>
          </div>
        );
      })}
      {typeof erros?.message === 'string' && (
        <p className="text-xs font-medium text-red-700">{erros.message}</p>
      )}
      {typeof erros?.root?.message === 'string' && (
        <p className="text-xs font-medium text-red-700">{erros.root.message}</p>
      )}
      <Botao
        variante="secundario"
        tamanho="sm"
        icone={<Plus className="h-4 w-4" aria-hidden />}
        onClick={() => append({ produtoId: '', localId: '', quantidade: '' })}
      >
        Adicionar item
      </Botao>
    </fieldset>
  );
}

/** Seleção de cliente do espelho do CRM com busca. */
export function SelecaoCliente({
  registro,
  erro,
}: {
  registro: ReturnType<UseFormRegister<Record<string, unknown>>>;
  erro?: string;
}) {
  const [busca, setBusca] = useState('');
  const { data } = useClientes(busca);
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Campo rotulo="Filtrar clientes">
        <Entrada
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Nome ou CNPJ"
        />
      </Campo>
      <Campo rotulo="Cliente (CRM)" erro={erro}>
        <Selecao {...registro}>
          <option value="">Não informado</option>
          {data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
              {c.razaoSocial ? ` — ${c.razaoSocial}` : ''}
            </option>
          ))}
        </Selecao>
      </Campo>
    </div>
  );
}

function useClientes(busca: string) {
  return useQuery({
    queryKey: ['/clientes', 'selecao', busca],
    queryFn: () =>
      api<Paginado<{ id: string; nome: string; razaoSocial: string | null }>>('/clientes', {
        consulta: { busca, porPagina: 100 },
      }),
    select: (r) => r.dados,
    staleTime: 30_000,
  });
}
