'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  fornecedorSchema,
  ROTULOS_SITUACAO_FORNECEDOR,
  SITUACOES_FORNECEDOR,
  UFS,
} from '@estoque/shared';
import { Cartao } from '@/components/ui/basicos';
import { Botao } from '@/components/ui/botao';
import { AreaTexto, Campo, Entrada, Selecao } from '@/components/ui/campos';
import { api } from '@/lib/api';
import { tratarErro } from '@/lib/utils';

export type FormFornecedor = z.input<typeof fornecedorSchema>;

export function FormularioFornecedor({
  id,
  inicial,
  somenteLeitura,
}: {
  id?: string;
  inicial?: Partial<FormFornecedor>;
  somenteLeitura?: boolean;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const form = useForm<FormFornecedor, unknown, z.output<typeof fornecedorSchema>>({
    resolver: zodResolver(fornecedorSchema),
    defaultValues: { tipoPessoa: 'PJ', situacao: 'ATIVO', contatos: [], ...inicial },
  });
  const contatos = useFieldArray({ control: form.control, name: 'contatos' });
  const tipo = form.watch('tipoPessoa');
  const e = form.formState.errors;

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit(async (dados) => {
        try {
          const f = await api<{ id: string }>(id ? `/fornecedores/${id}` : '/fornecedores', {
            metodo: id ? 'PUT' : 'POST',
            corpo: dados,
          });
          await qc.invalidateQueries({ queryKey: ['/fornecedores'] });
          toast.success(id ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.');
          if (!id) router.push(`/fornecedores/${f.id}`);
        } catch (erro) {
          tratarErro(erro, form.setError);
        }
      })}
    >
      <fieldset disabled={somenteLeitura} className="space-y-4">
        <Cartao titulo="Dados cadastrais">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Campo rotulo="Tipo de pessoa" erro={e.tipoPessoa?.message} obrigatorio>
              <Selecao {...form.register('tipoPessoa')}>
                <option value="PJ">Jurídica</option>
                <option value="PF">Física</option>
              </Selecao>
            </Campo>
            <Campo rotulo={tipo === 'PF' ? 'CPF' : 'CNPJ'} erro={e.documento?.message} obrigatorio>
              <Entrada
                inputMode="numeric"
                {...form.register('documento')}
                placeholder={tipo === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
              />
            </Campo>
            <Campo rotulo="Inscrição estadual" erro={e.inscricaoEstadual?.message}>
              <Entrada {...form.register('inscricaoEstadual')} />
            </Campo>
            <Campo rotulo="Situação cadastral" erro={e.situacao?.message}>
              <Selecao {...form.register('situacao')}>
                {SITUACOES_FORNECEDOR.map((s) => (
                  <option key={s} value={s}>
                    {ROTULOS_SITUACAO_FORNECEDOR[s]}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo
              rotulo={tipo === 'PF' ? 'Nome' : 'Razão social'}
              erro={e.razaoSocial?.message}
              obrigatorio
              className="md:col-span-2"
            >
              <Entrada {...form.register('razaoSocial')} />
            </Campo>
            <Campo rotulo="Nome fantasia" erro={e.nomeFantasia?.message} className="md:col-span-2">
              <Entrada {...form.register('nomeFantasia')} />
            </Campo>
            <Campo rotulo="E-mail" erro={e.email?.message} className="md:col-span-2">
              <Entrada type="email" autoComplete="email" {...form.register('email')} />
            </Campo>
            <Campo rotulo="Telefone" erro={e.telefone?.message} className="md:col-span-2">
              <Entrada type="tel" autoComplete="tel" {...form.register('telefone')} />
            </Campo>
          </div>
        </Cartao>
        <Cartao titulo="Endereço">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
            <Campo rotulo="CEP" erro={e.cep?.message}>
              <Entrada inputMode="numeric" autoComplete="postal-code" {...form.register('cep')} />
            </Campo>
            <Campo rotulo="Logradouro" erro={e.logradouro?.message} className="md:col-span-3">
              <Entrada autoComplete="address-line1" {...form.register('logradouro')} />
            </Campo>
            <Campo rotulo="Número" erro={e.numero?.message}>
              <Entrada {...form.register('numero')} />
            </Campo>
            <Campo rotulo="Complemento" erro={e.complemento?.message}>
              <Entrada {...form.register('complemento')} />
            </Campo>
            <Campo rotulo="Bairro" erro={e.bairro?.message} className="md:col-span-2">
              <Entrada {...form.register('bairro')} />
            </Campo>
            <Campo rotulo="Cidade" erro={e.cidade?.message} className="md:col-span-3">
              <Entrada autoComplete="address-level2" {...form.register('cidade')} />
            </Campo>
            <Campo rotulo="UF" erro={e.uf?.message}>
              <Selecao {...form.register('uf')}>
                <option value="">—</option>
                {UFS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Observações" erro={e.observacoes?.message} className="md:col-span-6">
              <AreaTexto rows={2} {...form.register('observacoes')} />
            </Campo>
          </div>
        </Cartao>
        <Cartao
          titulo="Contatos"
          acoes={
            !somenteLeitura && (
              <Botao
                variante="secundario"
                tamanho="sm"
                icone={<Plus className="h-4 w-4" aria-hidden />}
                onClick={() => contatos.append({ nome: '' })}
              >
                Adicionar contato
              </Botao>
            )
          }
        >
          {contatos.fields.length === 0 && (
            <p className="text-sm text-suave">Nenhum contato cadastrado.</p>
          )}
          <div className="space-y-3">
            {contatos.fields.map((c, i) => (
              <fieldset
                key={c.id}
                className="grid grid-cols-1 items-end gap-3 rounded-md border border-gray-100 p-3 md:grid-cols-[2fr_1fr_2fr_1fr_auto]"
              >
                <legend className="sr-only">Contato {i + 1}</legend>
                <Campo rotulo="Nome" erro={e.contatos?.[i]?.nome?.message} obrigatorio>
                  <Entrada {...form.register(`contatos.${i}.nome`)} />
                </Campo>
                <Campo rotulo="Cargo">
                  <Entrada {...form.register(`contatos.${i}.cargo`)} />
                </Campo>
                <Campo rotulo="E-mail" erro={e.contatos?.[i]?.email?.message}>
                  <Entrada type="email" {...form.register(`contatos.${i}.email`)} />
                </Campo>
                <Campo rotulo="Telefone" erro={e.contatos?.[i]?.telefone?.message}>
                  <Entrada type="tel" {...form.register(`contatos.${i}.telefone`)} />
                </Campo>
                <Botao
                  variante="fantasma"
                  tamanho="icone"
                  aria-label={`Remover contato ${i + 1}`}
                  onClick={() => contatos.remove(i)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Botao>
              </fieldset>
            ))}
          </div>
        </Cartao>
      </fieldset>
      {!somenteLeitura && (
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={() => router.back()}>
            Voltar
          </Botao>
          <Botao type="submit" carregando={form.formState.isSubmitting}>
            {id ? 'Salvar alterações' : 'Cadastrar fornecedor'}
          </Botao>
        </div>
      )}
    </form>
  );
}
