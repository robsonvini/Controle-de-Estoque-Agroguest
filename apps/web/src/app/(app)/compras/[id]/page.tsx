'use client';

import { useQueryClient } from '@tanstack/react-query';
import { PackageCheck, Send, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { formatarData, formatarDataHora, formatarMoeda, formatarQuantidade } from '@estoque/shared';
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
import { Campo, Entrada, Selecao } from '@/components/ui/campos';
import { Confirmacao, Dialogo } from '@/components/ui/dialogo';
import { Tabela } from '@/components/ui/tabela';
import { api, novaChaveIdempotencia } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useConsulta, useLocais } from '@/lib/hooks';
import { tratarErro } from '@/lib/utils';

interface Compra {
  id: string;
  numero: string;
  status: string;
  dataPedido: string;
  previsaoEntrega: string | null;
  observacao: string | null;
  valorTotal: string;
  motivoCancelamento: string | null;
  fornecedor: { id: string; razaoSocial: string; documento: string };
  criadoPor: { nome: string };
  itens: {
    id: string;
    quantidade: string;
    quantidadeRecebida: string;
    quantidadePendente: string;
    precoUnitario: string;
    produto: {
      id: string;
      sku: string;
      nome: string;
      localPadraoId: string | null;
      unidadeMedida: { sigla: string };
    };
  }[];
  entradas: {
    numeroDocumento: string | null;
    movimentacao: {
      id: string;
      numero: string;
      dataMovimentacao: string;
      valorTotal: string;
      estornadaPor: { id: string } | null;
    };
  }[];
}

function Recebimento({ compra, aoConcluir }: { compra: Compra; aoConcluir: () => void }) {
  const { data: locais } = useLocais();
  const chave = useMemo(() => novaChaveIdempotencia(), []);
  const pendentes = compra.itens.filter((i) => Number(i.quantidadePendente) > 0);
  const [linhas, setLinhas] = useState(() =>
    Object.fromEntries(
      pendentes.map((i) => [
        i.id,
        { quantidade: i.quantidadePendente, localId: i.produto.localPadraoId ?? '' },
      ]),
    ),
  );
  const [doc, setDoc] = useState({ numeroDocumento: '', serieDocumento: '', dataDocumento: '' });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const itens = Object.entries(linhas)
          .filter(([, l]) => Number(l.quantidade) > 0)
          .map(([itemId, l]) => ({ itemId, localId: l.localId, quantidade: l.quantidade }));
        if (!itens.length) return setErro('Informe a quantidade recebida de ao menos um item.');
        if (itens.some((i) => !i.localId))
          return setErro('Informe o local de armazenamento de cada item recebido.');
        setErro('');
        setEnviando(true);
        try {
          const r = await api<{ movimentacaoId: string }>(`/compras/${compra.id}/recebimentos`, {
            metodo: 'POST',
            idempotencia: chave,
            corpo: { ...doc, dataDocumento: doc.dataDocumento || null, itens },
          });
          toast.success('Recebimento registrado. Estoque e custo médio atualizados.');
          aoConcluir();
          void r;
        } catch (er) {
          tratarErro(er);
        } finally {
          setEnviando(false);
        }
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Campo rotulo="Nº da nota fiscal">
          <Entrada
            value={doc.numeroDocumento}
            onChange={(e) => setDoc({ ...doc, numeroDocumento: e.target.value })}
          />
        </Campo>
        <Campo rotulo="Série">
          <Entrada
            value={doc.serieDocumento}
            onChange={(e) => setDoc({ ...doc, serieDocumento: e.target.value })}
          />
        </Campo>
        <Campo rotulo="Data da nota">
          <Entrada
            type="date"
            value={doc.dataDocumento}
            onChange={(e) => setDoc({ ...doc, dataDocumento: e.target.value })}
          />
        </Campo>
      </div>
      <fieldset className="space-y-3">
        <legend className="font-semibold">Itens recebidos</legend>
        {pendentes.map((i) => (
          <div
            key={i.id}
            className="grid grid-cols-1 gap-3 rounded-md border border-gray-200 p-3 sm:grid-cols-[2fr_1fr_1fr]"
          >
            <div className="text-sm">
              <strong>{i.produto.sku}</strong> — {i.produto.nome}
              <span className="block text-xs text-suave">
                Pendente: {formatarQuantidade(i.quantidadePendente)} {i.produto.unidadeMedida.sigla}
              </span>
            </div>
            <Campo rotulo="Quantidade recebida">
              <Entrada
                type="number"
                step="any"
                min="0"
                max={i.quantidadePendente}
                value={linhas[i.id]!.quantidade}
                onChange={(e) =>
                  setLinhas({ ...linhas, [i.id]: { ...linhas[i.id]!, quantidade: e.target.value } })
                }
              />
            </Campo>
            <Campo rotulo="Local de armazenamento">
              <Selecao
                value={linhas[i.id]!.localId}
                onChange={(e) =>
                  setLinhas({ ...linhas, [i.id]: { ...linhas[i.id]!, localId: e.target.value } })
                }
              >
                <option value="">Selecione…</option>
                {locais?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo} — {l.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
          </div>
        ))}
      </fieldset>
      {erro && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {erro}
        </p>
      )}
      <div className="flex justify-end">
        <Botao type="submit" carregando={enviando}>
          Confirmar recebimento
        </Botao>
      </div>
    </form>
  );
}

