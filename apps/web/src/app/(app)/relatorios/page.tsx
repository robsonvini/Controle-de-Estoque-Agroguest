'use client';

import { FileSpreadsheet, FileText, Play } from 'lucide-react';
import { useState } from 'react';
import {
  formatarData,
  formatarDataHora,
  formatarMoeda,
  formatarQuantidade,
  ROTULOS_MOTIVO,
  ROTULOS_RELATORIO,
  ROTULOS_TIPO_MOVIMENTACAO,
  TIPOS_MOVIMENTACAO,
  TIPOS_RELATORIO,
  type MotivoMovimentacao,
  type TipoRelatorio,
} from '@estoque/shared';
import {
  CabecalhoPagina,
  Carregando,
  Cartao,
  ErroCarregamento,
  Vazio,
} from '@/components/ui/basicos';
import { Botao } from '@/components/ui/botao';
import { Campo, Entrada, Selecao } from '@/components/ui/campos';
import { baixarArquivo } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCategorias, useConsulta, useFornecedoresAtivos, useLocais } from '@/lib/hooks';
import { tratarErro } from '@/lib/utils';

type TipoColuna = 'texto' | 'numero' | 'quantidade' | 'moeda' | 'data' | 'dataHora' | 'percentual';
interface Relatorio {
  titulo: string;
  colunas: { chave: string; titulo: string; tipo: TipoColuna }[];
  linhas: Record<string, unknown>[];
  totais?: Record<string, unknown>;
  filtros: Record<string, string>;
  geradoEm: string;
}

const DESCRICOES: Record<TipoRelatorio, string> = {
  'posicao-estoque': 'Saldo, reservado, disponível e valor por produto.',
  'historico-movimentacoes': 'Todas as entradas, saídas, transferências e ajustes no período.',
  'mais-vendidos': 'Ranking de produtos por quantidade vendida.',
  'baixo-giro': 'Produtos com saldo e poucas saídas na janela de dias.',
  'sem-movimentacao': 'Produtos sem nenhuma movimentação na janela de dias.',
  'inventarios-divergencias': 'Itens com diferença entre contagem física e sistema.',
  'valor-estoque': 'Valor financeiro do estoque por categoria (custo médio).',
  'historico-compras': 'Pedidos de compra, valores pedidos e recebidos.',
  'perdas-ajustes': 'Perdas, avarias e ajustes com impacto financeiro.',
};

const USA_PERIODO: TipoRelatorio[] = [
  'historico-movimentacoes',
  'mais-vendidos',
  'inventarios-divergencias',
  'historico-compras',
  'perdas-ajustes',
];
const USA_DIAS: TipoRelatorio[] = ['baixo-giro', 'sem-movimentacao'];

function formatar(valor: unknown, tipo: TipoColuna) {
  if (valor === null || valor === undefined || valor === '') return '—';
  switch (tipo) {
    case 'moeda':
      return formatarMoeda(valor);
    case 'quantidade':
    case 'numero':
      return formatarQuantidade(valor);
    case 'percentual':
      return `${formatarQuantidade(valor, 2)}%`;
    case 'data':
      return formatarData(valor as string);
    case 'dataHora':
      return formatarDataHora(valor as string);
    default:
      return String(valor);
  }
}

