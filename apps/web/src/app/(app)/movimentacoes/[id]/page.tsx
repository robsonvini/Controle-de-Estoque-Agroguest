'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  formatarData,
  formatarDataHora,
  formatarMoeda,
  formatarQuantidade,
  ROTULOS_MOTIVO,
  type MotivoMovimentacao,
  type TipoMovimentacao,
} from '@estoque/shared';
import { EtiquetaTipo } from '@/components/listagem';
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

interface Detalhe {
  id: string;
  numero: string;
  tipo: TipoMovimentacao;
  motivo: MotivoMovimentacao;
  origem: string;
  dataMovimentacao: string;
  criadoEm: string;
  observacao: string | null;
  valorTotal: string;
  usuario: { nome: string } | null;
  clienteApi: { nome: string } | null;
  itens: {
    id: string;
    quantidade: string;
    custoUnitario: string;
    valorTotal: string;
    produto: { id: string; sku: string; nome: string; unidadeMedida: { sigla: string } };
    localOrigem: { codigo: string; nome: string } | null;
    localDestino: { codigo: string; nome: string } | null;
  }[];
  entrada: {
    numeroDocumento: string | null;
    serieDocumento: string | null;
    dataDocumento: string | null;
    fornecedor: { id: string; razaoSocial: string } | null;
    clienteCrm: { id: string; nome: string } | null;
    pedidoCompra: { id: string; numero: string } | null;
  } | null;
  saida: {
    destino: string | null;
    numeroDocumento: string | null;
    fornecedor: { razaoSocial: string } | null;
    clienteCrm: { id: string; nome: string } | null;
  } | null;
  pedido: { id: string; numero: string; idExterno: string | null } | null;
  ajuste: { id: string; numero: string } | null;
  estornoDe: { id: string; numero: string } | null;
  estornadaPor: { id: string; numero: string; dataMovimentacao: string; observacao: string } | null;
}

const ORIGENS: Record<string, string> = {
  MANUAL: 'Registro manual',
  COMPRA: 'Recebimento de pedido de compra',
  PEDIDO_VENDA: 'Pedido de venda',
  AJUSTE: 'Ajuste aprovado',
  ESTORNO: 'Estorno',
};

