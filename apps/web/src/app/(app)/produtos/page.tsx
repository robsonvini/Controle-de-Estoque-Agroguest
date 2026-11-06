'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { formatarMoeda, formatarQuantidade } from '@estoque/shared';
import { BarraFiltros, EtiquetaSituacao, FiltroSelecao } from '@/components/listagem';
import { CabecalhoPagina, Etiqueta } from '@/components/ui/basicos';
import { BotaoLink } from '@/components/ui/botao';
import { Paginacao, Tabela } from '@/components/ui/tabela';
import { useAuth } from '@/lib/auth';
import { useCategorias, useFiltrosUrl, useListagem } from '@/lib/hooks';

interface ProdutoLinha {
  id: string;
  codigoInterno: string;
  sku: string;
  nome: string;
  status: string;
  categoriaNome: string | null;
  unidadeSigla: string;
  quantidade: string;
  reservado: string;
  disponivel: string;
  estoqueMinimo: string;
  custoMedio: string;
  precoVenda: string;
  situacao: string;
  imagemUrl: string | null;
}

export default function PaginaProdutos() {
  const { tem } = useAuth();
  const [f, definir] = useFiltrosUrl({
    busca: '',
    categoriaId: '',
    status: 'ATIVO',
    situacaoEstoque: '',
    ordenarPor: 'nome',
    ordem: 'asc',
  });
  const { data, isLoading, isFetching, error, refetch } = useListagem<ProdutoLinha>('/produtos', {
    ...f,
    porPagina: 25,
  });
  const { data: categorias } = useCategorias();

  return (
    <>
      <CabecalhoPagina
        titulo="Produtos"
        descricao="Catálogo, saldos e situação de estoque"
        acoes={
          tem('produtos:escrever') && (
            <BotaoLink href="/produtos/novo" icone={<Plus className="h-4 w-4" aria-hidden />}>
              Novo produto
            </BotaoLink>
          )
        }
      />
      <BarraFiltros
        busca={f.busca}
        aoBuscar={(busca) => definir({ busca })}
        placeholder="Nome, SKU, código interno ou código de barras"
      >
        <FiltroSelecao
          rotulo="Categoria"
          valor={f.categoriaId}
          aoMudar={(categoriaId) => definir({ categoriaId })}
          todos="Todas"
          opcoes={(categorias ?? []).map((c) => ({ valor: c.id, rotulo: c.caminho }))}
        />
        <FiltroSelecao
          rotulo="Situação do estoque"
          valor={f.situacaoEstoque}
          aoMudar={(situacaoEstoque) => definir({ situacaoEstoque })}
          todos="Todas"
          opcoes={[
            { valor: 'DISPONIVEL', rotulo: 'Disponível' },
            { valor: 'BAIXO', rotulo: 'Estoque baixo' },
            { valor: 'ESGOTADO', rotulo: 'Esgotado' },
          ]}
        />
        <FiltroSelecao
          rotulo="Status"
          valor={f.status}
          aoMudar={(status) => definir({ status })}
          opcoes={[
            { valor: 'ATIVO', rotulo: 'Ativos' },
            { valor: 'INATIVO', rotulo: 'Inativos' },
          ]}
        />
        <FiltroSelecao
          rotulo="Ordenar por"
          valor={`${f.ordenarPor}:${f.ordem}`}
          aoMudar={(v) => {
            const [ordenarPor, ordem] = (v || 'nome:asc').split(':');
            definir({ ordenarPor, ordem });
          }}
          todos="Nome (A–Z)"
          opcoes={[
            { valor: 'nome:desc', rotulo: 'Nome (Z–A)' },
            { valor: 'disponivel:asc', rotulo: 'Menor disponível' },
            { valor: 'disponivel:desc', rotulo: 'Maior disponível' },
            { valor: 'criadoEm:desc', rotulo: 'Mais recentes' },
          ]}
        />
      </BarraFiltros>
      <Tabela
        legenda="Lista de produtos"
        dados={data?.dados}
        carregando={isLoading || isFetching}
        erro={error}
        tentarNovamente={refetch}
        chave={(p) => p.id}
        textoVazio="Nenhum produto encontrado para os filtros."
        colunas={[
          {
            titulo: 'Produto',
            celula: (p) => (
              <div className="flex items-center gap-3">
                {p.imagemUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imagemUrl} alt="" className="h-10 w-10 rounded object-cover" />
                ) : (
                  <span className="h-10 w-10 rounded bg-gray-100" aria-hidden />
                )}
                <div>
                  <Link
                    href={`/produtos/${p.id}`}
                    className="font-medium text-marca-800 hover:underline"
                  >
                    {p.nome}
                  </Link>
                  <span className="block text-xs text-suave">
                    SKU {p.sku} · Cód. {p.codigoInterno}
                  </span>
                </div>
              </div>
            ),
          },
          { titulo: 'Categoria', celula: (p) => p.categoriaNome ?? '—', secundaria: true },
          {
            titulo: 'Disponível',
            alinhamento: 'direita',
            celula: (p) => (
              <span className="tabular-nums">
                {formatarQuantidade(p.disponivel)} {p.unidadeSigla}
              </span>
            ),
          },
          {
            titulo: 'Reservado',
            alinhamento: 'direita',
            secundaria: true,
            celula: (p) => <span className="tabular-nums">{formatarQuantidade(p.reservado)}</span>,
          },
          {
            titulo: 'Mínimo',
            alinhamento: 'direita',
            secundaria: true,
            celula: (p) => (
              <span className="tabular-nums">{formatarQuantidade(p.estoqueMinimo)}</span>
            ),
          },
          {
            titulo: 'Custo médio',
            alinhamento: 'direita',
            secundaria: true,
            celula: (p) => <span className="tabular-nums">{formatarMoeda(p.custoMedio)}</span>,
          },
          {
            titulo: 'Situação',
            celula: (p) => (
              <div className="flex flex-wrap gap-1">
                <EtiquetaSituacao situacao={p.situacao} />
                {p.status === 'INATIVO' && <Etiqueta>Inativo</Etiqueta>}
              </div>
            ),
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
