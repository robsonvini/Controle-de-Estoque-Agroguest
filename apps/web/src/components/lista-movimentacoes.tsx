'use client';

import Link from 'next/link';
import {
  formatarDataHora,
  formatarMoeda,
  formatarQuantidade,
  MOTIVOS_ENTRADA,
  MOTIVOS_SAIDA,
  ROTULOS_MOTIVO,
  type MotivoMovimentacao,
  type TipoMovimentacao,
} from '@estoque/shared';
import { BarraFiltros, EtiquetaTipo, FiltroData, FiltroSelecao } from './listagem';
import { Etiqueta } from './ui/basicos';
import { Paginacao, Tabela } from './ui/tabela';
import { useFiltrosUrl, useListagem, useLocais } from '@/lib/hooks';

interface MovLinha {
  id: string;
  numero: string;
  tipo: TipoMovimentacao;
  motivo: MotivoMovimentacao;
  dataMovimentacao: string;
  valorTotal: string;
  observacao: string | null;
  usuario: { nome: string } | null;
  clienteApi: { nome: string } | null;
  entrada: {
    numeroDocumento: string | null;
    fornecedor: { razaoSocial: string } | null;
    clienteCrm: { nome: string } | null;
  } | null;
  saida: {
    destino: string | null;
    clienteCrm: { nome: string } | null;
    fornecedor: { razaoSocial: string } | null;
  } | null;
  estornadaPor: { id: string; numero: string } | null;
  _count: { itens: number };
  itens: { quantidade: string; produto: { sku: string; nome: string } }[];
}

export function ListaMovimentacoes({ tipo }: { tipo?: TipoMovimentacao }) {
  const [f, definir] = useFiltrosUrl({
    busca: '',
    motivo: '',
    localId: '',
    dataInicio: '',
    dataFim: '',
    tipo: tipo ?? '',
  });
  const { data: locais } = useLocais(false);
  const { data, isLoading, isFetching, error, refetch } = useListagem<MovLinha>('/movimentacoes', {
    ...f,
    tipo: tipo ?? f.tipo,
    porPagina: 25,
    ordem: 'desc',
  });
  const motivos =
    tipo === 'ENTRADA'
      ? MOTIVOS_ENTRADA
      : tipo === 'SAIDA'
        ? MOTIVOS_SAIDA
        : (Object.keys(ROTULOS_MOTIVO) as MotivoMovimentacao[]);

  return (
    <>
      <BarraFiltros
        busca={f.busca}
        aoBuscar={(busca) => definir({ busca })}
        placeholder="Número da movimentação"
      >
        <FiltroSelecao
          rotulo="Motivo"
          valor={f.motivo}
          aoMudar={(motivo) => definir({ motivo })}
          opcoes={motivos.map((m) => ({ valor: m, rotulo: ROTULOS_MOTIVO[m] }))}
        />
        <FiltroSelecao
          rotulo="Local"
          valor={f.localId}
          aoMudar={(localId) => definir({ localId })}
          opcoes={(locais ?? []).map((l) => ({ valor: l.id, rotulo: l.codigo }))}
        />
        <FiltroData
          rotulo="De"
          valor={f.dataInicio}
          aoMudar={(dataInicio) => definir({ dataInicio })}
        />
        <FiltroData rotulo="Até" valor={f.dataFim} aoMudar={(dataFim) => definir({ dataFim })} />
      </BarraFiltros>
      <Tabela
        legenda="Movimentações de estoque"
        dados={data?.dados}
        carregando={isLoading || isFetching}
        erro={error}
        tentarNovamente={refetch}
        chave={(m) => m.id}
        colunas={[
          {
            titulo: 'Nº',
            celula: (m) => (
              <Link
                href={`/movimentacoes/${m.id}`}
                className="font-medium text-marca-800 underline"
              >
                {m.numero}
              </Link>
            ),
          },
          { titulo: 'Data/hora', celula: (m) => formatarDataHora(m.dataMovimentacao) },
          ...(!tipo
            ? [{ titulo: 'Tipo', celula: (m: MovLinha) => <EtiquetaTipo tipo={m.tipo} /> }]
            : []),
          {
            titulo: 'Motivo',
            celula: (m) => (
              <span className="flex flex-wrap items-center gap-1">
                {ROTULOS_MOTIVO[m.motivo]}
                {m.estornadaPor && <Etiqueta cor="vermelho">Estornada</Etiqueta>}
              </span>
            ),
          },
          {
            titulo: 'Itens',
            celula: (m) => (
              <span className="text-sm">
                {m.itens
                  .map((i) => `${i.produto.sku} (${formatarQuantidade(i.quantidade)})`)
                  .join(', ')}
                {m._count.itens > m.itens.length && ` +${m._count.itens - m.itens.length}`}
              </span>
            ),
          },
          {
            titulo: 'Parceiro / destino',
            secundaria: true,
            celula: (m) =>
              m.entrada?.fornecedor?.razaoSocial ??
              m.entrada?.clienteCrm?.nome ??
              m.saida?.clienteCrm?.nome ??
              m.saida?.fornecedor?.razaoSocial ??
              m.saida?.destino ??
              '—',
          },
          {
            titulo: 'Documento',
            secundaria: true,
            celula: (m) => m.entrada?.numeroDocumento ?? '—',
          },
          {
            titulo: 'Responsável',
            secundaria: true,
            celula: (m) => m.usuario?.nome ?? m.clienteApi?.nome ?? 'sistema',
          },
          {
            titulo: 'Valor',
            alinhamento: 'direita',
            celula: (m) => <span className="tabular-nums">{formatarMoeda(m.valorTotal)}</span>,
          },
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
