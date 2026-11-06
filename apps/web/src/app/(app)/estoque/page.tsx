'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  formatarDataHora,
  formatarMoeda,
  formatarQuantidade,
  localSchema,
  ROTULOS_TIPO_LOCAL,
  TIPOS_LOCAL,
  unidadeMedidaSchema,
  type TipoLocal,
} from '@estoque/shared';
import { BarraFiltros, FiltroSelecao } from '@/components/listagem';
import { Abas } from '@/components/ui/abas';
import { CabecalhoPagina, Etiqueta } from '@/components/ui/basicos';
import { Botao, BotaoLink } from '@/components/ui/botao';
import { AreaTexto, Caixa, Campo, Entrada, Selecao } from '@/components/ui/campos';
import { Dialogo } from '@/components/ui/dialogo';
import { Paginacao, Tabela } from '@/components/ui/tabela';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  useCategorias,
  useFiltrosUrl,
  useListagem,
  useLocais,
  type LocalResumo,
  type UnidadeResumo,
} from '@/lib/hooks';
import { tratarErro } from '@/lib/utils';

interface Saldo {
  produtoId: string;
  sku: string;
  produtoNome: string;
  unidadeSigla: string;
  localId: string;
  localCodigo: string;
  localNome: string;
  quantidade: string;
  reservado: string;
  disponivel: string;
  custoMedio: string;
  valorTotal: string;
  atualizadoEm: string;
}

