'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  formatarDataHora,
  formatarMoeda,
  formatarQuantidade,
  ROTULOS_MOTIVO,
  type MotivoMovimentacao,
  type TipoMovimentacao,
} from '@estoque/shared';
import { EtiquetaSituacao, EtiquetaTipo } from '@/components/listagem';
import { Abas } from '@/components/ui/abas';
import {
  CabecalhoPagina,
  Carregando,
  Cartao,
  ErroCarregamento,
  Etiqueta,
  Indicador,
  ListaDados,
} from '@/components/ui/basicos';
import { Botao, BotaoLink } from '@/components/ui/botao';
import { Campo, Entrada } from '@/components/ui/campos';
import { Confirmacao, Dialogo } from '@/components/ui/dialogo';
import { Tabela } from '@/components/ui/tabela';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useConsulta } from '@/lib/hooks';
import { tratarErro } from '@/lib/utils';

export interface ProdutoDetalhe {
  id: string;
  codigoInterno: string;
  sku: string;
  codigoBarras: string | null;
  nome: string;
  descricao: string | null;
  status: string;
  precoCusto: string;
  precoVenda: string;
  custoMedio: string;
  estoqueMinimo: string;
  estoqueMaximo: string | null;
  criadoEm: string;
  atualizadoEm: string;
  categoria: { id: string; nome: string } | null;
  unidadeMedida: { id: string; sigla: string; nome: string };
  localPadrao: { id: string; codigo: string; nome: string } | null;
  imagens: { id: string; url: string; textoAlternativo: string; nomeArquivo: string }[];
  fornecedores: {
    codigoNoFornecedor: string | null;
    prazoEntregaDias: number | null;
    principal: boolean;
    ultimoPrecoCompra: string | null;
    fornecedor: { id: string; razaoSocial: string; situacao: string };
  }[];
  saldos: {
    local: { id: string; codigo: string; nome: string };
    quantidade: string;
    reservado: string;
    disponivel: string;
    atualizadoEm: string;
  }[];
  totais: { quantidade: string; reservado: string; disponivel: string; valorEstoque: string };
  situacao: string;
}

interface LinhaKardex {
  movimentacaoId: string;
  numero: number;
  tipo: TipoMovimentacao;
  motivo: MotivoMovimentacao;
  dataMovimentacao: string;
  usuarioNome: string | null;
  localOrigem: string | null;
  localDestino: string | null;
  variacao: string;
  custoUnitario: string;
  saldoAcumulado: string;
}

function EnviarImagem({ produtoId, aoEnviar }: { produtoId: string; aoEnviar: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [alt, setAlt] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<{ arquivo?: string; alt?: string }>({});
  return (
    <>
      <Botao
        variante="secundario"
        tamanho="sm"
        icone={<ImagePlus className="h-4 w-4" aria-hidden />}
        onClick={() => setAberto(true)}
      >
        Adicionar imagem
      </Botao>
      <Dialogo
        aberto={aberto}
        aoMudar={setAberto}
        titulo="Adicionar imagem"
        descricao="JPEG, PNG ou WEBP de até 5 MB."
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const novos = {
              arquivo: arquivo ? undefined : 'Selecione um arquivo.',
              alt:
                alt.trim().length >= 3
                  ? undefined
                  : 'Descreva a imagem (texto alternativo para leitores de tela).',
            };
            setErros(novos);
            if (novos.arquivo || novos.alt) return;
            const dados = new FormData();
            dados.append('arquivo', arquivo!);
            dados.append('textoAlternativo', alt.trim());
            setEnviando(true);
            try {
              await api(`/produtos/${produtoId}/imagens`, { metodo: 'POST', corpo: dados });
              toast.success('Imagem adicionada.');
              setAberto(false);
              setArquivo(null);
              setAlt('');
              aoEnviar();
            } catch (erro) {
              tratarErro(erro);
            } finally {
              setEnviando(false);
            }
          }}
        >
          <Campo rotulo="Arquivo" erro={erros.arquivo} obrigatorio>
            <Entrada
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="pt-2"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
          </Campo>
          <Campo
            rotulo="Texto alternativo"
            erro={erros.alt}
            obrigatorio
            dica="Ex.: Saco de 20 kg de semente de milho, vista frontal"
          >
            <Entrada value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={200} />
          </Campo>
          <div className="flex justify-end gap-2">
            <Botao variante="secundario" onClick={() => setAberto(false)}>
              Cancelar
            </Botao>
            <Botao type="submit" carregando={enviando}>
              Enviar
            </Botao>
          </div>
        </form>
      </Dialogo>
    </>
  );
}

