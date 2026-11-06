'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { produtoSchema } from '@estoque/shared';
import { Cartao } from '@/components/ui/basicos';
import { Botao } from '@/components/ui/botao';
import { AreaTexto, Caixa, Campo, Entrada, Selecao } from '@/components/ui/campos';
import { api } from '@/lib/api';
import { useCategorias, useFornecedoresAtivos, useLocais, useUnidades } from '@/lib/hooks';
import { tratarErro } from '@/lib/utils';

type Entrada_ = z.input<typeof produtoSchema>;
type Saida = z.output<typeof produtoSchema>;

export function FormularioProduto({ id, inicial }: { id?: string; inicial?: Partial<Entrada_> }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: categorias } = useCategorias();
  const { data: unidades } = useUnidades();
  const { data: locais } = useLocais();
  const { data: fornecedores } = useFornecedoresAtivos();
  const form = useForm<Entrada_, unknown, Saida>({
    resolver: zodResolver(produtoSchema),
    defaultValues: {
      status: 'ATIVO',
      precoCusto: 0,
      precoVenda: 0,
      estoqueMinimo: 0,
      fornecedores: [],
      ...inicial,
    },
  });
  const forn = useFieldArray({ control: form.control, name: 'fornecedores' });
  const e = form.formState.errors;

  const enviar = form.handleSubmit(async (dados) => {
    try {
      const p = await api<{ id: string }>(id ? `/produtos/${id}` : '/produtos', {
        metodo: id ? 'PUT' : 'POST',
        corpo: dados,
      });
      await qc.invalidateQueries({ queryKey: ['/produtos'] });
      toast.success(id ? 'Produto atualizado.' : 'Produto cadastrado.');
      router.push(`/produtos/${p.id}`);
    } catch (erro) {
      tratarErro(erro, form.setError);
    }
  });

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <Cartao titulo="Identificação">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Campo rotulo="Código interno" erro={e.codigoInterno?.message} obrigatorio>
            <Entrada {...form.register('codigoInterno')} />
          </Campo>
          <Campo
            rotulo="SKU"
            erro={e.sku?.message}
            obrigatorio
            dica="Usado na integração com o CRM"
          >
            <Entrada {...form.register('sku')} className="uppercase" />
          </Campo>
          <Campo
            rotulo="Código de barras"
            erro={e.codigoBarras?.message}
            dica="EAN/GTIN ou código próprio"
          >
            <Entrada inputMode="numeric" {...form.register('codigoBarras')} />
          </Campo>
          <Campo rotulo="Nome" erro={e.nome?.message} obrigatorio className="md:col-span-2">
            <Entrada {...form.register('nome')} />
          </Campo>
          <Campo rotulo="Status" erro={e.status?.message}>
            <Selecao {...form.register('status')}>
              <option value="ATIVO">Ativo</option>
              <option value="INATIVO">Inativo</option>
            </Selecao>
          </Campo>
          <Campo rotulo="Descrição" erro={e.descricao?.message} className="md:col-span-3">
            <AreaTexto {...form.register('descricao')} />
          </Campo>
          <Campo rotulo="Categoria / subcategoria" erro={e.categoriaId?.message}>
            <Selecao {...form.register('categoriaId')}>
              <option value="">Sem categoria</option>
              {categorias?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.caminho}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Unidade de medida" erro={e.unidadeMedidaId?.message} obrigatorio>
            <Selecao {...form.register('unidadeMedidaId')}>
              <option value="">Selecione…</option>
              {unidades?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.sigla} — {u.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Localização física padrão" erro={e.localPadraoId?.message}>
            <Selecao {...form.register('localPadraoId')}>
              <option value="">Não definida</option>
              {locais?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codigo} — {l.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
        </div>
      </Cartao>

      <Cartao titulo="Preços e níveis de estoque">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Campo rotulo="Preço de custo (R$)" erro={e.precoCusto?.message}>
            <Entrada
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              {...form.register('precoCusto')}
            />
          </Campo>
          <Campo rotulo="Preço de venda (R$)" erro={e.precoVenda?.message}>
            <Entrada
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              {...form.register('precoVenda')}
            />
          </Campo>
          <Campo
            rotulo="Estoque mínimo"
            erro={e.estoqueMinimo?.message}
            dica="Abaixo disso, gera alerta de reposição"
          >
            <Entrada
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              {...form.register('estoqueMinimo')}
            />
          </Campo>
          <Campo
            rotulo="Estoque máximo"
            erro={e.estoqueMaximo?.message}
            dica="Base da sugestão de compra"
          >
            <Entrada
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              {...form.register('estoqueMaximo', { setValueAs: (v) => (v === '' ? null : v) })}
            />
          </Campo>
        </div>
      </Cartao>

      <Cartao
        titulo="Fornecedores do produto"
        acoes={
          <Botao
            variante="secundario"
            tamanho="sm"
            icone={<Plus className="h-4 w-4" aria-hidden />}
            onClick={() => forn.append({ fornecedorId: '', principal: forn.fields.length === 0 })}
          >
            Adicionar
          </Botao>
        }
      >
        {forn.fields.length === 0 && (
          <p className="text-sm text-suave">Nenhum fornecedor vinculado.</p>
        )}
        <div className="space-y-3">
          {forn.fields.map((campo, i) => (
            <fieldset
              key={campo.id}
              className="grid grid-cols-1 items-end gap-3 rounded-md border border-gray-100 p-3 md:grid-cols-[2fr_1fr_1fr_auto_auto]"
            >
              <legend className="sr-only">Fornecedor {i + 1}</legend>
              <Campo
                rotulo="Fornecedor"
                erro={e.fornecedores?.[i]?.fornecedorId?.message}
                obrigatorio
              >
                <Selecao {...form.register(`fornecedores.${i}.fornecedorId`)}>
                  <option value="">Selecione…</option>
                  {fornecedores?.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.razaoSocial}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Campo rotulo="Código no fornecedor">
                <Entrada {...form.register(`fornecedores.${i}.codigoNoFornecedor`)} />
              </Campo>
              <Campo rotulo="Prazo de entrega (dias)">
                <Entrada
                  type="number"
                  min="0"
                  {...form.register(`fornecedores.${i}.prazoEntregaDias`, {
                    setValueAs: (v) => (v === '' ? null : v),
                  })}
                />
              </Campo>
              <Caixa
                rotulo="Principal"
                className="pb-2.5"
                {...form.register(`fornecedores.${i}.principal`)}
              />
              <Botao
                variante="fantasma"
                tamanho="icone"
                aria-label={`Remover fornecedor ${i + 1}`}
                onClick={() => forn.remove(i)}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Botao>
            </fieldset>
          ))}
          {e.fornecedores?.message && (
            <p className="text-xs font-medium text-red-700">{e.fornecedores.message}</p>
          )}
        </div>
      </Cartao>

      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={() => router.back()}>
          Cancelar
        </Botao>
        <Botao type="submit" carregando={form.formState.isSubmitting}>
          {id ? 'Salvar alterações' : 'Cadastrar produto'}
        </Botao>
      </div>
    </form>
  );
}
