'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { pedidoVendaSchema } from '@estoque/shared';
import { ItensMovimento, SelecaoCliente } from '@/components/itens-movimento';
import { CabecalhoPagina, Cartao } from '@/components/ui/basicos';
import { Botao } from '@/components/ui/botao';
import { AreaTexto, Campo } from '@/components/ui/campos';
import { api, novaChaveIdempotencia } from '@/lib/api';
import { tratarErro } from '@/lib/utils';

type Form = z.input<typeof pedidoVendaSchema>;

export default function NovoPedido() {
  const router = useRouter();
  const qc = useQueryClient();
  const chave = useMemo(() => novaChaveIdempotencia(), []);
  const form = useForm<Form, unknown, z.output<typeof pedidoVendaSchema>>({
    resolver: zodResolver(pedidoVendaSchema),
    defaultValues: { itens: [{ produtoId: '', localId: '', quantidade: '' }] },
  });
  const e = form.formState.errors;
  return (
    <>
      <CabecalhoPagina
        titulo="Novo pedido de venda"
        descricao="O estoque fica reservado até a confirmação (baixa) ou o cancelamento"
      />
      <form
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit(async (dados) => {
          try {
            const p = await api<{ id: string; numero: string }>('/pedidos', {
              metodo: 'POST',
              corpo: dados,
              idempotencia: chave,
            });
            await qc.invalidateQueries();
            toast.success(`Pedido nº ${p.numero} criado e estoque reservado.`);
            router.push(`/pedidos/${p.id}`);
          } catch (erro) {
            tratarErro(erro, form.setError);
          }
        })}
      >
        <Cartao titulo="Cliente">
          <SelecaoCliente
            registro={form.register('clienteCrmId') as never}
            erro={e.clienteCrmId?.message}
          />
          <Campo rotulo="Observação" erro={e.observacao?.message} className="mt-4">
            <AreaTexto rows={2} {...form.register('observacao')} />
          </Campo>
        </Cartao>
        <Cartao>
          <ItensMovimento
            control={form.control}
            register={form.register}
            erros={e.itens}
            rotuloLocal="Local de saída"
          />
        </Cartao>
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={() => router.back()}>
            Cancelar
          </Botao>
          <Botao type="submit" carregando={form.formState.isSubmitting}>
            Criar pedido e reservar
          </Botao>
        </div>
      </form>
    </>
  );
}
