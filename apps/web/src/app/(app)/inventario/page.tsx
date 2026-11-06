'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  formatarDataHora,
  inventarioSchema,
  ROTULOS_STATUS_AJUSTE,
  ROTULOS_STATUS_INVENTARIO,
  STATUS_AJUSTE,
  STATUS_INVENTARIO,
} from '@estoque/shared';
import { BarraFiltros, EtiquetaStatus, FiltroSelecao } from '@/components/listagem';
import { Abas } from '@/components/ui/abas';
import { CabecalhoPagina, Etiqueta } from '@/components/ui/basicos';
import { Botao, BotaoLink } from '@/components/ui/botao';
import { AreaTexto, Caixa, Campo, Entrada, Selecao } from '@/components/ui/campos';
import { Dialogo } from '@/components/ui/dialogo';
import { Paginacao, Tabela } from '@/components/ui/tabela';
import { api, novaChaveIdempotencia } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCategorias, useFiltrosUrl, useListagem, useLocais } from '@/lib/hooks';
import { tratarErro } from '@/lib/utils';

interface Inventario {
  id: string;
  numero: string;
  descricao: string;
  status: string;
  iniciadoEm: string;
  finalizadoEm: string | null;
  local: { codigo: string } | null;
  categoria: { nome: string } | null;
  criadoPor: { nome: string };
  _count: { itens: number };
  itensContados: number;
  itensDivergentes: number;
}
interface Ajuste {
  id: string;
  numero: string;
  origem: string;
  status: string;
  justificativa: string;
  solicitadoEm: string;
  solicitadoPor: { nome: string };
  decididoPor: { nome: string } | null;
  inventario: { numero: string } | null;
  _count: { itens: number };
}

function NovoInventario({ aoCriar }: { aoCriar: (id: string) => void }) {
  const { data: locais } = useLocais();
  const { data: categorias } = useCategorias();
  const form = useForm<
    z.input<typeof inventarioSchema>,
    unknown,
    z.output<typeof inventarioSchema>
  >({
    resolver: zodResolver(inventarioSchema),
    defaultValues: { incluirSemSaldo: false },
  });
  const e = form.formState.errors;
  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={form.handleSubmit(async (dados) => {
        try {
          const inv = await api<{ id: string }>('/inventarios', {
            metodo: 'POST',
            corpo: dados,
            idempotencia: novaChaveIdempotencia(),
          });
          toast.success('Inventário aberto. Registre as contagens.');
          aoCriar(inv.id);
        } catch (erro) {
          tratarErro(erro, form.setError);
        }
      })}
    >
      <Campo rotulo="Descrição" erro={e.descricao?.message} obrigatorio>
        <Entrada
          {...form.register('descricao')}
          placeholder="Ex.: Inventário mensal — Depósito 1"
        />
      </Campo>
      <Campo rotulo="Local" erro={e.localId?.message} dica="Em branco: todos os locais com saldo">
        <Selecao {...form.register('localId')}>
          <option value="">Todos os locais</option>
          {locais?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.codigo} — {l.nome}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Campo rotulo="Categoria" erro={e.categoriaId?.message}>
        <Selecao {...form.register('categoriaId')}>
          <option value="">Todas</option>
          {categorias?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.caminho}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Caixa
        rotulo="Incluir produtos sem saldo (identifica itens não registrados no local)"
        {...form.register('incluirSemSaldo')}
      />
      <Campo rotulo="Observação" erro={e.observacao?.message}>
        <AreaTexto rows={2} {...form.register('observacao')} />
      </Campo>
      <div className="flex justify-end">
        <Botao type="submit" carregando={form.formState.isSubmitting}>
          Abrir inventário
        </Botao>
      </div>
    </form>
  );
}

