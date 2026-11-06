'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ajusteSchema } from '@estoque/shared';
import { ItensMovimento } from '@/components/itens-movimento';
import { CabecalhoPagina, Cartao } from '@/components/ui/basicos';
import { Botao } from '@/components/ui/botao';
import { AreaTexto, Campo } from '@/components/ui/campos';
import { api, novaChaveIdempotencia } from '@/lib/api';
import { tratarErro } from '@/lib/utils';

/** Solicitação manual de ajuste: a quantidade do item é o delta (positivo acrescenta, negativo baixa). */
const formSchema = ajusteSchema
  .extend({
    itens: z
      .array(
        z.object({
          produtoId: z.uuid('Selecione o produto'),
          localId: z.uuid('Selecione o local'),
          quantidade: z.coerce
            .number()
            .refine((v) => v !== 0, 'Informe um valor diferente de zero'),
        }),
      )
      .min(1),
  })
  .transform((d) => ({
    justificativa: d.justificativa,
    itens: d.itens.map((i) => ({
      produtoId: i.produtoId,
      localId: i.localId,
      quantidadeDelta: i.quantidade,
    })),
  }));

export default function NovoAjuste() {
  const router = useRouter();
  const chave = useMemo(() => novaChaveIdempotencia(), []);
  const form = useForm<z.input<typeof formSchema>, unknown, z.output<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { itens: [{ produtoId: '', localId: '', quantidade: '' }] },
  });
  const e = form.formState.errors;
  return (
    <>
      <CabecalhoPagina
        titulo="Solicitar ajuste de estoque"
        descricao="O ajuste só altera o saldo após aprovação por outro usuário com permissão"
      />
      <form
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit(async (dados) => {
          try {
            const a = await api<{ id: string; numero: string }>('/ajustes', {
              metodo: 'POST',
              corpo: dados,
              idempotencia: chave,
            });
            toast.success(`Ajuste nº ${a.numero} enviado para aprovação.`);
            router.push(`/inventario/ajustes/${a.id}`);
          } catch (erro) {
            tratarErro(erro);
          }
        })}
      >
        <Cartao titulo="Justificativa">
          <Campo
            rotulo="Justificativa"
            erro={e.justificativa?.message}
            obrigatorio
            dica="Descreva a causa (ex.: sobra identificada, quebra de lote)"
          >
            <AreaTexto {...form.register('justificativa')} />
          </Campo>
        </Cartao>
        <Cartao>
          <p className="mb-3 text-sm text-suave">
            Use quantidade positiva para acrescentar e negativa para baixar (ex.: −2).
          </p>
          <ItensMovimento control={form.control} register={form.register} erros={e.itens} />
        </Cartao>
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={() => router.back()}>
            Cancelar
          </Botao>
          <Botao type="submit" carregando={form.formState.isSubmitting}>
            Enviar para aprovação
          </Botao>
        </div>
      </form>
    </>
  );
}
