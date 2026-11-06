'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, RotateCcw, Save, Send, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { formatarDataHora, formatarQuantidade } from '@estoque/shared';
import { EtiquetaStatus } from '@/components/listagem';
import {
  CabecalhoPagina,
  Carregando,
  Cartao,
  ErroCarregamento,
  Etiqueta,
  ListaDados,
} from '@/components/ui/basicos';
import { Botao } from '@/components/ui/botao';
import { Confirmacao } from '@/components/ui/dialogo';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useConsulta } from '@/lib/hooks';
import { tratarErro } from '@/lib/utils';

interface Item {
  id: string;
  quantidadeSistema: string | null;
  quantidadeContada: string | null;
  divergencia: string | null;
  contadoEm: string | null;
  contadoPor: { nome: string } | null;
  produto: {
    id: string;
    sku: string;
    nome: string;
    codigoBarras: string | null;
    unidadeMedida: { sigla: string; casasDecimais: number };
  };
  local: { codigo: string; nome: string };
}
interface Inventario {
  id: string;
  numero: string;
  descricao: string;
  status: string;
  contagemCega: boolean;
  observacao: string | null;
  iniciadoEm: string;
  finalizadoEm: string | null;
  local: { codigo: string; nome: string } | null;
  categoria: { nome: string } | null;
  criadoPor: { nome: string };
  itens: Item[];
  ajustes: { id: string; numero: string; status: string }[];
  resumo: { totalItens: number; contados: number; divergentes: number };
}

