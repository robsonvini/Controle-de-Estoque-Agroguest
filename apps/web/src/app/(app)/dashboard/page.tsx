'use client';

import { AlertTriangle, Ban, Boxes, CircleDollarSign, PackageCheck, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  formatarData,
  formatarDataHora,
  formatarMoeda,
  formatarQuantidade,
  ROTULOS_MOTIVO,
  type MotivoMovimentacao,
} from '@estoque/shared';
import {
  Cartao,
  CabecalhoPagina,
  Carregando,
  ErroCarregamento,
  Etiqueta,
  Indicador,
  Vazio,
} from '@/components/ui/basicos';
import { Selecao } from '@/components/ui/campos';
import { useConsulta } from '@/lib/hooks';

// Paleta validada (skill dataviz): slots 1 e 2 do tema categórico + cor da marca para série única
const COR_ENTRADAS = '#2a78d6';
const COR_SAIDAS = '#eb6834';
const COR_SERIE_UNICA = '#2b7a4b';
const COR_GRADE = '#e5e7eb';
const COR_EIXO = '#4b5563';

interface Resumo {
  indicadores: Record<string, string | number>;
  historico: {
    dia: string;
    entradas: string;
    saidas: string;
    valorEntradas: string;
    valorSaidas: string;
  }[];
  maisMovimentados: {
    id: string;
    sku: string;
    nome: string;
    unidade: string;
    movimentacoes: number;
    quantidade: string;
  }[];
  alertasReposicao: {
    id: string;
    sku: string;
    nome: string;
    unidade: string;
    disponivel: string;
    estoqueMinimo: string;
    sugestaoCompra: string;
    situacao: string;
  }[];
  entradasRecentes: Movimento[];
  saidasRecentes: Movimento[];
  pendencias: { ajustesPendentes: number; inventariosAbertos: number; pedidosReservados: number };
  integracao: { ativo: boolean; falhasConsecutivas: number; ultimoSucessoEm: string | null } | null;
  geradoEm: string;
}
interface Movimento {
  id: string;
  numero: string;
  motivo: MotivoMovimentacao;
  dataMovimentacao: string;
  valorTotal: string;
  usuario: { nome: string } | null;
  clienteApi: { nome: string } | null;
  _count: { itens: number };
}

