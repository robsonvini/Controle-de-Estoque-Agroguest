'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { entradaSchema, MOTIVOS_ENTRADA, ROTULOS_MOTIVO } from '@estoque/shared';
import { ItensMovimento, SelecaoCliente } from '@/components/itens-movimento';
import { CabecalhoPagina, Carregando, Cartao } from '@/components/ui/basicos';
import { Botao } from '@/components/ui/botao';
import { AreaTexto, Campo, Entrada, Selecao } from '@/components/ui/campos';
import { api, novaChaveIdempotencia } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFornecedoresAtivos } from '@/lib/hooks';
import { useProdutoInicial } from '@/lib/produto-inicial';
import { tratarErro } from '@/lib/utils';

type Form = z.input<typeof entradaSchema>;

function Formulario({
  produtoInicial,
}: {
  produtoInicial: ReturnType<typeof useProdutoInicial>['produto'];
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { tem } = useAuth();
  const { data: fornecedores } = useFornecedoresAtivos();
  const chave = useMemo(() => novaChaveIdempotencia(), []);
  const form = useForm<Form, unknown, z.output<typeof entradaSchema>>({
    resolver: zodResolver(entradaSchema),
    defaultValues: {
      motivo: 'RECEBIMENTO',
      itens: [
        {
          produtoId: produtoInicial?.id ?? '',
          localId: '',
          quantidade: '',
          custoUnitario: produtoInicial?.custoMedio ?? null,
        },
      ],
    },
  });
  const motivo = form.watch('motivo');
  const e = form.formState.errors;
  const motivos = MOTIVOS_ENTRADA.filter((m) => m !== 'AJUSTE_POSITIVO' || tem('ajustes:aprovar'));

  const enviar = form.handleSubmit(async (dados) => {
    try {
      const mov = await api<{ id: string; numero: string }>('/movimentacoes/entradas', {
        metodo: 'POST',
        corpo: dados,
        idempotencia: chave,
      });
      await qc.invalidateQueries();
      toast.success(`Entrada nº ${mov.numero} registrada. Saldo atualizado.`);
      router.push(`/movimentacoes/${mov.id}`);
    } catch (erro) {
      tratarErro(erro, form.setError);
    }
  });

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <Cartao titulo="Dados da entrada">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Campo rotulo="Motivo" erro={e.motivo?.message} obrigatorio>
            <Selecao {...form.register('motivo')}>
              {motivos.map((m) => (
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
          {(motivo === 'COMPRA' || motivo === 'RECEBIMENTO') && (
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
          <Campo rotulo="Nº da nota fiscal / documento" erro={e.numeroDocumento?.message}>
            <Entrada {...form.register('numeroDocumento')} />
          </Campo>
          <Campo rotulo="Série" erro={e.serieDocumento?.message}>
            <Entrada {...form.register('serieDocumento')} />
          </Campo>
          <Campo rotulo="Data do documento" erro={e.dataDocumento?.message}>
            <Entrada
              type="date"
              {...form.register('dataDocumento', { setValueAs: (v) => (v ? v : null) })}
            />
          </Campo>
        </div>
        {motivo === 'DEVOLUCAO_CLIENTE' && (
          <div className="mt-4">
            <SelecaoCliente
              registro={form.register('clienteCrmId') as never}
              erro={e.clienteCrmId?.message}
            />
          </div>
        )}
        <Campo
          rotulo={motivo === 'AJUSTE_POSITIVO' ? 'Justificativa do ajuste' : 'Observação'}
          erro={e.observacao?.message}
          obrigatorio={motivo === 'AJUSTE_POSITIVO'}
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
          comCusto
          produtoInicial={produtoInicial}
        />
      </Cartao>
      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={() => router.back()}>
          Cancelar
        </Botao>
        <Botao type="submit" carregando={form.formState.isSubmitting}>
          Registrar entrada
        </Botao>
      </div>
    </form>
  );
}

export default function NovaEntrada() {
  const { produto, carregando } = useProdutoInicial();
  return (
    <>
      <CabecalhoPagina
        titulo="Nova entrada"
        descricao="A entrada atualiza o saldo e o custo médio imediatamente"
      />
      {carregando ? <Carregando /> : <Formulario produtoInicial={produto} />}
    </>
  );
}