export default function DetalheCompra() {
  const { id } = useParams<{ id: string }>();
  const { tem } = useAuth();
  const qc = useQueryClient();
  const { data: c, error, isLoading, refetch } = useConsulta<Compra>(`/compras/${id}`);
  const [recebendo, setRecebendo] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  if (isLoading) return <Carregando />;
  if (error || !c) return <ErroCarregamento erro={error} tentarNovamente={refetch} />;
  const atualizar = () => qc.invalidateQueries();
  const pode = tem('compras:escrever');

  return (
    <>
      <CabecalhoPagina
        titulo={`Pedido de compra nº ${c.numero}`}
        descricao={`${c.fornecedor.razaoSocial} · criado por ${c.criadoPor.nome}`}
        acoes={
          pode && (
            <>
              {c.status === 'RASCUNHO' && (
                <Botao
                  icone={<Send className="h-4 w-4" aria-hidden />}
                  carregando={enviando}
                  onClick={async () => {
                    setEnviando(true);
                    try {
                      await api(`/compras/${c.id}/enviar`, { metodo: 'POST' });
                      toast.success('Pedido marcado como enviado ao fornecedor.');
                      await atualizar();
                    } catch (e) {
                      tratarErro(e);
                    } finally {
                      setEnviando(false);
                    }
                  }}
                >
                  Marcar como enviado
                </Botao>
              )}
              {['ENVIADO', 'PARCIALMENTE_RECEBIDO'].includes(c.status) &&
                tem('entradas:registrar') && (
                  <Botao
                    icone={<PackageCheck className="h-4 w-4" aria-hidden />}
                    onClick={() => setRecebendo(true)}
                  >
                    Receber mercadorias
                  </Botao>
                )}
              {['RASCUNHO', 'ENVIADO', 'PARCIALMENTE_RECEBIDO'].includes(c.status) && (
                <Botao
                  variante="secundario"
                  icone={<XCircle className="h-4 w-4" aria-hidden />}
                  onClick={() => setCancelando(true)}
                >
                  Cancelar pedido
                </Botao>
              )}
            </>
          )
        }
      />
      <Cartao className="mb-4">
        <ListaDados
          itens={[
            ['Status', <EtiquetaStatus key="s" status={c.status} />],
            ['Data do pedido', formatarDataHora(c.dataPedido)],
            ['Previsão de entrega', formatarData(c.previsaoEntrega)],
            [
              'Fornecedor',
              <Link key="f" className="underline" href={`/fornecedores/${c.fornecedor.id}`}>
                {c.fornecedor.razaoSocial}
              </Link>,
            ],
            ['Valor total', formatarMoeda(c.valorTotal)],
            ['Observação', c.observacao],
            ...(c.motivoCancelamento
              ? ([['Motivo do cancelamento', c.motivoCancelamento]] as [string, string][])
              : []),
          ]}
        />
      </Cartao>
      <h2 className="mb-2 text-lg font-semibold">Itens</h2>
      <Tabela
        legenda="Itens do pedido de compra"
        dados={c.itens}
        chave={(i) => i.id}
        colunas={[
          {
            titulo: 'Produto',
            celula: (i) => (
              <Link className="text-marca-800 underline" href={`/produtos/${i.produto.id}`}>
                {i.produto.sku} — {i.produto.nome}
              </Link>
            ),
          },
          {
            titulo: 'Pedido',
            alinhamento: 'direita',
            celula: (i) => `${formatarQuantidade(i.quantidade)} ${i.produto.unidadeMedida.sigla}`,
          },
          {
            titulo: 'Recebido',
            alinhamento: 'direita',
            celula: (i) => formatarQuantidade(i.quantidadeRecebida),
          },
          {
            titulo: 'Pendente',
            alinhamento: 'direita',
            celula: (i) => <strong>{formatarQuantidade(i.quantidadePendente)}</strong>,
          },
          {
            titulo: 'Preço unitário',
            alinhamento: 'direita',
            celula: (i) => formatarMoeda(i.precoUnitario),
          },
          {
            titulo: 'Subtotal',
            alinhamento: 'direita',
            celula: (i) => formatarMoeda(Number(i.quantidade) * Number(i.precoUnitario)),
          },
        ]}
      />
      <h2 className="mt-6 mb-2 text-lg font-semibold">Recebimentos</h2>
      <Tabela
        legenda="Recebimentos do pedido"
        dados={c.entradas}
        chave={(e) => e.movimentacao.id}
        textoVazio="Nenhum recebimento registrado."
        colunas={[
          {
            titulo: 'Movimentação',
            celula: (e) => (
              <Link className="underline" href={`/movimentacoes/${e.movimentacao.id}`}>
                nº {e.movimentacao.numero}
              </Link>
            ),
          },
          { titulo: 'Data', celula: (e) => formatarDataHora(e.movimentacao.dataMovimentacao) },
          { titulo: 'Nota fiscal', celula: (e) => e.numeroDocumento ?? '—' },
          {
            titulo: 'Valor',
            alinhamento: 'direita',
            celula: (e) => formatarMoeda(e.movimentacao.valorTotal),
          },
          {
            titulo: 'Situação',
            celula: (e) =>
              e.movimentacao.estornadaPor ? (
                <Etiqueta cor="vermelho">Estornado</Etiqueta>
              ) : (
                <Etiqueta cor="verde">Válido</Etiqueta>
              ),
          },
        ]}
      />
      <Dialogo
        aberto={recebendo}
        aoMudar={setRecebendo}
        titulo="Receber mercadorias"
        descricao="Registre as quantidades efetivamente recebidas (total ou parcial)."
        largura="max-w-3xl"
      >
        <Recebimento
          compra={c}
          aoConcluir={() => {
            setRecebendo(false);
            void atualizar();
          }}
        />
      </Dialogo>
      <Confirmacao
        aberto={cancelando}
        aoMudar={setCancelando}
        titulo="Cancelar pedido de compra"
        mensagem="Os recebimentos já registrados são mantidos; o saldo pendente deixa de ser esperado."
        rotuloConfirmar="Cancelar pedido"
        rotuloJustificativa="Motivo do cancelamento"
        perigo
        exigirJustificativa
        aoConfirmar={async (motivo) => {
          try {
            await api(`/compras/${c.id}/cancelar`, { metodo: 'POST', corpo: { motivo } });
            toast.success('Pedido cancelado.');
            await atualizar();
          } catch (e) {
            tratarErro(e);
            throw e;
          }
        }}
      />
    </>
  );
}
