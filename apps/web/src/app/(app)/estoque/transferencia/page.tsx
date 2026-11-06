'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { transferenciaSchema } from '@estoque/shared';
import { ItensMovimento } from '@/components/itens-movimento';
import { CabecalhoPagina, Cartao } from '@/components/ui/basicos';
import { Botao } from '@/components/ui/botao';
import { AreaTexto, Campo, Selecao } from '@/components/ui/campos';
import { api, novaChaveIdempotencia } from '@/lib/api';
import { useLocais } from '@/lib/hooks';
import { tratarErro } from '@/lib/utils';

type Form = z.input<typeof transferenciaSchema>;

export default function Transferencia() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: locais } = useLocais();
  const chave = useMemo(() => novaChaveIdempotencia(), []);
  const form = useForm<Form, unknown, z.output<typeof transferenciaSchema>>({
    resolver: zodResolver(transferenciaSchema),
    defaultValues: { itens: [{ produtoId: '', quantidade: '' }] },
  });
  const e = form.formState.errors;

  const enviar = form.handleSubmit(async (dados) => {
    try {
      const mov = await api<{ id: string; numero: string }>('/movimentacoes/transferencias', {
        metodo: 'POST',
        corpo: dados,
        idempotencia: chave,
      });
      await qc.invalidateQueries();
      toast.success(`Transferência nº ${mov.numero} registrada.`);
      router.push(`/movimentacoes/${mov.id}`);
    } catch (erro) {
      tratarErro(erro, form.setError);
    }
  });

  return (
    <>
      <CabecalhoPagina
        titulo="Transferência entre locais"
        descricao="Move saldo de um local de armazenamento para outro"
      />
      <form onSubmit={enviar} noValidate className="space-y-4">
        <Cartao titulo="Locais">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Campo rotulo="Local de origem" erro={e.localOrigemId?.message} obrigatorio>
              <Selecao {...form.register('localOrigemId')}>
                <option value="">Selecione…</option>
                {locais?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo} — {l.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Local de destino" erro={e.localDestinoId?.message} obrigatorio>
              <Selecao {...form.register('localDestinoId')}>
                <option value="">Selecione…</option>
                {locais?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo} — {l.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Observação" erro={e.observacao?.message} className="md:col-span-2">
              <AreaTexto {...form.register('observacao')} />
            </Campo>
          </div>
        </Cartao>
        <Cartao>
          <ItensMovimento
            control={form.control}
            register={form.register}
            erros={e.itens}
            comLocal={false}
          />
        </Cartao>
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={() => router.back()}>
            Cancelar
          </Botao>
          <Botao type="submit" carregando={form.formState.isSubmitting}>
            Transferir
          </Botao>
        </div>
      </form>
    </>
  );
}