export default function DetalheMovimentacao() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { tem } = useAuth();
  const [estornando, setEstornando] = useState(false);
  const { data: m, error, isLoading } = useConsulta<Detalhe>(`/movimentacoes/${id}`);
  if (isLoading) return <Carregando />;
  if (error || !m) return <ErroCarregamento erro={error} />;

  const estornavel =
    tem('movimentacoes:estornar') &&
    m.tipo !== 'ESTORNO' &&
    !m.estornadaPor &&
    ['MANUAL', 'COMPRA'].includes(m.origem);

  return (
    <>
      <CabecalhoPagina
        titulo={`Movimentação nº ${m.numero}`}
        descricao={`${ROTULOS_MOTIVO[m.motivo]} · registrada em ${formatarDataHora(m.criadoEm)}`}
        acoes={
          estornavel && (
            <Botao
              variante="perigo"
              icone={<Undo2 className="h-4 w-4" aria-hidden />}
              onClick={() => setEstornando(true)}
            >
              Estornar
            </Botao>
          )
        }
      />
      {m.estornadaPor && (
        <p
          role="status"
          className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900"
        >
          Estornada pela movimentação{' '}
          <Link className="font-medium underline" href={`/movimentacoes/${m.estornadaPor.id}`}>
            nº {m.estornadaPor.numero}
          </Link>{' '}
          em {formatarDataHora(m.estornadaPor.dataMovimentacao)}. {m.estornadaPor.observacao}
        </p>
      )}
      <Cartao titulo="Dados" className="mb-4">
        <ListaDados
          itens={[
            ['Tipo', <EtiquetaTipo key="t" tipo={m.tipo} />],
            ['Motivo', ROTULOS_MOTIVO[m.motivo]],
            ['Origem', ORIGENS[m.origem] ?? m.origem],
            ['Data/hora da movimentação', formatarDataHora(m.dataMovimentacao)],
            [
              'Responsável',
              m.usuario?.nome ?? (m.clienteApi ? `${m.clienteApi.nome} (integração)` : 'sistema'),
            ],
            ['Valor total', formatarMoeda(m.valorTotal)],
            [
              'Fornecedor',
              m.entrada?.fornecedor ? (
                <Link
                  key="f"
                  className="underline"
                  href={`/fornecedores/${m.entrada.fornecedor.id}`}
                >
                  {m.entrada.fornecedor.razaoSocial}
                </Link>
              ) : (
                m.saida?.fornecedor?.razaoSocial
              ),
            ],
            ['Cliente', m.entrada?.clienteCrm?.nome ?? m.saida?.clienteCrm?.nome],
            [
              'Documento',
              [
                m.entrada?.numeroDocumento ?? m.saida?.numeroDocumento,
                m.entrada?.serieDocumento && `série ${m.entrada.serieDocumento}`,
                m.entrada?.dataDocumento && formatarData(m.entrada.dataDocumento),
              ]
                .filter(Boolean)
                .join(' · ') || null,
            ],
            ['Destino', m.saida?.destino],
            [
              'Pedido de compra',
              m.entrada?.pedidoCompra ? (
                <Link key="pc" className="underline" href={`/compras/${m.entrada.pedidoCompra.id}`}>
                  nº {m.entrada.pedidoCompra.numero}
                </Link>
              ) : null,
            ],
            [
              'Pedido de venda',
              m.pedido ? (
                <Link key="p" className="underline" href={`/pedidos/${m.pedido.id}`}>
                  nº {m.pedido.numero}
                  {m.pedido.idExterno ? ` (${m.pedido.idExterno})` : ''}
                </Link>
              ) : null,
            ],
            [
              'Ajuste',
              m.ajuste ? (
                <Link key="a" className="underline" href={`/inventario/ajustes/${m.ajuste.id}`}>
                  nº {m.ajuste.numero}
                </Link>
              ) : null,
            ],
            [
              'Estorno de',
              m.estornoDe ? (
                <Link key="e" className="underline" href={`/movimentacoes/${m.estornoDe.id}`}>
                  nº {m.estornoDe.numero}
                </Link>
              ) : null,
            ],
            ['Observação', m.observacao],
          ]}
        />
      </Cartao>
      <Tabela
        legenda="Itens da movimentação"
        dados={m.itens}
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
          { titulo: 'Origem', celula: (i) => i.localOrigem?.codigo ?? '—' },
          { titulo: 'Destino', celula: (i) => i.localDestino?.codigo ?? '—' },
          {
            titulo: 'Quantidade',
            alinhamento: 'direita',
            celula: (i) => `${formatarQuantidade(i.quantidade)} ${i.produto.unidadeMedida.sigla}`,
          },
          {
            titulo: 'Custo unitário',
            alinhamento: 'direita',
            celula: (i) => formatarMoeda(i.custoUnitario),
          },
          { titulo: 'Valor', alinhamento: 'direita', celula: (i) => formatarMoeda(i.valorTotal) },
        ]}
      />
      <p className="mt-3 text-xs text-suave">
        <Etiqueta>Registro imutável</Etiqueta> Movimentações consolidadas não podem ser alteradas
        nem excluídas; correções são feitas por estorno.
      </p>
      <Confirmacao
        aberto={estornando}
        aoMudar={setEstornando}
        titulo={`Estornar movimentação nº ${m.numero}`}
        mensagem="Será criada uma movimentação inversa. A original permanece registrada para auditoria."
        rotuloConfirmar="Estornar"
        perigo
        exigirJustificativa
        aoConfirmar={async (justificativa) => {
          try {
            const est = await api<{ id: string; numero: string }>(
              `/movimentacoes/${m.id}/estorno`,
              {
                metodo: 'POST',
                corpo: { justificativa },
                idempotencia: novaChaveIdempotencia(),
              },
            );
            await qc.invalidateQueries();
            toast.success(`Estorno nº ${est.numero} registrado.`);
            router.push(`/movimentacoes/${est.id}`);
          } catch (e) {
            tratarErro(e);
            throw e;
          }
        }}
      />
    </>
  );
}
