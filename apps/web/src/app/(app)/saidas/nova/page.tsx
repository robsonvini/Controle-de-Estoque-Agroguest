'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { MOTIVOS_SAIDA, ROTULOS_MOTIVO, saidaSchema } from '@estoque/shared';
import { ItensMovimento, SelecaoCliente } from '@/components/itens-movimento';
import { CabecalhoPagina, Carregando, Cartao } from '@/components/ui/basicos';
import { Botao } from '@/components/ui/botao';
import { AreaTexto, Campo, Entrada, Selecao } from '@/components/ui/campos';
import { api, novaChaveIdempotencia } from '@/lib/api';
import { useFornecedoresAtivos } from '@/lib/hooks';
import { useProdutoInicial } from '@/lib/produto-inicial';
import { tratarErro } from '@/lib/utils';

type Form = z.input<typeof saidaSchema>;

function Formulario({
  produtoInicial,
}: {
  produtoInicial: ReturnType<typeof useProdutoInicial>['produto'];
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const chave = useMemo(() => novaChaveIdempotencia(), []);
  const form = useForm<Form, unknown, z.output<typeof saidaSchema>>({
    resolver: zodResolver(saidaSchema),
    defaultValues: {
      motivo: 'VENDA',
      itens: [{ produtoId: produtoInicial?.id ?? '', localId: '', quantidade: '' }],
    },
  });
  const motivo = form.watch('motivo');
  const { data: fornecedores } = useFornecedoresAtivos(motivo === 'DEVOLUCAO_FORNECEDOR');
  const e = form.formState.errors;

  const enviar = form.handleSubmit(async (dados) => {
    try {
      const mov = await api<{ id: string; numero: string }>('/movimentacoes/saidas', {
        metodo: 'POST',
        corpo: dados,
        idempotencia: chave,
      });
      await qc.invalidateQueries();
      toast.success(`Saída nº ${mov.numero} registrada. Saldo atualizado.`);
      router.push(`/movimentacoes/${mov.id}`);
    } catch (erro) {
      tratarErro(erro, form.setError);
    }
  });

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <Cartao titulo="Dados da saída">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Campo rotulo="Motivo" erro={e.motivo?.message} obrigatorio>
            <Selecao {...form.register('motivo')}>
              {MOTIVOS_SAIDA.map((m) => (
                <option key={m} value={m}>
                  {ROTULOS_MOTIVO[m]}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo
            rotulo="Data e hora da movimentação"
            erro={e.dataMovimentacao?.message}
            dica="Em branco: agora"
          >
            <Entrada
              type="datetime-local"
              {...form.register('dataMovimentacao', {
                setValueAs: (v) => (v ? new Date(v).toISOString() : undefined),
              })}
            />
          </Campo>
          <Campo rotulo="Nº do documento" erro={e.numeroDocumento?.message}>
            <Entrada {...form.register('numeroDocumento')} />
          </Campo>
          {motivo === 'CONSUMO_INTERNO' && (
            <Campo rotulo="Setor / destino do consumo" erro={e.destino?.message} obrigatorio>
              <Entrada {...form.register('destino')} placeholder="Ex.: Viveiro de mudas" />
            </Campo>
          )}
          {motivo === 'DEVOLUCAO_FORNECEDOR' && (
            <Campo rotulo="Fornecedor" erro={e.fornecedorId?.message} obrigatorio>
              <Selecao {...form.register('fornecedorId')}>
                <option value="">Selecione…</option>
                {fornecedores?.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.razaoSocial}
                  </option>
                ))}
              </Selecao>
            </Campo>
          )}
        </div>
        {motivo === 'VENDA' && (
          <div className="mt-4">
            <SelecaoCliente
              registro={form.register('clienteCrmId') as never}
              erro={e.clienteCrmId?.message}
            />
          </div>
        )}
        <Campo
          rotulo={
            motivo === 'PERDA' || motivo === 'AVARIA'
              ? 'Descrição da perda ou avaria'
              : 'Observação'
          }
          erro={e.observacao?.message}
          obrigatorio={motivo === 'PERDA' || motivo === 'AVARIA'}
          className="mt-4"
        >
          <AreaTexto {...form.register('observacao')} />
        </Campo>
      </Cartao>
      <Cartao>
        <ItensMovimento
          control={form.control}
          register={form.register}
          erros={e.itens}
          rotuloLocal="Local de saída"
          produtoInicial={produtoInicial}
        />
      </Cartao>
      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={() => router.back()}>
          Cancelar
        </Botao>
        <Botao type="submit" carregando={form.formState.isSubmitting}>
          Registrar saída
        </Botao>
      </div>
    </form>
  );
}

export default function NovaSaida() {
  const { produto, carregando } = useProdutoInicial();
  return (
    <>
      <CabecalhoPagina
        titulo="Nova saída"
        descricao="A baixa só é aceita se houver saldo disponível (não reservado) no local"
      />
      {carregando ? <Carregando /> : <Formulario produtoInicial={produto} />}
    </>
  );
}