const diaCurto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function Recentes({ titulo, itens, href }: { titulo: string; itens: Movimento[]; href: string }) {
  return (
    <Cartao
      titulo={titulo}
      acoes={
        <Link href={href} className="text-sm font-medium text-marca-700 underline">
          Ver todas
        </Link>
      }
    >
      {itens.length === 0 ? (
        <Vazio texto="Nenhuma movimentação registrada." />
      ) : (
        <ul className="divide-y divide-gray-100">
          {itens.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <Link href={`/movimentacoes/${m.id}`} className="font-medium hover:underline">
                  Nº {m.numero} · {ROTULOS_MOTIVO[m.motivo]}
                </Link>
                <p className="truncate text-xs text-suave">
                  {formatarDataHora(m.dataMovimentacao)} ·{' '}
                  {m.usuario?.nome ?? m.clienteApi?.nome ?? 'sistema'} · {m._count.itens} item(ns)
                </p>
              </div>
              <span className="tabular-nums">{formatarMoeda(m.valorTotal)}</span>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}

export default function PaginaDashboard() {
  const [dias, setDias] = useState('30');
  // Atualização automática a cada 60 s, sem recarregar a página
  const { data, error, isLoading, refetch, isFetching } = useConsulta<Resumo>(
    '/dashboard',
    { dias },
    { intervalo: 60_000 },
  );

  if (isLoading) return <Carregando />;
  if (error || !data) return <ErroCarregamento erro={error} tentarNovamente={refetch} />;
  const i = data.indicadores;
  const historico = data.historico.map((h) => ({
    ...h,
    entradas: Number(h.entradas),
    saidas: Number(h.saidas),
  }));
  const maisMovimentados = data.maisMovimentados.map((m) => ({
    ...m,
    quantidade: Number(m.quantidade),
    rotulo: m.sku,
  }));

  return (
    <>
      <CabecalhoPagina
        titulo="Dashboard"
        descricao={`Atualizado em ${formatarDataHora(data.geradoEm)}`}
        acoes={
          <div className="flex items-end gap-2">
            <div>
              <label htmlFor="periodo-dashboard" className="block text-xs font-medium text-suave">
                Período
              </label>
              <Selecao
                id="periodo-dashboard"
                value={dias}
                onChange={(e) => setDias(e.target.value)}
                className="h-9 w-40"
              >
                <option value="7">Últimos 7 dias</option>
                <option value="30">Últimos 30 dias</option>
                <option value="90">Últimos 90 dias</option>
              </Selecao>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-borda bg-white px-3 text-sm"
              aria-label="Atualizar indicadores"
            >
              <RefreshCw className={isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden />{' '}
              Atualizar
            </button>
          </div>
        }
      />

      <section
        aria-label="Indicadores"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5"
      >
        <Indicador
          rotulo="Produtos cadastrados (ativos)"
          valor={formatarQuantidade(i.totalProdutos)}
          icone={<Boxes className="h-5 w-5" />}
        />
        <Indicador
          rotulo="Produtos disponíveis"
          valor={formatarQuantidade(i.produtosDisponiveis)}
          icone={<PackageCheck className="h-5 w-5" />}
          tom="positivo"
        />
        <Indicador
          rotulo="Estoque baixo"
          valor={formatarQuantidade(i.produtosEstoqueBaixo)}
          detalhe="Disponível abaixo do mínimo"
          icone={<AlertTriangle className="h-5 w-5" />}
          tom="alerta"
        />
        <Indicador
          rotulo="Sem estoque"
          valor={formatarQuantidade(i.produtosSemEstoque)}
          icone={<Ban className="h-5 w-5" />}
          tom="critico"
        />
        <Indicador
          rotulo="Valor total do estoque"
          valor={formatarMoeda(i.valorTotalEstoque)}
          detalhe="Pelo custo médio ponderado"
          icone={<CircleDollarSign className="h-5 w-5" />}
        />
      </section>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Cartao
          titulo={`Entradas e saídas (quantidade) — últimos ${dias} dias`}
          className="xl:col-span-2"
        >
          <figure>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={historico}
                  margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
                  accessibilityLayer
                  title="Entradas e saídas por dia"
                  desc="Use as setas do teclado para percorrer os dias"
                >
                  <CartesianGrid stroke={COR_GRADE} vertical={false} />
                  <XAxis
                    dataKey="dia"
                    tickFormatter={diaCurto}
                    tick={{ fill: COR_EIXO, fontSize: 12 }}
                    tickLine={false}
                    axisLine={{ stroke: COR_GRADE }}
                    minTickGap={20}
                  />
                  <YAxis
                    tick={{ fill: COR_EIXO, fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tickFormatter={(v) => formatarQuantidade(v, 0)}
                  />
                  <Tooltip
                    cursor={{ stroke: COR_EIXO, strokeDasharray: '3 3' }}
                    labelFormatter={(d) => formatarData(`${d}T12:00:00`)}
                    formatter={(v, nome) => [formatarQuantidade(v), nome]}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="plainline"
                    wrapperStyle={{ fontSize: 13, color: '#1a1f1c' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="entradas"
                    name="Entradas"
                    stroke={COR_ENTRADAS}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="saidas"
                    name="Saídas"
                    stroke={COR_SAIDAS}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* Alternativa textual ao gráfico (leitores de tela e consulta precisa) */}
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer font-medium text-marca-700">
                Ver dados em tabela
              </summary>
              <div className="mt-2 max-h-60 overflow-y-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Entradas e saídas por dia</caption>
                  <thead>
                    <tr className="text-left">
                      <th scope="col" className="py-1">
                        Dia
                      </th>
                      <th scope="col" className="py-1 text-right">
                        Entradas
                      </th>
                      <th scope="col" className="py-1 text-right">
                        Saídas
                      </th>
                      <th scope="col" className="py-1 text-right">
                        Valor entradas
                      </th>
                      <th scope="col" className="py-1 text-right">
                        Valor saídas
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.historico
                      .filter((h) => Number(h.entradas) || Number(h.saidas))
                      .map((h) => (
                        <tr key={h.dia} className="border-t border-gray-100">
                          <th scope="row" className="py-1 text-left font-normal">
                            {formatarData(`${h.dia}T12:00:00`)}
                          </th>
                          <td className="py-1 text-right tabular-nums">
                            {formatarQuantidade(h.entradas)}
                          </td>
                          <td className="py-1 text-right tabular-nums">
                            {formatarQuantidade(h.saidas)}
                          </td>
                          <td className="py-1 text-right tabular-nums">
                            {formatarMoeda(h.valorEntradas)}
                          </td>
                          <td className="py-1 text-right tabular-nums">
                            {formatarMoeda(h.valorSaidas)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>
          </figure>
        </Cartao>

        <Cartao titulo="Produtos mais movimentados">
          {maisMovimentados.length === 0 ? (
            <Vazio texto="Sem movimentações no período." />
          ) : (
            <figure>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={maisMovimentados}
                    layout="vertical"
                    margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
                    barCategoryGap={6}
                    accessibilityLayer
                    title="Produtos mais movimentados"
                    desc="Use as setas do teclado para percorrer os produtos"
                  >
                    <CartesianGrid stroke={COR_GRADE} horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: COR_EIXO, fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="rotulo"
                      width={96}
                      tick={{ fill: COR_EIXO, fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: '#f3f4f6' }}
                      formatter={(v) => [`${v} movimentação(ões)`, 'Movimentações']}
                      labelFormatter={(sku) =>
                        maisMovimentados.find((m) => m.rotulo === sku)?.nome ?? String(sku)
                      }
                    />
                    <Bar
                      dataKey="movimentacoes"
                      name="Movimentações"
                      fill={COR_SERIE_UNICA}
                      radius={[0, 4, 4, 0]}
                      maxBarSize={18}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <figcaption className="sr-only">
                Movimentações por produto:
                {maisMovimentados
                  .map((m) => `${m.nome}: ${m.movimentacoes} movimentações`)
                  .join('; ')}
              </figcaption>
            </figure>
          )}
        </Cartao>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Cartao
          titulo="Alertas de reposição"
          className="xl:col-span-2"
          acoes={
            <Link
              href="/produtos?situacaoEstoque=BAIXO"
              className="text-sm font-medium text-marca-700 underline"
            >
              Ver produtos
            </Link>
          }
        >
          {data.alertasReposicao.length === 0 ? (
            <Vazio texto="Nenhum produto abaixo do estoque mínimo." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Produtos que precisam de reposição</caption>
                <thead>
                  <tr className="text-left text-suave">
                    <th scope="col" className="py-1.5">
                      Produto
                    </th>
                    <th scope="col" className="py-1.5">
                      Situação
                    </th>
                    <th scope="col" className="py-1.5 text-right">
                      Disponível
                    </th>
                    <th scope="col" className="py-1.5 text-right">
                      Mínimo
                    </th>
                    <th scope="col" className="py-1.5 text-right">
                      Sugestão de compra
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.alertasReposicao.map((a) => (
                    <tr key={a.id} className="border-t border-gray-100">
                      <td className="py-1.5">
                        <Link href={`/produtos/${a.id}`} className="font-medium hover:underline">
                          {a.nome}
                        </Link>
                        <span className="block text-xs text-suave">{a.sku}</span>
                      </td>
                      <td className="py-1.5">
                        {a.situacao === 'ESGOTADO' ? (
                          <Etiqueta cor="vermelho">Esgotado</Etiqueta>
                        ) : (
                          <Etiqueta cor="amarelo">Baixo</Etiqueta>
                        )}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {formatarQuantidade(a.disponivel)} {a.unidade}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {formatarQuantidade(a.estoqueMinimo)}
                      </td>
                      <td className="py-1.5 text-right font-medium tabular-nums">
                        {formatarQuantidade(a.sugestaoCompra)} {a.unidade}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>

        <Cartao titulo="Pendências">
          <ul className="space-y-3 text-sm">
            <li className="flex justify-between">
              <Link href="/inventario?aba=ajustes&status=PENDENTE" className="hover:underline">
                Ajustes aguardando aprovação
              </Link>
              <strong>{data.pendencias.ajustesPendentes}</strong>
            </li>
            <li className="flex justify-between">
              <Link href="/inventario" className="hover:underline">
                Inventários em andamento
              </Link>
              <strong>{data.pendencias.inventariosAbertos}</strong>
            </li>
            <li className="flex justify-between">
              <Link href="/pedidos?status=RESERVADO" className="hover:underline">
                Pedidos com estoque reservado
              </Link>
              <strong>{data.pendencias.pedidosReservados}</strong>
            </li>
            <li className="flex items-center justify-between">
              <Link href="/integracao" className="hover:underline">
                Integração com o CRM
              </Link>
              {!data.integracao?.ativo ? (
                <Etiqueta cor="cinza">Desativada</Etiqueta>
              ) : data.integracao.falhasConsecutivas > 0 ? (
                <Etiqueta cor="vermelho">{data.integracao.falhasConsecutivas} falha(s)</Etiqueta>
              ) : (
                <Etiqueta cor="verde">Operando</Etiqueta>
              )}
            </li>
          </ul>
        </Cartao>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Recentes titulo="Entradas recentes" itens={data.entradasRecentes} href="/entradas" />
        <Recentes titulo="Saídas recentes" itens={data.saidasRecentes} href="/saidas" />
      </div>
    </>
  );
}
