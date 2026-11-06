'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { formatarMoeda, pedidoCompraSchema } from '@estoque/shared';
import { BuscaProduto, type ProdutoOpcao } from '@/components/busca-produto';
import { CabecalhoPagina, Carregando, Cartao } from '@/components/ui/basicos';
import { Botao } from '@/components/ui/botao';
import { AreaTexto, Campo, Entrada, Selecao } from '@/components/ui/campos';
import { api, novaChaveIdempotencia } from '@/lib/api';
import { useFornecedoresAtivos } from '@/lib/hooks';
import { useProdutoInicial } from '@/lib/produto-inicial';
import { tratarErro } from '@/lib/utils';

type Form = z.input<typeof pedidoCompraSchema>;

function Formulario({ produtoInicial }: { produtoInicial: ProdutoOpcao | null }) {
  const router = useRouter();
  const qc = useQueryClient();
  const chave = useMemo(() => novaChaveIdempotencia(), []);
  const { data: fornecedores } = useFornecedoresAtivos();
  const [produtos, setProdutos] = useState<Record<string, ProdutoOpcao | null>>({});
  const form = useForm<Form, unknown, z.output<typeof pedidoCompraSchema>>({
    resolver: zodResolver(pedidoCompraSchema),
    defaultValues: {
      itens: [
        {
          produtoId: produtoInicial?.id ?? '',
          quantidade: '',
          precoUnitario: produtoInicial?.custoMedio ?? '',
        },
      ],
    },
  });
  const itens = useFieldArray({ control: form.control, name: 'itens' });
  const valores = form.watch('itens');
  const total = valores.reduce(
    (t, i) => t + Number(i.quantidade || 0) * Number(i.precoUnitario || 0),
    0,
  );
  const e = form.formState.errors;

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit(async (dados) => {
        try {
          const p = await api<{ id: string; numero: string }>('/compras', {
            metodo: 'POST',
            corpo: dados,
            idempotencia: chave,
          });
          await qc.invalidateQueries({ queryKey: ['/compras'] });
          toast.success(`Pedido de compra nº ${p.numero} criado como rascunho.`);
          router.push(`/compras/${p.id}`);
        } catch (erro) {
          tratarErro(erro, form.setError);
        }
      })}
    >
      <Cartao titulo="Pedido">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Campo
            rotulo="Fornecedor"
            erro={e.fornecedorId?.message}
            obrigatorio
            className="md:col-span-2"
          >
            <Selecao {...form.register('fornecedorId')}>
              <option value="">Selecione…</option>
              {fornecedores?.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.razaoSocial}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Previsão de entrega" erro={e.previsaoEntrega?.message}>
            <Entrada
              type="date"
              {...form.register('previsaoEntrega', { setValueAs: (v) => (v ? v : null) })}
            />
          </Campo>
          <Campo rotulo="Observação" erro={e.observacao?.message} className="md:col-span-3">
            <AreaTexto rows={2} {...form.register('observacao')} />
          </Campo>
        </div>
      </Cartao>
      <Cartao
        titulo="Itens"
        acoes={
          <span className="text-sm">
            Total: <strong>{formatarMoeda(total)}</strong>
          </span>
        }
      >
        <div className="space-y-3">
          {itens.fields.map((campo, i) => (
            <div
              key={campo.id}
              className="grid grid-cols-1 items-start gap-3 rounded-md border border-gray-200 p-3 md:grid-cols-[3fr_1fr_1fr_auto]"
            >
              <Controller
                control={form.control}
                name={`itens.${i}.produtoId`}
                render={({ field }) => (
                  <BuscaProduto
                    rotulo={`Produto do item ${i + 1}`}
                    valor={produtos[campo.id] ?? (i === 0 ? produtoInicial : null)}
                    erro={e.itens?.[i]?.produtoId?.message}
                    aoSelecionar={(p) => {
                      setProdutos((m) => ({ ...m, [campo.id]: p }));
                      field.onChange(p?.id ?? '');
                      if (p && !form.getValues(`itens.${i}.precoUnitario`))
                        form.setValue(`itens.${i}.precoUnitario`, p.custoMedio);
                    }}
                  />
                )}
              />
              <Campo rotulo="Quantidade" erro={e.itens?.[i]?.quantidade?.message} obrigatorio>
                <Entrada
                  type="number"
                  step="any"
                  min="0"
                  {...form.register(`itens.${i}.quantidade`)}
                />
              </Campo>
              <Campo
                rotulo="Preço unitário (R$)"
                erro={e.itens?.[i]?.precoUnitario?.message}
                obrigatorio
              >
                <Entrada
                  type="number"
                  step="0.0001"
                  min="0"
                  {...form.register(`itens.${i}.precoUnitario`)}
                />
              </Campo>
              <div className="md:pt-6">
                <Botao
                  variante="fantasma"
                  tamanho="icone"
                  aria-label={`Remover item ${i + 1}`}
                  disabled={itens.fields.length === 1}
                  onClick={() => itens.remove(i)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Botao>
              </div>
            </div>
          ))}
          {e.itens?.message && (
            <p className="text-xs font-medium text-red-700">{e.itens.message}</p>
          )}
          <Botao
            variante="secundario"
            tamanho="sm"
            icone={<Plus className="h-4 w-4" aria-hidden />}
            onClick={() => itens.append({ produtoId: '', quantidade: '', precoUnitario: '' })}
          >
            Adicionar item
          </Botao>
        </div>
      </Cartao>
      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={() => router.back()}>
          Cancelar
        </Botao>
        <Botao type="submit" carregando={form.formState.isSubmitting}>
          Salvar rascunho
        </Botao>
      </div>
    </form>
  );
}

export default function NovaCompra() {
  const { produto, carregando } = useProdutoInicial();
  return (
    <>
      <CabecalhoPagina
        titulo="Novo pedido de compra"
        descricao="O pedido é salvo como rascunho e depois enviado ao fornecedor"
      />
      {carregando ? <Carregando /> : <Formulario produtoInicial={produto} />}
    </>
  );
}
