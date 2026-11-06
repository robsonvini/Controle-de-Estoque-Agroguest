'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import {
  formatarData,
  formatarMoeda,
  ROTULOS_STATUS_PEDIDO_COMPRA,
  STATUS_PEDIDO_COMPRA,
} from '@estoque/shared';
import { BarraFiltros, EtiquetaStatus, FiltroData, FiltroSelecao } from '@/components/listagem';
import { CabecalhoPagina } from '@/components/ui/basicos';
import { BotaoLink } from '@/components/ui/botao';
import { Paginacao, Tabela } from '@/components/ui/tabela';
import { useAuth } from '@/lib/auth';
import { useFiltrosUrl, useFornecedoresAtivos, useListagem } from '@/lib/hooks';

interface Compra {
  id: string;
  numero: string;
  status: string;
  dataPedido: string;
  previsaoEntrega: string | null;
  valorTotal: string;
  fornecedor: { id: string; razaoSocial: string };
  criadoPor: { nome: string };
  _count: { itens: number };
}

export default function PaginaCompras() {
  const { tem } = useAuth();
  const [f, definir] = useFiltrosUrl({
    busca: '',
    status: '',
    fornecedorId: '',
    dataInicio: '',
    dataFim: '',
  });
  const { data: fornecedores } = useFornecedoresAtivos();
  const { data, isLoading, isFetching, error, refetch } = useListagem<Compra>('/compras', {
    ...f,
    porPagina: 25,
  });
  return (
    <>
      <CabecalhoPagina
        titulo="Compras"
        descricao="Pedidos de compra e recebimento de mercadorias"
        acoes={
          tem('compras:escrever') && (
            <BotaoLink href="/compras/nova" icone={<Plus className="h-4 w-4" aria-hidden />}>
              Novo pedido de compra
            </BotaoLink>
          )
        }
      />
      <BarraFiltros
        busca={f.busca}
        aoBuscar={(busca) => definir({ busca })}
        placeholder="Número do pedido ou fornecedor"
      >
        <FiltroSelecao
          rotulo="Status"
          valor={f.status}
          aoMudar={(status) => definir({ status })}
          opcoes={STATUS_PEDIDO_COMPRA.map((s) => ({
            valor: s,
            rotulo: ROTULOS_STATUS_PEDIDO_COMPRA[s],
          }))}
        />
        <FiltroSelecao
          rotulo="Fornecedor"
          valor={f.fornecedorId}
          aoMudar={(fornecedorId) => definir({ fornecedorId })}
          opcoes={(fornecedores ?? []).map((x) => ({ valor: x.id, rotulo: x.razaoSocial }))}
        />
        <FiltroData
          rotulo="De"
          valor={f.dataInicio}
          aoMudar={(dataInicio) => definir({ dataInicio })}
        />
        <FiltroData rotulo="Até" valor={f.dataFim} aoMudar={(dataFim) => definir({ dataFim })} />
      </BarraFiltros>
      <Tabela
        legenda="Pedidos de compra"
        dados={data?.dados}
        carregando={isLoading || isFetching}
        erro={error}
        tentarNovamente={refetch}
        chave={(c) => c.id}
        colunas={[
          {
            titulo: 'Pedido',
            celula: (c) => (
              <Link className="font-medium text-marca-800 underline" href={`/compras/${c.id}`}>
                nº {c.numero}
              </Link>
            ),
          },
          { titulo: 'Data', celula: (c) => formatarData(c.dataPedido) },
          { titulo: 'Fornecedor', celula: (c) => c.fornecedor.razaoSocial },
          {
            titulo: 'Itens',
            alinhamento: 'direita',
            secundaria: true,
            celula: (c) => c._count.itens,
          },
          {
            titulo: 'Previsão',
            secundaria: true,
            celula: (c) => formatarData(c.previsaoEntrega) || '—',
          },
          { titulo: 'Status', celula: (c) => <EtiquetaStatus status={c.status} /> },
          { titulo: 'Valor', alinhamento: 'direita', celula: (c) => formatarMoeda(c.valorTotal) },
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