export default function PaginaRelatorios() {
  const { tem } = useAuth();
  const [tipo, setTipo] = useState<TipoRelatorio>('posicao-estoque');
  const [filtro, setFiltro] = useState<Record<string, string>>({});
  const [aplicado, setAplicado] = useState<{
    tipo: TipoRelatorio;
    filtro: Record<string, string>;
  } | null>(null);
  const [exportando, setExportando] = useState<string | null>(null);
  const { data: categorias } = useCategorias();
  const { data: fornecedores } = useFornecedoresAtivos();
  const { data: locais } = useLocais(false);
  const { data, isLoading, isFetching, error } = useConsulta<Relatorio>(
    aplicado ? `/relatorios/${aplicado.tipo}` : null,
    aplicado?.filtro,
  );
  const def = (k: string) => (e: { target: { value: string } }) =>
    setFiltro((f) => ({ ...f, [k]: e.target.value }));

  const exportar = async (formato: 'pdf' | 'xlsx') => {
    setExportando(formato);
    try {
      await baixarArquivo(`/relatorios/${tipo}`, { ...filtro, formato }, `${tipo}.${formato}`);
    } catch (e) {
      tratarErro(e);
    } finally {
      setExportando(null);
    }
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Relatórios gerenciais"
        descricao="Gere, visualize e exporte relatórios em PDF ou Excel"
      />
      <Cartao className="mb-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAplicado({ tipo, filtro: { ...filtro } });
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Campo rotulo="Relatório" dica={DESCRICOES[tipo]} className="md:col-span-3">
              <Selecao value={tipo} onChange={(e) => setTipo(e.target.value as TipoRelatorio)}>
                {TIPOS_RELATORIO.map((t) => (
                  <option key={t} value={t}>
                    {ROTULOS_RELATORIO[t]}
                  </option>
                ))}
              </Selecao>
            </Campo>
            {USA_PERIODO.includes(tipo) && (
              <>
                <Campo rotulo="Data inicial">
                  <Entrada
                    type="date"
                    value={filtro.dataInicio ?? ''}
                    onChange={def('dataInicio')}
                  />
                </Campo>
                <Campo rotulo="Data final">
                  <Entrada type="date" value={filtro.dataFim ?? ''} onChange={def('dataFim')} />
                </Campo>
              </>
            )}
            {USA_DIAS.includes(tipo) && (
              <Campo rotulo="Janela (dias)" dica="Padrão: 90 dias">
                <Entrada
                  type="number"
                  min="1"
                  max="3650"
                  value={filtro.dias ?? ''}
                  onChange={def('dias')}
                />
              </Campo>
            )}
            {tipo !== 'historico-compras' && (
              <Campo rotulo="Categoria">
                <Selecao value={filtro.categoriaId ?? ''} onChange={def('categoriaId')}>
                  <option value="">Todas</option>
                  {categorias?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.caminho}
                    </option>
                  ))}
                </Selecao>
              </Campo>
            )}
            <Campo rotulo="Fornecedor">
              <Selecao value={filtro.fornecedorId ?? ''} onChange={def('fornecedorId')}>
                <option value="">Todos</option>
                {fornecedores?.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.razaoSocial}
                  </option>
                ))}
              </Selecao>
            </Campo>
            {[
              'posicao-estoque',
              'historico-movimentacoes',
              'inventarios-divergencias',
              'valor-estoque',
              'perdas-ajustes',
            ].includes(tipo) && (
              <Campo rotulo="Local">
                <Selecao value={filtro.localId ?? ''} onChange={def('localId')}>
                  <option value="">Todos</option>
                  {locais?.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.codigo} — {l.nome}
                    </option>
                  ))}
                </Selecao>
              </Campo>
            )}
            {tipo === 'historico-movimentacoes' && (
              <>
                <Campo rotulo="Tipo de movimentação">
                  <Selecao value={filtro.tipo ?? ''} onChange={def('tipo')}>
                    <option value="">Todos</option>
                    {TIPOS_MOVIMENTACAO.map((t) => (
                      <option key={t} value={t}>
                        {ROTULOS_TIPO_MOVIMENTACAO[t]}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
                <Campo rotulo="Motivo">
                  <Selecao value={filtro.motivo ?? ''} onChange={def('motivo')}>
                    <option value="">Todos</option>
                    {(Object.keys(ROTULOS_MOTIVO) as MotivoMovimentacao[]).map((m) => (
                      <option key={m} value={m}>
                        {ROTULOS_MOTIVO[m]}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
              </>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {tem('relatorios:exportar') && (
              <>
                <Botao
                  variante="secundario"
                  icone={<FileText className="h-4 w-4" aria-hidden />}
                  carregando={exportando === 'pdf'}
                  onClick={() => void exportar('pdf')}
                >
                  Exportar PDF
                </Botao>
                <Botao
                  variante="secundario"
                  icone={<FileSpreadsheet className="h-4 w-4" aria-hidden />}
                  carregando={exportando === 'xlsx'}
                  onClick={() => void exportar('xlsx')}
                >
                  Exportar Excel
                </Botao>
              </>
            )}
            <Botao type="submit" icone={<Play className="h-4 w-4" aria-hidden />}>
              Gerar relatório
            </Botao>
          </div>
        </form>
      </Cartao>

      {!aplicado ? (
        <Vazio texto="Escolha o relatório e os filtros e clique em “Gerar relatório”." />
      ) : isLoading ? (
        <Carregando texto="Gerando relatório…" />
      ) : error ? (
        <ErroCarregamento erro={error} />
      ) : data ? (
        <section aria-labelledby="titulo-relatorio" aria-busy={isFetching}>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="titulo-relatorio" className="text-lg font-semibold">
              {data.titulo}
            </h2>
            <p className="text-sm text-suave" aria-live="polite">
              {data.linhas.length} registro(s) · gerado em {formatarDataHora(data.geradoEm)}
            </p>
          </div>
          {data.linhas.length === 0 ? (
            <Vazio texto="Nenhum registro para os filtros informados." />
          ) : (
            <div
              className="max-h-[70vh] overflow-auto rounded-lg border border-borda bg-white"
              tabIndex={0}
              role="region"
              aria-label={data.titulo}
            >
              <table className="min-w-full text-sm">
                <caption className="sr-only">{data.titulo}</caption>
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    {data.colunas.map((c) => (
                      <th
                        key={c.chave}
                        scope="col"
                        className={`px-3 py-2 whitespace-nowrap ${['moeda', 'quantidade', 'numero', 'percentual'].includes(c.tipo) ? 'text-right' : 'text-left'}`}
                      >
                        {c.titulo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.linhas.map((l, i) => (
                    <tr key={i}>
                      {data.colunas.map((c) => (
                        <td
                          key={c.chave}
                          className={`px-3 py-1.5 ${['moeda', 'quantidade', 'numero', 'percentual'].includes(c.tipo) ? 'text-right tabular-nums' : ''}`}
                        >
                          {formatar(l[c.chave], c.tipo)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.totais && (
            <dl className="mt-3 flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm">
              {Object.entries(data.totais).map(([k, v]) => (
                <div key={k} className="flex gap-1">
                  <dt className="text-suave">
                    {k === 'produtos'
                      ? 'Produtos'
                      : k === 'registros'
                        ? 'Registros'
                        : k === 'dias'
                          ? 'Janela (dias)'
                          : k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                    :
                  </dt>
                  <dd className="font-semibold">
                    {['produtos', 'registros', 'dias'].includes(k) ? String(v) : formatarMoeda(v)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      ) : null}
    </>
  );
}