function ListaInventarios() {
  const [f, definir] = useFiltrosUrl({ busca: '', status: '' });
  const { data, isLoading, isFetching, error, refetch } = useListagem<Inventario>('/inventarios', {
    ...f,
    porPagina: 20,
  });
  return (
    <>
      <BarraFiltros
        busca={f.busca}
        aoBuscar={(busca) => definir({ busca })}
        placeholder="Descrição"
      >
        <FiltroSelecao
          rotulo="Status"
          valor={f.status}
          aoMudar={(status) => definir({ status })}
          opcoes={STATUS_INVENTARIO.map((s) => ({
            valor: s,
            rotulo: ROTULOS_STATUS_INVENTARIO[s],
          }))}
        />
      </BarraFiltros>
      <Tabela
        legenda="Inventários"
        dados={data?.dados}
        carregando={isLoading || isFetching}
        erro={error}
        tentarNovamente={refetch}
        chave={(i) => i.id}
        colunas={[
          {
            titulo: 'Nº',
            celula: (i) => (
              <Link className="font-medium text-marca-800 underline" href={`/inventario/${i.id}`}>
                {i.numero}
              </Link>
            ),
          },
          { titulo: 'Descrição', celula: (i) => i.descricao },
          {
            titulo: 'Escopo',
            secundaria: true,
            celula: (i) =>
              [i.local?.codigo ?? 'Todos os locais', i.categoria?.nome].filter(Boolean).join(' · '),
          },
          { titulo: 'Início', secundaria: true, celula: (i) => formatarDataHora(i.iniciadoEm) },
          {
            titulo: 'Contagem',
            alinhamento: 'direita',
            celula: (i) => `${i.itensContados}/${i._count.itens}`,
          },
          {
            titulo: 'Divergências',
            alinhamento: 'direita',
            celula: (i) =>
              i.itensDivergentes ? <Etiqueta cor="amarelo">{i.itensDivergentes}</Etiqueta> : '0',
          },
          { titulo: 'Status', celula: (i) => <EtiquetaStatus status={i.status} /> },
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

function ListaAjustes() {
  const params = useSearchParams();
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [pagina, setPagina] = useState(1);
  const { data, isLoading, error } = useListagem<Ajuste>('/ajustes', {
    status,
    pagina,
    porPagina: 20,
  });
  return (
    <>
      <div className="mb-3 flex items-end justify-between gap-2">
        <FiltroSelecao
          rotulo="Status"
          valor={status}
          aoMudar={(s) => {
            setStatus(s);
            setPagina(1);
          }}
          opcoes={STATUS_AJUSTE.map((s) => ({ valor: s, rotulo: ROTULOS_STATUS_AJUSTE[s] }))}
        />
      </div>
      <Tabela
        legenda="Ajustes de estoque"
        dados={data?.dados}
        carregando={isLoading}
        erro={error}
        chave={(a) => a.id}
        colunas={[
          {
            titulo: 'Nº',
            celula: (a) => (
              <Link
                className="font-medium text-marca-800 underline"
                href={`/inventario/ajustes/${a.id}`}
              >
                {a.numero}
              </Link>
            ),
          },
          {
            titulo: 'Origem',
            celula: (a) => (a.inventario ? `Inventário nº ${a.inventario.numero}` : 'Manual'),
          },
          {
            titulo: 'Justificativa',
            secundaria: true,
            celula: (a) => <span className="line-clamp-2">{a.justificativa}</span>,
          },
          {
            titulo: 'Solicitado',
            celula: (a) => `${a.solicitadoPor.nome} · ${formatarDataHora(a.solicitadoEm)}`,
          },
          { titulo: 'Itens', alinhamento: 'direita', celula: (a) => a._count.itens },
          { titulo: 'Status', celula: (a) => <EtiquetaStatus status={a.status} /> },
        ]}
      />
      {data && (
        <Paginacao
          pagina={data.pagina}
          totalPaginas={data.totalPaginas}
          total={data.total}
          aoMudar={setPagina}
        />
      )}
    </>
  );
}

export default function PaginaInventario() {
  const { tem } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [novo, setNovo] = useState(false);
  return (
    <>
      <CabecalhoPagina
        titulo="Inventário e ajustes"
        descricao="Contagem física, comparação com o sistema e ajustes mediante aprovação"
        acoes={
          <>
            {tem('ajustes:solicitar') && (
              <BotaoLink variante="secundario" href="/inventario/ajustes/novo">
                Solicitar ajuste manual
              </BotaoLink>
            )}
            {tem('inventarios:escrever') && (
              <Botao icone={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setNovo(true)}>
                Novo inventário
              </Botao>
            )}
          </>
        }
      />
      <Abas
        rotulo="Inventário"
        padrao={params.get('aba') ?? 'inventarios'}
        abas={[
          { valor: 'inventarios', titulo: 'Inventários', conteudo: <ListaInventarios /> },
          { valor: 'ajustes', titulo: 'Ajustes', conteudo: <ListaAjustes /> },
        ]}
      />
      <Dialogo
        aberto={novo}
        aoMudar={setNovo}
        titulo="Novo inventário"
        descricao="Os itens do escopo serão listados para contagem às cegas."
      >
        <NovoInventario aoCriar={(id) => router.push(`/inventario/${id}`)} />
      </Dialogo>
    </>
  );
}
