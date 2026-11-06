'use client';

import Link from 'next/link';
import { formatarCnpj, formatarDataHora } from '@estoque/shared';
import { BarraFiltros, FiltroSelecao } from '@/components/listagem';
import { CabecalhoPagina, Etiqueta } from '@/components/ui/basicos';
import { Paginacao, Tabela } from '@/components/ui/tabela';
import { useFiltrosUrl, useListagem } from '@/lib/hooks';

interface Cliente {
  id: string;
  crmId: string;
  nome: string;
  razaoSocial: string | null;
  cnpj: string | null;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  uf: string | null;
  removidoNoCrm: boolean;
  sincronizadoEm: string;
}

export default function PaginaClientes() {
  const [f, definir] = useFiltrosUrl({ busca: '', incluirRemovidos: '' });
  const { data, isLoading, isFetching, error, refetch } = useListagem<Cliente>('/clientes', {
    ...f,
    porPagina: 25,
  });
  return (
    <>
      <CabecalhoPagina
        titulo="Clientes (CRM)"
        descricao="Espelho somente leitura dos clientes do CRM Agrogest. Cadastros e alterações são feitos no CRM."
      />
      <BarraFiltros
        busca={f.busca}
        aoBuscar={(busca) => definir({ busca })}
        placeholder="Nome, razão social ou CNPJ"
      >
        <FiltroSelecao
          rotulo="Exibir"
          valor={f.incluirRemovidos}
          aoMudar={(incluirRemovidos) => definir({ incluirRemovidos })}
          todos="Somente ativos no CRM"
          opcoes={[{ valor: 'true', rotulo: 'Incluir removidos do CRM' }]}
        />
      </BarraFiltros>
      <Tabela
        legenda="Clientes sincronizados do CRM"
        dados={data?.dados}
        carregando={isLoading || isFetching}
        erro={error}
        tentarNovamente={refetch}
        chave={(c) => c.id}
        textoVazio="Nenhum cliente sincronizado. Verifique a integração com o CRM."
        colunas={[
          {
            titulo: 'Cliente',
            celula: (c) => (
              <>
                <Link className="font-medium text-marca-800 underline" href={`/clientes/${c.id}`}>
                  {c.nome}
                </Link>
                {c.razaoSocial && <span className="block text-xs text-suave">{c.razaoSocial}</span>}
              </>
            ),
          },
          { titulo: 'CNPJ / CPF', celula: (c) => (c.cnpj ? formatarCnpj(c.cnpj) : (c.cpf ?? '—')) },
          {
            titulo: 'Contato',
            secundaria: true,
            celula: (c) => [c.email, c.telefone].filter(Boolean).join(' · ') || '—',
          },
          {
            titulo: 'Cidade/UF',
            secundaria: true,
            celula: (c) => [c.cidade, c.uf].filter(Boolean).join('/') || '—',
          },
          {
            titulo: 'Sincronizado em',
            secundaria: true,
            celula: (c) => formatarDataHora(c.sincronizadoEm),
          },
          {
            titulo: 'Situação',
            celula: (c) =>
              c.removidoNoCrm ? (
                <Etiqueta cor="cinza">Removido no CRM</Etiqueta>
              ) : (
                <Etiqueta cor="verde">Ativo</Etiqueta>
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
