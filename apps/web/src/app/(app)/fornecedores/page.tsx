'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import {
  formatarDocumento,
  mascararDocumento,
  ROTULOS_SITUACAO_FORNECEDOR,
  SITUACOES_FORNECEDOR,
} from '@estoque/shared';
import { BarraFiltros, EtiquetaStatus, FiltroSelecao } from '@/components/listagem';
import { CabecalhoPagina } from '@/components/ui/basicos';
import { BotaoLink } from '@/components/ui/botao';
import { Paginacao, Tabela } from '@/components/ui/tabela';
import { useAuth } from '@/lib/auth';
import { useFiltrosUrl, useListagem } from '@/lib/hooks';

interface Fornecedor {
  id: string;
  tipoPessoa: 'PF' | 'PJ';
  documento: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  uf: string | null;
  situacao: string;
  _count: { produtos: number; pedidosCompra: number };
}

export default function PaginaFornecedores() {
  const { tem } = useAuth();
  const [f, definir] = useFiltrosUrl({ busca: '', situacao: '' });
  const { data, isLoading, isFetching, error, refetch } = useListagem<Fornecedor>('/fornecedores', {
    ...f,
    porPagina: 25,
    ordenarPor: 'razaoSocial',
  });
  return (
    <>
      <CabecalhoPagina
        titulo="Fornecedores"
        acoes={
          tem('fornecedores:escrever') && (
            <BotaoLink href="/fornecedores/novo" icone={<Plus className="h-4 w-4" aria-hidden />}>
              Novo fornecedor
            </BotaoLink>
          )
        }
      />
      <BarraFiltros
        busca={f.busca}
        aoBuscar={(busca) => definir({ busca })}
        placeholder="Razão social, nome fantasia ou CNPJ/CPF"
      >
        <FiltroSelecao
          rotulo="Situação"
          valor={f.situacao}
          aoMudar={(situacao) => definir({ situacao })}
          todos="Todas"
          opcoes={SITUACOES_FORNECEDOR.map((s) => ({
            valor: s,
            rotulo: ROTULOS_SITUACAO_FORNECEDOR[s],
          }))}
        />
      </BarraFiltros>
      <Tabela
        legenda="Fornecedores"
        dados={data?.dados}
        carregando={isLoading || isFetching}
        erro={error}
        tentarNovamente={refetch}
        chave={(x) => x.id}
        colunas={[
          {
            titulo: 'Fornecedor',
            celula: (x) => (
              <>
                <Link
                  className="font-medium text-marca-800 underline"
                  href={`/fornecedores/${x.id}`}
                >
                  {x.razaoSocial}
                </Link>
                {x.nomeFantasia && (
                  <span className="block text-xs text-suave">{x.nomeFantasia}</span>
                )}
              </>
            ),
          },
          // CPF de pessoa física é mascarado na listagem (LGPD)
          {
            titulo: 'CNPJ/CPF',
            celula: (x) =>
              x.tipoPessoa === 'PF'
                ? mascararDocumento(x.documento)
                : formatarDocumento(x.documento),
          },
          {
            titulo: 'Contato',
            secundaria: true,
            celula: (x) => [x.email, x.telefone].filter(Boolean).join(' · ') || '—',
          },
          {
            titulo: 'Cidade/UF',
            secundaria: true,
            celula: (x) => [x.cidade, x.uf].filter(Boolean).join('/') || '—',
          },
          {
            titulo: 'Produtos',
            alinhamento: 'direita',
            secundaria: true,
            celula: (x) => x._count.produtos,
          },
          {
            titulo: 'Compras',
            alinhamento: 'direita',
            secundaria: true,
            celula: (x) => x._count.pedidosCompra,
          },
          { titulo: 'Situação', celula: (x) => <EtiquetaStatus status={x.situacao} /> },
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
