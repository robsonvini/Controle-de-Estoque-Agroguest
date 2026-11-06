'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  formatarData,
  formatarDataHora,
  formatarDocumento,
  formatarMoeda,
  ROTULOS_MOTIVO,
  type MotivoMovimentacao,
} from '@estoque/shared';
import { EtiquetaStatus } from '@/components/listagem';
import { Abas } from '@/components/ui/abas';
import { CabecalhoPagina, Carregando, ErroCarregamento, Indicador } from '@/components/ui/basicos';
import { Tabela } from '@/components/ui/tabela';
import { useAuth } from '@/lib/auth';
import { useConsulta } from '@/lib/hooks';
import { FormularioFornecedor, type FormFornecedor } from '../formulario-fornecedor';

interface Fornecedor extends Omit<FormFornecedor, 'contatos'> {
  id: string;
  contatos: { nome: string; cargo: string | null; email: string | null; telefone: string | null }[];
  produtos: {
    produto: { id: string; nome: string; sku: string; status: string };
    principal: boolean;
    ultimoPrecoCompra: string | null;
  }[];
}
interface Historico {
  pedidos: {
    id: string;
    numero: string;
    status: string;
    dataPedido: string;
    valorTotal: string;
    previsaoEntrega: string | null;
  }[];
  entradas: {
    numeroDocumento: string | null;
    movimentacao: {
      id: string;
      numero: string;
      motivo: MotivoMovimentacao;
      dataMovimentacao: string;
      valorTotal: string;
    };
  }[];
  totais: { valorRecebido: string; quantidadeEntradas: number };
}

export default function DetalheFornecedor() {
  const { id } = useParams<{ id: string }>();
  const { tem } = useAuth();
  const { data: f, error, isLoading } = useConsulta<Fornecedor>(`/fornecedores/${id}`);
  const historico = useConsulta<Historico>(`/fornecedores/${id}/compras`);
  if (isLoading) return <Carregando />;
  if (error || !f) return <ErroCarregamento erro={error} />;
  const { produtos, ...dados } = f;

  return (
    <>
      <CabecalhoPagina titulo={f.razaoSocial} descricao={formatarDocumento(f.documento)} />
      <Abas
        rotulo="Fornecedor"
        abas={[
          {
            valor: 'cadastro',
            titulo: 'Cadastro',
            conteudo: (
              <FormularioFornecedor
                id={id}
                somenteLeitura={!tem('fornecedores:escrever')}
                inicial={{
                  ...(Object.fromEntries(
                    Object.entries(dados).map(([k, v]) => [k, v ?? '']),
                  ) as Partial<FormFornecedor>),
                  contatos: f.contatos.map((c) => ({
                    nome: c.nome,
                    cargo: c.cargo ?? '',
                    email: c.email ?? '',
                    telefone: c.telefone ?? '',
                  })),
                }}
              />
            ),
          },
          {
            valor: 'produtos',
            titulo: `Produtos fornecidos (${produtos.length})`,
            conteudo: (
              <Tabela
                legenda="Produtos fornecidos"
                dados={produtos}
                chave={(p) => p.produto.id}
                textoVazio="Nenhum produto vinculado."
                colunas={[
                  {
                    titulo: 'Produto',
                    celula: (p) => (
                      <Link className="text-marca-800 underline" href={`/produtos/${p.produto.id}`}>
                        {p.produto.sku} — {p.produto.nome}
                      </Link>
                    ),
                  },
                  { titulo: 'Principal', celula: (p) => (p.principal ? 'Sim' : 'Não') },
                  {
                    titulo: 'Último preço',
                    alinhamento: 'direita',
                    celula: (p) => (p.ultimoPrecoCompra ? formatarMoeda(p.ultimoPrecoCompra) : '—'),
                  },
                  { titulo: 'Status', celula: (p) => <EtiquetaStatus status={p.produto.status} /> },
                ]}
              />
            ),
          },
          {
            valor: 'compras',
            titulo: 'Histórico de compras',
            conteudo: (
              <div className="space-y-4">
                {historico.data && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Indicador
                      rotulo="Valor recebido (entradas)"
                      valor={formatarMoeda(historico.data.totais.valorRecebido)}
                    />
                    <Indicador
                      rotulo="Entradas registradas"
                      valor={historico.data.totais.quantidadeEntradas}
                    />
                  </div>
                )}
                <h2 className="text-lg font-semibold">Pedidos de compra</h2>
                <Tabela
                  legenda="Pedidos de compra do fornecedor"
                  dados={historico.data?.pedidos}
                  carregando={historico.isLoading}
                  chave={(p) => p.id}
                  textoVazio="Nenhum pedido de compra."
                  colunas={[
                    {
                      titulo: 'Pedido',
                      celula: (p) => (
                        <Link className="underline" href={`/compras/${p.id}`}>
                          nº {p.numero}
                        </Link>
                      ),
                    },
                    { titulo: 'Data', celula: (p) => formatarData(p.dataPedido) },
                    { titulo: 'Status', celula: (p) => <EtiquetaStatus status={p.status} /> },
                    {
                      titulo: 'Valor',
                      alinhamento: 'direita',
                      celula: (p) => formatarMoeda(p.valorTotal),
                    },
                  ]}
                />
                <h2 className="text-lg font-semibold">Entradas</h2>
                <Tabela
                  legenda="Entradas do fornecedor"
                  dados={historico.data?.entradas}
                  carregando={historico.isLoading}
                  chave={(e) => e.movimentacao.id}
                  textoVazio="Nenhuma entrada registrada."
                  colunas={[
                    {
                      titulo: 'Movimentação',
                      celula: (e) => (
                        <Link className="underline" href={`/movimentacoes/${e.movimentacao.id}`}>
                          nº {e.movimentacao.numero}
                        </Link>
                      ),
                    },
                    {
                      titulo: 'Data',
                      celula: (e) => formatarDataHora(e.movimentacao.dataMovimentacao),
                    },
                    { titulo: 'Motivo', celula: (e) => ROTULOS_MOTIVO[e.movimentacao.motivo] },
                    { titulo: 'Nota fiscal', celula: (e) => e.numeroDocumento ?? '—' },
                    {
                      titulo: 'Valor',
                      alinhamento: 'direita',
                      celula: (e) => formatarMoeda(e.movimentacao.valorTotal),
                    },
                  ]}
                />
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
