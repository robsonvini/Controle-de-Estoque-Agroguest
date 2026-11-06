'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatarDataHora, formatarMoeda, formatarQuantidade } from '@estoque/shared';
import { EtiquetaStatus } from '@/components/listagem';
import {
  CabecalhoPagina,
  Carregando,
  Cartao,
  ErroCarregamento,
  Etiqueta,
  ListaDados,
} from '@/components/ui/basicos';
import { Botao } from '@/components/ui/botao';
import { Confirmacao } from '@/components/ui/dialogo';
import { Tabela } from '@/components/ui/tabela';
import { api, novaChaveIdempotencia } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useConsulta } from '@/lib/hooks';
import { tratarErro } from '@/lib/utils';

interface Pedido {
  id: string;
  numero: string;
  origem: string;
  idExterno: string | null;
  status: string;
  observacao: string | null;
  valorTotal: string;
  criadoEm: string;
  confirmadoEm: string | null;
  canceladoEm: string | null;
  motivoCancelamento: string | null;
  clienteCrm: { id: string; crmId: string; nome: string; razaoSocial: string | null } | null;
  criadoPor: { nome: string } | null;
  clienteApi: { nome: string } | null;
  itens: {
    id: string;
    quantidade: string;
    precoUnitario: string;
    produto: { id: string; sku: string; nome: string; unidadeMedida: { sigla: string } };
    local: { codigo: string };
    reserva: { status: string } | null;
  }[];
  movimentacoes: { id: string; numero: string; dataMovimentacao: string }[];
}

export default function DetalhePedido() {
  const { id } = useParams<{ id: string }>();
  const { tem } = useAuth();
  const qc = useQueryClient();
  const { data: p, error, isLoading, refetch } = useConsulta<Pedido>(`/pedidos/${id}`);
  const [confirmando, setConfirmando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  if (isLoading) return <Carregando />;
  if (error || !p) return <ErroCarregamento erro={error} tentarNovamente={refetch} />;
  const reservado = p.status === 'RESERVADO';

  return (
    <>
      <CabecalhoPagina
        titulo={`Pedido de venda nº ${p.numero}`}
        descricao={
          p.origem === 'CRM_API'
            ? `Recebido do CRM · ID externo ${p.idExterno}`
            : `Criado por ${p.criadoPor?.nome ?? '—'}`
        }
        acoes={
          reservado &&
          tem('pedidos:escrever') && (
            <>
              {tem('saidas:registrar') && (
                <Botao
                  icone={<CheckCircle2 className="h-4 w-4" aria-hidden />}
                  onClick={() => setConfirmando(true)}
                >
                  Confirmar venda (baixar estoque)
                </Botao>
              )}
              <Botao
                variante="secundario"
                icone={<XCircle className="h-4 w-4" aria-hidden />}
                onClick={() => setCancelando(true)}
              >
                Cancelar pedido
              </Botao>
            </>
          )
        }
      />
      <Cartao className="mb-4">
        <ListaDados
          itens={[
            ['Status', <EtiquetaStatus key="s" status={p.status} />],
            [
              'Origem',
              p.origem === 'CRM_API' ? (
                <Etiqueta key="o" cor="roxo">
                  CRM — {p.clienteApi?.nome ?? 'integração'}
                </Etiqueta>
              ) : (
                'Manual'
              ),
            ],
            [
              'Cliente',
              p.clienteCrm
                ? `${p.clienteCrm.nome}${p.clienteCrm.razaoSocial ? ` — ${p.clienteCrm.razaoSocial}` : ''}`
                : null,
            ],
            ['Criado em', formatarDataHora(p.criadoEm)],
            ['Confirmado em', formatarDataHora(p.confirmadoEm)],
            [
              'Cancelado em',
              p.canceladoEm ? `${formatarDataHora(p.canceladoEm)} — ${p.motivoCancelamento}` : null,
            ],
            ['Valor total', formatarMoeda(p.valorTotal)],
            [
              'Baixa no estoque',
              p.movimentacoes.length
                ? p.movimentacoes.map((m) => (
                    <Link key={m.id} className="underline" href={`/movimentacoes/${m.id}`}>
                      nº {m.numero}
                    </Link>
                  ))
                : null,
            ],
            ['Observação', p.observacao],
          ]}
        />
      </Cartao>
      <Tabela
        legenda="Itens do pedido"
        dados={p.itens}
        chave={(i) => i.id}
        colunas={[
          {
            titulo: 'Produto',
            celula: (i) => (
              <Link className="text-marca-800 underline" href={`/produtos/${i.produto.id}`}>
                {i.produto.sku} — {i.produto.nome}
              </Link>
            ),
          },
          { titulo: 'Local', celula: (i) => i.local.codigo },
          {
            titulo: 'Quantidade',
            alinhamento: 'direita',
            celula: (i) => `${formatarQuantidade(i.quantidade)} ${i.produto.unidadeMedida.sigla}`,
          },
          {
            titulo: 'Preço',
            alinhamento: 'direita',
            celula: (i) => formatarMoeda(i.precoUnitario),
          },
          {
            titulo: 'Subtotal',
            alinhamento: 'direita',
            celula: (i) => formatarMoeda(Number(i.quantidade) * Number(i.precoUnitario)),
          },
          {
            titulo: 'Reserva',
            celula: (i) => (
              <Etiqueta
                cor={
                  i.reserva?.status === 'ATIVA'
                    ? 'amarelo'
                    : i.reserva?.status === 'CONSUMIDA'
                      ? 'verde'
                      : 'cinza'
                }
              >
                {i.reserva?.status === 'ATIVA'
                  ? 'Reservado'
                  : i.reserva?.status === 'CONSUMIDA'
                    ? 'Baixado'
                    : 'Liberado'}
              </Etiqueta>
            ),
          },
        ]}
      />
      <Confirmacao
        aberto={confirmando}
        aoMudar={setConfirmando}
        titulo={`Confirmar pedido nº ${p.numero}`}
        mensagem="O estoque reservado será baixado (saída por venda). Esta operação não pode ser desfeita; devoluções são registradas como entrada."
        rotuloConfirmar="Confirmar e baixar"
        aoConfirmar={async () => {
          try {
            await api(`/pedidos/${p.id}/confirmar`, {
              metodo: 'POST',
              idempotencia: novaChaveIdempotencia(),
            });
            toast.success('Venda confirmada e estoque baixado.');
            await qc.invalidateQueries();
          } catch (e) {
            tratarErro(e);
            throw e;
          }
        }}
      />
      <Confirmacao
        aberto={cancelando}
        aoMudar={setCancelando}
        titulo={`Cancelar pedido nº ${p.numero}`}
        mensagem="As reservas serão liberadas e o saldo volta a ficar disponível."
        rotuloConfirmar="Cancelar pedido"
        rotuloJustificativa="Motivo do cancelamento"
        perigo
        exigirJustificativa
        aoConfirmar={async (motivo) => {
          try {
            await api(`/pedidos/${p.id}/cancelar`, { metodo: 'POST', corpo: { motivo } });
            toast.success('Pedido cancelado e reservas liberadas.');
            await qc.invalidateQueries();
          } catch (e) {
            tratarErro(e);
            throw e;
          }
        }}
      />
    </>
  );
}