function Saldos() {
  const [f, definir] = useFiltrosUrl({
    busca: '',
    localId: '',
    categoriaId: '',
    somenteComSaldo: 'true',
  });
  const { data: locais } = useLocais(false);
  const { data: categorias } = useCategorias();
  const { data, isLoading, isFetching, error, refetch } = useListagem<Saldo>('/estoque/saldos', {
    ...f,
    porPagina: 50,
  });
  return (
    <>
      <BarraFiltros
        busca={f.busca}
        aoBuscar={(busca) => definir({ busca })}
        placeholder="Produto, SKU ou código do local"
      >
        <FiltroSelecao
          rotulo="Local"
          valor={f.localId}
          aoMudar={(localId) => definir({ localId })}
          opcoes={(locais ?? []).map((l) => ({ valor: l.id, rotulo: `${l.codigo} — ${l.nome}` }))}
        />
        <FiltroSelecao
          rotulo="Categoria"
          valor={f.categoriaId}
          aoMudar={(categoriaId) => definir({ categoriaId })}
          todos="Todas"
          opcoes={(categorias ?? []).map((c) => ({ valor: c.id, rotulo: c.caminho }))}
        />
        <FiltroSelecao
          rotulo="Exibir"
          valor={f.somenteComSaldo}
          aoMudar={(somenteComSaldo) => definir({ somenteComSaldo: somenteComSaldo || 'false' })}
          todos="Somente com saldo"
          opcoes={[{ valor: 'false', rotulo: 'Incluir zerados' }]}
        />
      </BarraFiltros>
      <Tabela
        legenda="Saldos por produto e local"
        dados={data?.dados}
        carregando={isLoading || isFetching}
        erro={error}
        tentarNovamente={refetch}
        chave={(s) => `${s.produtoId}-${s.localId}`}
        colunas={[
          {
            titulo: 'Produto',
            celula: (s) => (
              <Link className="text-marca-800 underline" href={`/produtos/${s.produtoId}`}>
                {s.sku} — {s.produtoNome}
              </Link>
            ),
          },
          { titulo: 'Local', celula: (s) => `${s.localCodigo} — ${s.localNome}` },
          {
            titulo: 'Saldo',
            alinhamento: 'direita',
            celula: (s) => `${formatarQuantidade(s.quantidade)} ${s.unidadeSigla}`,
          },
          {
            titulo: 'Reservado',
            alinhamento: 'direita',
            secundaria: true,
            celula: (s) => formatarQuantidade(s.reservado),
          },
          {
            titulo: 'Disponível',
            alinhamento: 'direita',
            celula: (s) => <strong>{formatarQuantidade(s.disponivel)}</strong>,
          },
          {
            titulo: 'Valor',
            alinhamento: 'direita',
            secundaria: true,
            celula: (s) => formatarMoeda(s.valorTotal),
          },
          {
            titulo: 'Última atualização',
            secundaria: true,
            celula: (s) => formatarDataHora(s.atualizadoEm),
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

function FormLocal({
  local,
  locais,
  aoSalvar,
}: {
  local?: LocalResumo & { descricao?: string | null; paiId?: string | null };
  locais: LocalResumo[];
  aoSalvar: () => void;
}) {
  const form = useForm<z.input<typeof localSchema>, unknown, z.output<typeof localSchema>>({
    resolver: zodResolver(localSchema),
    defaultValues: local
      ? {
          codigo: local.codigo,
          nome: local.nome,
          tipo: local.tipo as TipoLocal,
          descricao: local.descricao ?? '',
          paiId: local.paiId ?? '',
          ativo: local.ativo,
        }
      : { tipo: 'DEPOSITO', ativo: true },
  });
  const e = form.formState.errors;
  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={form.handleSubmit(async (dados) => {
        try {
          await api(local ? `/locais/${local.id}` : '/locais', {
            metodo: local ? 'PUT' : 'POST',
            corpo: dados,
          });
          toast.success('Local salvo.');
          aoSalvar();
        } catch (erro) {
          tratarErro(erro, form.setError);
        }
      })}
    >
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Código" erro={e.codigo?.message} obrigatorio dica="Ex.: DEP-01, A1-P03">
          <Entrada {...form.register('codigo')} className="uppercase" />
        </Campo>
        <Campo rotulo="Tipo" erro={e.tipo?.message} obrigatorio>
          <Selecao {...form.register('tipo')}>
            {TIPOS_LOCAL.map((t) => (
              <option key={t} value={t}>
                {ROTULOS_TIPO_LOCAL[t]}
              </option>
            ))}
          </Selecao>
        </Campo>
      </div>
      <Campo rotulo="Nome" erro={e.nome?.message} obrigatorio>
        <Entrada {...form.register('nome')} />
      </Campo>
      <Campo
        rotulo="Local superior"
        erro={e.paiId?.message}
        dica="Ex.: a prateleira pertence a uma área do depósito"
      >
        <Selecao {...form.register('paiId')}>
          <option value="">Nenhum (nível principal)</option>
          {locais
            .filter((l) => l.id !== local?.id)
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.codigo} — {l.nome}
              </option>
            ))}
        </Selecao>
      </Campo>
      <Campo rotulo="Descrição" erro={e.descricao?.message}>
        <AreaTexto rows={2} {...form.register('descricao')} />
      </Campo>
      <Caixa rotulo="Ativo" {...form.register('ativo')} />
      <div className="flex justify-end">
        <Botao type="submit" carregando={form.formState.isSubmitting}>
          Salvar
        </Botao>
      </div>
    </form>
  );
}

function Locais() {
  const { tem } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useListagem<
    LocalResumo & { descricao: string | null; paiId: string | null; pai: { codigo: string } | null }
  >('/locais', { porPagina: 200 });
  const [editando, setEditando] = useState<
    (LocalResumo & { descricao: string | null; paiId: string | null }) | 'novo' | null
  >(null);
  return (
    <>
      {tem('estoque:configurar') && (
        <div className="mb-3 flex justify-end">
          <Botao
            icone={<Plus className="h-4 w-4" aria-hidden />}
            onClick={() => setEditando('novo')}
          >
            Novo local
          </Botao>
        </div>
      )}
      <Tabela
        legenda="Locais de armazenamento"
        dados={data?.dados}
        carregando={isLoading}
        erro={error}
        tentarNovamente={refetch}
        chave={(l) => l.id}
        colunas={[
          { titulo: 'Código', celula: (l) => <strong>{l.codigo}</strong> },
          { titulo: 'Nome', celula: (l) => l.nome },
          { titulo: 'Tipo', celula: (l) => ROTULOS_TIPO_LOCAL[l.tipo as TipoLocal] },
          { titulo: 'Superior', secundaria: true, celula: (l) => l.pai?.codigo ?? '—' },
          {
            titulo: 'Situação',
            celula: (l) => (
              <Etiqueta cor={l.ativo ? 'verde' : 'cinza'}>{l.ativo ? 'Ativo' : 'Inativo'}</Etiqueta>
            ),
          },
          {
            titulo: 'Ações',
            alinhamento: 'direita',
            celula: (l) =>
              tem('estoque:configurar') && (
                <Botao
                  variante="fantasma"
                  tamanho="sm"
                  icone={<Pencil className="h-4 w-4" aria-hidden />}
                  onClick={() => setEditando(l)}
                  aria-label={`Editar local ${l.codigo}`}
                >
                  Editar
                </Botao>
              ),
          },
        ]}
      />
      <Dialogo
        aberto={!!editando}
        aoMudar={(a) => !a && setEditando(null)}
        titulo={editando === 'novo' ? 'Novo local' : 'Editar local'}
      >
        {editando && (
          <FormLocal
            local={editando === 'novo' ? undefined : editando}
            locais={data?.dados ?? []}
            aoSalvar={() => {
              setEditando(null);
              void qc.invalidateQueries({ queryKey: ['/locais'] });
            }}
          />
        )}
      </Dialogo>
    </>
  );
}

function Unidades() {
  const { tem } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error } = useListagem<UnidadeResumo & { _count: { produtos: number } }>(
    '/unidades',
    { porPagina: 200 },
  );
  const [editando, setEditando] = useState<UnidadeResumo | 'nova' | null>(null);
  const form = useForm<
    z.input<typeof unidadeMedidaSchema>,
    unknown,
    z.output<typeof unidadeMedidaSchema>
  >({ resolver: zodResolver(unidadeMedidaSchema) });
  const abrir = (u: UnidadeResumo | 'nova') => {
    form.reset(u === 'nova' ? { sigla: '', nome: '', casasDecimais: 0, ativo: true } : u);
    setEditando(u);
  };
  const e = form.formState.errors;
  return (
    <>
      {tem('estoque:configurar') && (
        <div className="mb-3 flex justify-end">
          <Botao icone={<Plus className="h-4 w-4" aria-hidden />} onClick={() => abrir('nova')}>
            Nova unidade
          </Botao>
        </div>
      )}
      <Tabela
        legenda="Unidades de medida"
        dados={data?.dados}
        carregando={isLoading}
        erro={error}
        chave={(u) => u.id}
        colunas={[
          { titulo: 'Sigla', celula: (u) => <strong>{u.sigla}</strong> },
          { titulo: 'Nome', celula: (u) => u.nome },
          { titulo: 'Casas decimais', alinhamento: 'direita', celula: (u) => u.casasDecimais },
          { titulo: 'Produtos', alinhamento: 'direita', celula: (u) => u._count.produtos },
          {
            titulo: 'Situação',
            celula: (u) => (
              <Etiqueta cor={u.ativo ? 'verde' : 'cinza'}>{u.ativo ? 'Ativa' : 'Inativa'}</Etiqueta>
            ),
          },
          {
            titulo: 'Ações',
            alinhamento: 'direita',
            celula: (u) =>
              tem('estoque:configurar') && (
                <Botao
                  variante="fantasma"
                  tamanho="sm"
                  onClick={() => abrir(u)}
                  aria-label={`Editar unidade ${u.sigla}`}
                >
                  Editar
                </Botao>
              ),
          },
        ]}
      />
      <Dialogo
        aberto={!!editando}
        aoMudar={(a) => !a && setEditando(null)}
        titulo={editando === 'nova' ? 'Nova unidade' : 'Editar unidade'}
      >
        <form
          noValidate
          className="space-y-3"
          onSubmit={form.handleSubmit(async (dados) => {
            try {
              await api(
                editando === 'nova' ? '/unidades' : `/unidades/${(editando as UnidadeResumo).id}`,
                { metodo: editando === 'nova' ? 'POST' : 'PUT', corpo: dados },
              );
              toast.success('Unidade salva.');
              setEditando(null);
              void qc.invalidateQueries({ queryKey: ['/unidades'] });
            } catch (erro) {
              tratarErro(erro, form.setError);
            }
          })}
        >
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Sigla" erro={e.sigla?.message} obrigatorio>
              <Entrada {...form.register('sigla')} className="uppercase" />
            </Campo>
            <Campo
              rotulo="Casas decimais"
              erro={e.casasDecimais?.message}
              dica="0 para itens contáveis"
            >
              <Entrada type="number" min="0" max="4" {...form.register('casasDecimais')} />
            </Campo>
          </div>
          <Campo rotulo="Nome" erro={e.nome?.message} obrigatorio>
            <Entrada {...form.register('nome')} />
          </Campo>
          <Caixa rotulo="Ativa" {...form.register('ativo')} />
          <div className="flex justify-end">
            <Botao type="submit" carregando={form.formState.isSubmitting}>
              Salvar
            </Botao>
          </div>
        </form>
      </Dialogo>
    </>
  );
}

export default function PaginaEstoque() {
  const { tem } = useAuth();
  return (
    <>
      <CabecalhoPagina
        titulo="Estoque"
        descricao="Saldos por local, locais de armazenamento e unidades de medida"
        acoes={
          tem('transferencias:registrar') && (
            <BotaoLink
              href="/estoque/transferencia"
              icone={<ArrowLeftRight className="h-4 w-4" aria-hidden />}
            >
              Transferir entre locais
            </BotaoLink>
          )
        }
      />
      <Abas
        rotulo="Seções do estoque"
        abas={[
          { valor: 'saldos', titulo: 'Saldos', conteudo: <Saldos />, oculta: !tem('estoque:ler') },
          { valor: 'locais', titulo: 'Locais de armazenamento', conteudo: <Locais /> },
          { valor: 'unidades', titulo: 'Unidades de medida', conteudo: <Unidades /> },
        ]}
      />
    </>
  );
}
