'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatarDataHora, formatarMoeda, formatarQuantidade } from '@estoque/shared';
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
import { Tabela } from '@/components/ui/tabela';
import { api, novaChaveIdempotencia } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useConsulta } from '@/lib/hooks';
import { tratarErro } from '@/lib/utils';

interface Ajuste {
  id: string;
  numero: string;
  origem: string;
  status: string;
  justificativa: string;
  solicitadoEm: string;
  decididoEm: string | null;
  motivoRejeicao: string | null;
  impactoFinanceiro: string;
  solicitadoPor: { id: string; nome: string };
  decididoPor: { nome: string } | null;
  inventario: { id: string; numero: string; descricao: string } | null;
  movimentacao: { id: string; numero: string } | null;
  itens: {
    id: string;
    quantidadeDelta: string;
    quantidadeSistema: string | null;
    quantidadeContada: string | null;
    produto: {
      id: string;
      sku: string;
      nome: string;
      custoMedio: string;
      unidadeMedida: { sigla: string };
    };
    local: { codigo: string };
  }[];
}

export default function DetalheAjuste() {
  const { id } = useParams<{ id: string }>();
  const { tem, usuario } = useAuth();
  const qc = useQueryClient();
  const { data: a, error, isLoading, refetch } = useConsulta<Ajuste>(`/ajustes/${id}`);
  const [acao, setAcao] = useState<'aprovar' | 'rejeitar' | null>(null);
  if (isLoading) return <Carregando />;
  if (error || !a) return <ErroCarregamento erro={error} tentarNovamente={refetch} />;
  const pendente = a.status === 'PENDENTE';
  const proprio = a.solicitadoPor.id === usuario?.id;
  const podeDecidir = pendente && tem('ajustes:aprovar') && !proprio;

  return (
    <>
      <CabecalhoPagina
        titulo={`Ajuste nº ${a.numero}`}
        descricao={
          a.inventario
            ? `Originado do inventário nº ${a.inventario.numero} — ${a.inventario.descricao}`
            : 'Ajuste manual'
        }
        acoes={
          podeDecidir && (
            <>
              <Botao
                icone={<CheckCircle2 className="h-4 w-4" aria-hidden />}
                onClick={() => setAcao('aprovar')}
              >
                Aprovar e aplicar
              </Botao>
              <Botao
                variante="secundario"
                icone={<XCircle className="h-4 w-4" aria-hidden />}
                onClick={() => setAcao('rejeitar')}
              >
                Rejeitar
              </Botao>
            </>
          )
        }
      />
      {pendente && proprio && tem('ajustes:aprovar') && (
        <p role="status" className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Segregação de funções: este ajuste foi solicitado por você e deve ser aprovado por outro
          usuário.
        </p>
      )}
      <Cartao className="mb-4">
        <ListaDados
          itens={[
            ['Status', <EtiquetaStatus key="s" status={a.status} />],
            ['Solicitado por', `${a.solicitadoPor.nome} em ${formatarDataHora(a.solicitadoEm)}`],
            [
              'Decidido por',
              a.decididoPor ? `${a.decididoPor.nome} em ${formatarDataHora(a.decididoEm)}` : null,
            ],
            [
              'Impacto financeiro',
              <span
                key="i"
                className={Number(a.impactoFinanceiro) < 0 ? 'text-red-800' : 'text-green-800'}
              >
                {formatarMoeda(a.impactoFinanceiro)}
              </span>,
            ],
            [
              'Movimentação gerada',
              a.movimentacao ? (
                <Link key="m" className="underline" href={`/movimentacoes/${a.movimentacao.id}`}>
                  nº {a.movimentacao.numero}
                </Link>
              ) : null,
            ],
            ['Justificativa', a.justificativa],
            ...(a.motivoRejeicao
              ? ([['Motivo da rejeição', a.motivoRejeicao]] as [string, string][])
              : []),
          ]}
        />
      </Cartao>
      <Tabela
        legenda="Itens do ajuste"
        dados={a.itens}
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
          { titulo: 'Local', celula: (i) => i.local.codigo },
          {
            titulo: 'Sistema',
            alinhamento: 'direita',
            celula: (i) => formatarQuantidade(i.quantidadeSistema),
          },
          {
            titulo: 'Contado',
            alinhamento: 'direita',
            celula: (i) =>
              i.quantidadeContada !== null ? formatarQuantidade(i.quantidadeContada) : '—',
          },
          {
            titulo: 'Ajuste',
            alinhamento: 'direita',
            celula: (i) => (
              <Etiqueta cor={Number(i.quantidadeDelta) < 0 ? 'vermelho' : 'azul'}>
                {Number(i.quantidadeDelta) > 0 ? '+' : ''}
                {formatarQuantidade(i.quantidadeDelta)} {i.produto.unidadeMedida.sigla}
              </Etiqueta>
            ),
          },
          {
            titulo: 'Valor',
            alinhamento: 'direita',
            celula: (i) => formatarMoeda(Number(i.quantidadeDelta) * Number(i.produto.custoMedio)),
          },
        ]}
      />
      <Confirmacao
        aberto={acao === 'aprovar'}
        aoMudar={(x) => !x && setAcao(null)}
        titulo={`Aprovar ajuste nº ${a.numero}`}
        mensagem={`O saldo será ajustado (impacto de ${formatarMoeda(a.impactoFinanceiro)}). A operação gera movimentação imutável.`}
        rotuloConfirmar="Aprovar"
        aoConfirmar={async () => {
          try {
            await api(`/ajustes/${a.id}/aprovar`, {
              metodo: 'POST',
              idempotencia: novaChaveIdempotencia(),
            });
            toast.success('Ajuste aprovado e aplicado ao estoque.');
            await qc.invalidateQueries();
          } catch (e) {
            tratarErro(e);
            throw e;
          }
        }}
      />
      <Confirmacao
        aberto={acao === 'rejeitar'}
        aoMudar={(x) => !x && setAcao(null)}
        titulo={`Rejeitar ajuste nº ${a.numero}`}
        mensagem="O estoque não será alterado. O inventário poderá ser recontado."
        rotuloConfirmar="Rejeitar"
        rotuloJustificativa="Motivo da rejeição"
        perigo
        exigirJustificativa
        aoConfirmar={async (motivo) => {
          try {
            await api(`/ajustes/${a.id}/rejeitar`, { metodo: 'POST', corpo: { motivo } });
            toast.success('Ajuste rejeitado.');
            await qc.invalidateQueries();
          } catch (e) {
            tratarErro(e);
            throw e;
          }
        }}
      />
    </>
  );
}