export default function DetalheProduto() {
  const { id } = useParams<{ id: string }>();
  const { tem } = useAuth();
  const qc = useQueryClient();
  const { data: p, error, isLoading, refetch } = useConsulta<ProdutoDetalhe>(`/produtos/${id}`);
  const kardex = useConsulta<LinhaKardex[]>(tem('estoque:ler') ? `/produtos/${id}/kardex` : null);
  const [removendo, setRemovendo] = useState<string | null>(null);

  if (isLoading) return <Carregando />;
  if (error || !p) return <ErroCarregamento erro={error} tentarNovamente={refetch} />;
  const un = p.unidadeMedida.sigla;

  return (
    <>
      <CabecalhoPagina
        titulo={p.nome}
        descricao={`SKU ${p.sku} · Código interno ${p.codigoInterno}${p.codigoBarras ? ` · Código de barras ${p.codigoBarras}` : ''}`}
        acoes={
          <>
            {tem('entradas:registrar') && (
              <BotaoLink variante="secundario" href={`/entradas/nova?produtoId=${p.id}`}>
                Registrar entrada
              </BotaoLink>
            )}
            {tem('saidas:registrar') && (
              <BotaoLink variante="secundario" href={`/saidas/nova?produtoId=${p.id}`}>
                Registrar saída
              </BotaoLink>
            )}
            {tem('produtos:escrever') && (
              <BotaoLink
                href={`/produtos/${p.id}/editar`}
                icone={<Pencil className="h-4 w-4" aria-hidden />}
              >
                Editar
              </BotaoLink>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          rotulo="Saldo físico"
          valor={`${formatarQuantidade(p.totais.quantidade)} ${un}`}
        />
        <Indicador rotulo="Reservado" valor={`${formatarQuantidade(p.totais.reservado)} ${un}`} />
        <Indicador
          rotulo="Disponível"
          valor={`${formatarQuantidade(p.totais.disponivel)} ${un}`}
          detalhe={<EtiquetaSituacao situacao={p.situacao} />}
        />
        <Indicador
          rotulo="Valor em estoque"
          valor={formatarMoeda(p.totais.valorEstoque)}
          detalhe={`Custo médio ${formatarMoeda(p.custoMedio)}`}
        />
      </div>

      <Abas
        rotulo="Informações do produto"
        abas={[
          {
            valor: 'dados',
            titulo: 'Dados',
            conteudo: (
              <Cartao>
                <ListaDados
                  itens={[
                    [
                      'Status',
                      <Etiqueta key="s" cor={p.status === 'ATIVO' ? 'verde' : 'cinza'}>
                        {p.status === 'ATIVO' ? 'Ativo' : 'Inativo'}
                      </Etiqueta>,
                    ],
                    ['Categoria', p.categoria?.nome],
                    ['Unidade de medida', `${p.unidadeMedida.sigla} — ${p.unidadeMedida.nome}`],
                    [
                      'Localização padrão',
                      p.localPadrao ? `${p.localPadrao.codigo} — ${p.localPadrao.nome}` : null,
                    ],
                    ['Preço de custo', formatarMoeda(p.precoCusto)],
                    ['Preço de venda', formatarMoeda(p.precoVenda)],
                    ['Estoque mínimo', `${formatarQuantidade(p.estoqueMinimo)} ${un}`],
                    [
                      'Estoque máximo',
                      p.estoqueMaximo ? `${formatarQuantidade(p.estoqueMaximo)} ${un}` : null,
                    ],
                    ['Atualizado em', formatarDataHora(p.atualizadoEm)],
                    ['Descrição', p.descricao],
                  ]}
                />
              </Cartao>
            ),
          },
          {
            valor: 'saldos',
            titulo: 'Saldo por local',
            conteudo: (
              <Tabela
                legenda="Saldo por local de armazenamento"
                dados={p.saldos}
                chave={(s) => s.local.id}
                textoVazio="Produto sem saldo em nenhum local."
                colunas={[
                  { titulo: 'Local', celula: (s) => `${s.local.codigo} — ${s.local.nome}` },
                  {
                    titulo: 'Saldo',
                    alinhamento: 'direita',
                    celula: (s) => formatarQuantidade(s.quantidade),
                  },
                  {
                    titulo: 'Reservado',
                    alinhamento: 'direita',
                    celula: (s) => formatarQuantidade(s.reservado),
                  },
                  {
                    titulo: 'Disponível',
                    alinhamento: 'direita',
                    celula: (s) => <strong>{formatarQuantidade(s.disponivel)}</strong>,
                  },
                  {
                    titulo: 'Atualizado em',
                    secundaria: true,
                    celula: (s) => formatarDataHora(s.atualizadoEm),
                  },
                ]}
              />
            ),
          },
          {
            valor: 'kardex',
            titulo: 'Histórico de movimentações',
            oculta: !tem('estoque:ler'),
            conteudo: (
              <Tabela
                legenda="Histórico de movimentações do produto"
                dados={kardex.data}
                carregando={kardex.isLoading}
                erro={kardex.error}
                chave={(k) => `${k.movimentacaoId}-${k.localOrigem}-${k.localDestino}`}
                textoVazio="Nenhuma movimentação registrada."
                colunas={[
                  { titulo: 'Data', celula: (k) => formatarDataHora(k.dataMovimentacao) },
                  {
                    titulo: 'Nº',
                    celula: (k) => (
                      <Link
                        className="text-marca-800 underline"
                        href={`/movimentacoes/${k.movimentacaoId}`}
                      >
                        {k.numero}
                      </Link>
                    ),
                  },
                  { titulo: 'Tipo', celula: (k) => <EtiquetaTipo tipo={k.tipo} /> },
                  { titulo: 'Motivo', secundaria: true, celula: (k) => ROTULOS_MOTIVO[k.motivo] },
                  {
                    titulo: 'Origem → destino',
                    secundaria: true,
                    celula: (k) => `${k.localOrigem ?? '—'} → ${k.localDestino ?? '—'}`,
                  },
                  {
                    titulo: 'Variação',
                    alinhamento: 'direita',
                    celula: (k) => (
                      <span
                        className={
                          Number(k.variacao) < 0
                            ? 'text-red-800'
                            : Number(k.variacao) > 0
                              ? 'text-green-800'
                              : ''
                        }
                      >
                        {Number(k.variacao) > 0 ? '+' : ''}
                        {formatarQuantidade(k.variacao)}
                      </span>
                    ),
                  },
                  {
                    titulo: 'Saldo',
                    alinhamento: 'direita',
                    celula: (k) => formatarQuantidade(k.saldoAcumulado),
                  },
                  {
                    titulo: 'Responsável',
                    secundaria: true,
                    celula: (k) => k.usuarioNome ?? 'Integração',
                  },
                ]}
              />
            ),
          },
          {
            valor: 'fornecedores',
            titulo: 'Fornecedores',
            conteudo: (
              <Tabela
                legenda="Fornecedores do produto"
                dados={p.fornecedores}
                chave={(f) => f.fornecedor.id}
                textoVazio="Nenhum fornecedor vinculado."
                colunas={[
                  {
                    titulo: 'Fornecedor',
                    celula: (f) => (
                      <Link
                        className="text-marca-800 underline"
                        href={`/fornecedores/${f.fornecedor.id}`}
                      >
                        {f.fornecedor.razaoSocial}
                      </Link>
                    ),
                  },
                  {
                    titulo: 'Principal',
                    celula: (f) => (f.principal ? <Etiqueta cor="verde">Principal</Etiqueta> : '—'),
                  },
                  { titulo: 'Código no fornecedor', celula: (f) => f.codigoNoFornecedor ?? '—' },
                  {
                    titulo: 'Prazo (dias)',
                    alinhamento: 'direita',
                    celula: (f) => f.prazoEntregaDias ?? '—',
                  },
                  {
                    titulo: 'Último preço',
                    alinhamento: 'direita',
                    celula: (f) => (f.ultimoPrecoCompra ? formatarMoeda(f.ultimoPrecoCompra) : '—'),
                  },
                ]}
              />
            ),
          },
          {
            valor: 'imagens',
            titulo: `Imagens (${p.imagens.length})`,
            conteudo: (
              <Cartao
                acoes={
                  tem('produtos:escrever') && (
                    <EnviarImagem produtoId={p.id} aoEnviar={() => refetch()} />
                  )
                }
                titulo="Imagens do produto"
              >
                {p.imagens.length === 0 ? (
                  <p className="text-sm text-suave">Nenhuma imagem cadastrada.</p>
                ) : (
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {p.imagens.map((img) => (
                      <li key={img.id} className="overflow-hidden rounded-md border border-borda">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.url}
                          alt={img.textoAlternativo}
                          className="aspect-square w-full object-cover"
                        />
                        <div className="flex items-center justify-between gap-1 p-2 text-xs">
                          <span className="truncate" title={img.textoAlternativo}>
                            {img.textoAlternativo}
                          </span>
                          {tem('produtos:escrever') && (
                            <button
                              type="button"
                              className="rounded p-1 text-red-800 hover:bg-red-50"
                              aria-label={`Remover imagem: ${img.textoAlternativo}`}
                              onClick={() => setRemovendo(img.id)}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Cartao>
            ),
          },
        ]}
      />
      <Confirmacao
        aberto={!!removendo}
        aoMudar={(a) => !a && setRemovendo(null)}
        titulo="Remover imagem"
        mensagem="A imagem será removida definitivamente."
        rotuloConfirmar="Remover"
        perigo
        aoConfirmar={async () => {
          try {
            await api(`/produtos/${p.id}/imagens/${removendo}`, { metodo: 'DELETE' });
            toast.success('Imagem removida.');
            await qc.invalidateQueries({ queryKey: [`/produtos/${p.id}`] });
          } catch (e) {
            tratarErro(e);
          }
        }}
      />
    </>
  );
}