export default function DetalheInventario() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { tem } = useAuth();
  const qc = useQueryClient();
  const { data: inv, error, isLoading, refetch } = useConsulta<Inventario>(`/inventarios/${id}`);
  const [contagens, setContagens] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [acao, setAcao] = useState<'concluir' | 'ajuste' | 'cancelar' | null>(null);

  useEffect(() => {
    if (inv)
      setContagens(Object.fromEntries(inv.itens.map((i) => [i.id, i.quantidadeContada ?? ''])));
  }, [inv]);

  if (isLoading) return <Carregando />;
  if (error || !inv) return <ErroCarregamento erro={error} tentarNovamente={refetch} />;
  const emContagem = inv.status === 'EM_CONTAGEM';
  const podeEscrever = tem('inventarios:escrever');
  const alterados = inv.itens.filter(
    (i) => (contagens[i.id] ?? '') !== (i.quantidadeContada ?? '') && contagens[i.id] !== '',
  );
  const termo = filtro.trim().toLowerCase();
  const visiveis = inv.itens.filter(
    (i) =>
      !termo ||
      i.produto.nome.toLowerCase().includes(termo) ||
      i.produto.sku.toLowerCase().includes(termo) ||
      i.produto.codigoBarras === filtro.trim(),
  );

  const salvar = async () => {
    if (!alterados.length) return true;
    setSalvando(true);
    try {
      await api(`/inventarios/${inv.id}/contagens`, {
        metodo: 'POST',
        corpo: {
          itens: alterados.map((i) => ({ itemId: i.id, quantidadeContada: contagens[i.id] })),
        },
      });
      toast.success(`${alterados.length} contagem(ns) registrada(s).`);
      await refetch();
      return true;
    } catch (e) {
      tratarErro(e);
      return false;
    } finally {
      setSalvando(false);
    }
  };
  const executar = async (caminho: string, corpo?: unknown, sucesso?: string) => {
    try {
      const r = await api<{ ajusteId?: string | null }>(`/inventarios/${inv.id}/${caminho}`, {
        metodo: 'POST',
        corpo,
      });
      if (sucesso) toast.success(sucesso);
      await qc.invalidateQueries();
      return r;
    } catch (e) {
      tratarErro(e);
      throw e;
    }
  };

  return (
    <>
      <CabecalhoPagina
        titulo={`Inventário nº ${inv.numero}`}
        descricao={inv.descricao}
        acoes={
          podeEscrever && (
            <>
              {emContagem && (
                <>
                  <Botao
                    variante="secundario"
                    icone={<Save className="h-4 w-4" aria-hidden />}
                    carregando={salvando}
                    disabled={!alterados.length}
                    onClick={() => void salvar()}
                  >
                    Salvar contagens{alterados.length ? ` (${alterados.length})` : ''}
                  </Botao>
                  <Botao
                    icone={<ClipboardCheck className="h-4 w-4" aria-hidden />}
                    onClick={() => setAcao('concluir')}
                  >
                    Concluir contagem
                  </Botao>
                </>
              )}
              {inv.status === 'EM_REVISAO' && !inv.ajustes.some((a) => a.status === 'PENDENTE') && (
                <>
                  <Botao
                    variante="secundario"
                    icone={<RotateCcw className="h-4 w-4" aria-hidden />}
                    onClick={() =>
                      void executar('reabrir', undefined, 'Inventário reaberto para recontagem.')
                    }
                  >
                    Recontar
                  </Botao>
                  {tem('ajustes:solicitar') && (
                    <Botao
                      icone={<Send className="h-4 w-4" aria-hidden />}
                      onClick={() => setAcao('ajuste')}
                    >
                      {inv.resumo.divergentes
                        ? 'Solicitar ajuste das divergências'
                        : 'Finalizar inventário'}
                    </Botao>
                  )}
                </>
              )}
              {['EM_CONTAGEM', 'EM_REVISAO'].includes(inv.status) && (
                <Botao
                  variante="fantasma"
                  icone={<XCircle className="h-4 w-4" aria-hidden />}
                  onClick={() => setAcao('cancelar')}
                >
                  Cancelar
                </Botao>
              )}
            </>
          )
        }
      />
      <Cartao className="mb-4">
        <ListaDados
          itens={[
            ['Status', <EtiquetaStatus key="s" status={inv.status} />],
            [
              'Escopo',
              [
                inv.local ? `${inv.local.codigo} — ${inv.local.nome}` : 'Todos os locais',
                inv.categoria?.nome,
              ]
                .filter(Boolean)
                .join(' · '),
            ],
            ['Aberto por', `${inv.criadoPor.nome} em ${formatarDataHora(inv.iniciadoEm)}`],
            ['Progresso', `${inv.resumo.contados} de ${inv.resumo.totalItens} itens contados`],
            [
              'Divergências',
              inv.contagemCega
                ? 'Disponível após concluir a contagem'
                : String(inv.resumo.divergentes),
            ],
            [
              'Ajustes',
              inv.ajustes.length
                ? inv.ajustes.map((a) => (
                    <Link
                      key={a.id}
                      href={`/inventario/ajustes/${a.id}`}
                      className="mr-2 underline"
                    >
                      nº {a.numero} ({a.status.toLowerCase()})
                    </Link>
                  ))
                : null,
            ],
          ]}
        />
        {inv.contagemCega && (
          <p className="mt-3 rounded-md bg-blue-50 p-3 text-sm text-blue-900">
            Contagem às cegas: o saldo do sistema fica oculto até a conclusão, para não influenciar
            a conferência.
          </p>
        )}
      </Cartao>

      <div className="mb-3">
        <label htmlFor="filtro-itens" className="block text-xs font-medium text-suave">
          Localizar item (nome, SKU ou código de barras)
        </label>
        <input
          id="filtro-itens"
          type="search"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="h-10 w-full max-w-md rounded-md border border-borda px-3 text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-borda bg-white">
        <table className="min-w-full divide-y divide-borda text-sm">
          <caption className="sr-only">Itens do inventário</caption>
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-3 py-2 text-left">
                Produto
              </th>
              <th scope="col" className="px-3 py-2 text-left">
                Local
              </th>
              {!inv.contagemCega && (
                <th scope="col" className="px-3 py-2 text-right">
                  Sistema
                </th>
              )}
              <th scope="col" className="px-3 py-2 text-right">
                Contado
              </th>
              {!inv.contagemCega && (
                <th scope="col" className="px-3 py-2 text-right">
                  Divergência
                </th>
              )}
              <th scope="col" className="hidden px-3 py-2 text-left md:table-cell">
                Contado por
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visiveis.map((i) => {
              const div = Number(i.divergencia ?? 0);
              return (
                <tr
                  key={i.id}
                  className={div !== 0 && !inv.contagemCega ? 'bg-amber-50' : undefined}
                >
                  <td className="px-3 py-2">
                    <strong>{i.produto.sku}</strong> — {i.produto.nome}
                  </td>
                  <td className="px-3 py-2">{i.local.codigo}</td>
                  {!inv.contagemCega && (
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatarQuantidade(i.quantidadeSistema)}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right">
                    {emContagem && podeEscrever ? (
                      <input
                        type="number"
                        min="0"
                        step={
                          i.produto.unidadeMedida.casasDecimais
                            ? 1 / 10 ** i.produto.unidadeMedida.casasDecimais
                            : 1
                        }
                        inputMode="decimal"
                        aria-label={`Quantidade contada de ${i.produto.nome} em ${i.local.codigo} (${i.produto.unidadeMedida.sigla})`}
                        value={contagens[i.id] ?? ''}
                        onChange={(e) => setContagens({ ...contagens, [i.id]: e.target.value })}
                        className="h-9 w-28 rounded-md border border-borda px-2 text-right"
                      />
                    ) : (
                      <span className="tabular-nums">
                        {i.quantidadeContada !== null
                          ? formatarQuantidade(i.quantidadeContada)
                          : '—'}
                      </span>
                    )}
                    <span className="ml-1 text-xs text-suave">{i.produto.unidadeMedida.sigla}</span>
                  </td>
                  {!inv.contagemCega && (
                    <td className="px-3 py-2 text-right">
                      {div === 0 ? (
                        <Etiqueta cor="verde">Confere</Etiqueta>
                      ) : (
                        <Etiqueta cor={div < 0 ? 'vermelho' : 'azul'}>
                          {div > 0 ? '+' : ''}
                          {formatarQuantidade(div)}
                        </Etiqueta>
                      )}
                    </td>
                  )}
                  <td className="hidden px-3 py-2 text-xs text-suave md:table-cell">
                    {i.contadoPor ? `${i.contadoPor.nome} · ${formatarDataHora(i.contadoEm)}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Confirmacao
        aberto={acao === 'concluir'}
        aoMudar={(a) => !a && setAcao(null)}
        titulo="Concluir contagem"
        mensagem="As contagens não salvas serão gravadas. Após concluir, o sistema compara o físico com o saldo e exibe as divergências."
        rotuloConfirmar="Concluir"
        aoConfirmar={async () => {
          if (!(await salvar())) throw new Error('falha');
          await executar(
            'concluir-contagem',
            undefined,
            'Contagem concluída. Revise as divergências.',
          );
        }}
      />
      <Confirmacao
        aberto={acao === 'ajuste'}
        aoMudar={(a) => !a && setAcao(null)}
        titulo={inv.resumo.divergentes ? 'Solicitar ajuste' : 'Finalizar inventário'}
        mensagem={
          inv.resumo.divergentes
            ? `${inv.resumo.divergentes} divergência(s) serão enviadas para aprovação. O saldo só é alterado após a aprovação por outro usuário.`
            : 'Não há divergências. O inventário será finalizado.'
        }
        exigirJustificativa={inv.resumo.divergentes > 0}
        rotuloConfirmar="Confirmar"
        aoConfirmar={async (justificativa) => {
          const r = await executar(
            'solicitar-ajuste',
            { justificativa: justificativa || 'Inventário sem divergências' },
            inv.resumo.divergentes ? 'Ajuste enviado para aprovação.' : 'Inventário finalizado.',
          );
          if (r?.ajusteId) router.push(`/inventario/ajustes/${r.ajusteId}`);
        }}
      />
      <Confirmacao
        aberto={acao === 'cancelar'}
        aoMudar={(a) => !a && setAcao(null)}
        titulo="Cancelar inventário"
        mensagem="As contagens registradas serão mantidas para histórico, mas nenhum ajuste será gerado."
        rotuloConfirmar="Cancelar inventário"
        perigo
        aoConfirmar={async () => {
          await executar('cancelar', undefined, 'Inventário cancelado.');
        }}
      />
    </>
  );
}
