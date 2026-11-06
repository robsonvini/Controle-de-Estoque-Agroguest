'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AlertOctagon, AlertTriangle, CheckCheck, Info } from 'lucide-react';
import Link from 'next/link';
import {
  formatarDataHora,
  ROTULOS_TIPO_NOTIFICACAO,
  TIPOS_NOTIFICACAO,
  type TipoNotificacao,
} from '@estoque/shared';
import { FiltroSelecao } from '@/components/listagem';
import {
  CabecalhoPagina,
  Carregando,
  ErroCarregamento,
  Etiqueta,
  Vazio,
} from '@/components/ui/basicos';
import { Botao } from '@/components/ui/botao';
import { Paginacao } from '@/components/ui/tabela';
import { api } from '@/lib/api';
import { useFiltrosUrl, useListagem } from '@/lib/hooks';
import { cn, tratarErro } from '@/lib/utils';

interface Notificacao {
  id: string;
  tipo: TipoNotificacao;
  severidade: 'INFO' | 'ALERTA' | 'CRITICA';
  titulo: string;
  mensagem: string;
  link: string | null;
  resolvida: boolean;
  criadoEm: string;
  lida: boolean;
}

const ICONES = {
  INFO: { icone: Info, cor: 'text-blue-800', rotulo: 'Informativo' },
  ALERTA: { icone: AlertTriangle, cor: 'text-amber-800', rotulo: 'Alerta' },
  CRITICA: { icone: AlertOctagon, cor: 'text-red-800', rotulo: 'Crítico' },
};

export default function PaginaNotificacoes() {
  const qc = useQueryClient();
  const [f, definir] = useFiltrosUrl({ tipo: '', naoLidas: '' });
  const { data, isLoading, error, refetch } = useListagem<Notificacao>(
    '/notificacoes',
    { ...f, porPagina: 30 },
    { intervalo: 30_000 },
  );
  const marcar = async (caminho: string) => {
    try {
      await api(caminho, { metodo: 'POST' });
      await qc.invalidateQueries({ queryKey: ['/notificacoes'] });
      await qc.invalidateQueries({ queryKey: ['/notificacoes/contagem'] });
    } catch (e) {
      tratarErro(e);
    }
  };
  return (
    <>
      <CabecalhoPagina
        titulo="Notificações e alertas"
        descricao="Estoque mínimo, produtos esgotados, reposição, movimentações atípicas, divergências e falhas de integração"
        acoes={
          <Botao
            variante="secundario"
            icone={<CheckCheck className="h-4 w-4" aria-hidden />}
            onClick={() => void marcar('/notificacoes/lidas')}
          >
            Marcar todas como lidas
          </Botao>
        }
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <FiltroSelecao
          rotulo="Tipo"
          valor={f.tipo}
          aoMudar={(tipo) => definir({ tipo })}
          opcoes={TIPOS_NOTIFICACAO.map((t) => ({ valor: t, rotulo: ROTULOS_TIPO_NOTIFICACAO[t] }))}
        />
        <FiltroSelecao
          rotulo="Exibir"
          valor={f.naoLidas}
          aoMudar={(naoLidas) => definir({ naoLidas })}
          todos="Todas"
          opcoes={[{ valor: 'true', rotulo: 'Somente não lidas' }]}
        />
      </div>
      {isLoading ? (
        <Carregando />
      ) : error ? (
        <ErroCarregamento erro={error} tentarNovamente={refetch} />
      ) : !data?.dados.length ? (
        <Vazio texto="Nenhuma notificação." />
      ) : (
        <ul className="space-y-2">
          {data.dados.map((n) => {
            const { icone: Icone, cor, rotulo } = ICONES[n.severidade];
            return (
              <li
                key={n.id}
                className={cn(
                  'flex gap-3 rounded-lg border bg-white p-3',
                  n.lida ? 'border-borda' : 'border-marca-600 shadow-sm',
                )}
              >
                <Icone className={cn('mt-0.5 h-5 w-5 shrink-0', cor)} aria-label={rotulo} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{n.titulo}</p>
                    {!n.lida && <Etiqueta cor="azul">Nova</Etiqueta>}
                    {n.resolvida && <Etiqueta cor="verde">Resolvida</Etiqueta>}
                  </div>
                  <p className="text-sm">{n.mensagem}</p>
                  <p className="mt-1 text-xs text-suave">
                    {ROTULOS_TIPO_NOTIFICACAO[n.tipo]} · {formatarDataHora(n.criadoEm)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {n.link && (
                    <Link
                      href={n.link}
                      onClick={() => !n.lida && void marcar(`/notificacoes/${n.id}/lida`)}
                      className="text-sm font-medium text-marca-800 underline"
                    >
                      Abrir
                    </Link>
                  )}
                  {!n.lida && (
                    <button
                      type="button"
                      className="text-xs text-suave underline"
                      onClick={() => void marcar(`/notificacoes/${n.id}/lida`)}
                    >
                      Marcar como lida
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
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
