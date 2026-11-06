'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import {
  formatarDataHora,
  formatarMoeda,
  ROTULOS_STATUS_PEDIDO,
  STATUS_PEDIDO,
} from '@estoque/shared';
import { BarraFiltros, EtiquetaStatus, FiltroData, FiltroSelecao } from '@/components/listagem';
import { CabecalhoPagina, Etiqueta } from '@/components/ui/basicos';
import { BotaoLink } from '@/components/ui/botao';
import { Paginacao, Tabela } from '@/components/ui/tabela';
import { useAuth } from '@/lib/auth';
import { useFiltrosUrl, useListagem } from '@/lib/hooks';

interface Pedido {
  id: string;
  numero: string;
  origem: 'MANUAL' | 'CRM_API';
  idExterno: string | null;
  status: string;
  valorTotal: string;
  criadoEm: string;
  clienteCrm: { id: string; nome: string } | null;
  criadoPor: { nome: string } | null;
  clienteApi: { nome: string } | null;
  _count: { itens: number };
}

export default function PaginaPedidos() {
  const { tem } = useAuth();
  const [f, definir] = useFiltrosUrl({
    busca: '',
    status: '',
    origem: '',
    dataInicio: '',
    dataFim: '',
  });
  const { data, isLoading, isFetching, error, refetch } = useListagem<Pedido>(
    '/pedidos',
    { ...f, porPagina: 25 },
    { intervalo: 30_000 },
  );
  return (
    <>
      <CabecalhoPagina
        titulo="Pedidos de venda"
        descricao="Pedidos manuais e recebidos do CRM, com reserva de estoque até a confirmação"
        acoes={
          tem('pedidos:escrever') && (
            <BotaoLink href="/pedidos/novo" icone={<Plus className="h-4 w-4" aria-hidden />}>
              Novo pedido
            </BotaoLink>
          )
        }
      />
      <BarraFiltros
        busca={f.busca}
        aoBuscar={(busca) => definir({ busca })}
        placeholder="Número, ID externo ou cliente"
      >
        <FiltroSelecao
          rotulo="Status"
          valor={f.status}
          aoMudar={(status) => definir({ status })}
          opcoes={STATUS_PEDIDO.map((s) => ({ valor: s, rotulo: ROTULOS_STATUS_PEDIDO[s] }))}
        />
        <FiltroSelecao
          rotulo="Origem"
          valor={f.origem}
          aoMudar={(origem) => definir({ origem })}
          todos="Todas"
          opcoes={[
            { valor: 'MANUAL', rotulo: 'Manual' },
            { valor: 'CRM_API', rotulo: 'CRM (integração)' },
          ]}
        />
        <FiltroData
          rotulo="De"
          valor={f.dataInicio}
          aoMudar={(dataInicio) => definir({ dataInicio })}
        />
        <FiltroData rotulo="Até" valor={f.dataFim} aoMudar={(dataFim) => definir({ dataFim })} />
      </BarraFiltros>
      <Tabela
        legenda="Pedidos de venda"
        dados={data?.dados}
        carregando={isLoading || isFetching}
        erro={error}
        tentarNovamente={refetch}
        chave={(p) => p.id}
        colunas={[
          {
            titulo: 'Pedido',
            celula: (p) => (
              <Link className="font-medium text-marca-800 underline" href={`/pedidos/${p.id}`}>
                nº {p.numero}
              </Link>
            ),
          },
          { titulo: 'Data', celula: (p) => formatarDataHora(p.criadoEm) },
          {
            titulo: 'Origem',
            celula: (p) =>
              p.origem === 'CRM_API' ? (
                <Etiqueta cor="roxo">CRM · {p.idExterno}</Etiqueta>
              ) : (
                <Etiqueta>Manual</Etiqueta>
              ),
          },
          { titulo: 'Cliente', celula: (p) => p.clienteCrm?.nome ?? '—' },
          {
            titulo: 'Itens',
            alinhamento: 'direita',
            secundaria: true,
            celula: (p) => p._count.itens,
          },
          { titulo: 'Status', celula: (p) => <EtiquetaStatus status={p.status} /> },
          { titulo: 'Valor', alinhamento: 'direita', celula: (p) => formatarMoeda(p.valorTotal) },
        ]}
      />
      {data && (
        <Paginacao
          pagina={data.pagina}
          totalPaginas={data.totalPaginas}
          total={data.total}
          aoMudar={(pagina) => definir({ pagina })}
        />
      )}
    </>
  );
}
