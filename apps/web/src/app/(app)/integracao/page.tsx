'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, PlugZap, RefreshCw, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  clienteApiSchema,
  configuracaoIntegracaoSchema,
  ESCOPOS_INTEGRACAO,
  formatarDataHora,
  type EscopoIntegracao,
} from '@estoque/shared';
import { EtiquetaStatus, FiltroSelecao } from '@/components/listagem';
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
import { Botao } from '@/components/ui/botao';
import { Caixa, Campo, Entrada } from '@/components/ui/campos';
import { Confirmacao, Dialogo } from '@/components/ui/dialogo';
import { Paginacao, Tabela } from '@/components/ui/tabela';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useConsulta, useListagem } from '@/lib/hooks';
import { tratarErro } from '@/lib/utils';

interface Painel {
  configuracao: {
    ativo: boolean;
    nome: string;
    baseUrl: string;
    authHeaderNome: string | null;
    authHeaderDefinido: boolean;
    timeoutMs: number;
    intervaloSyncMinutos: number;
    webhookSaidaAtivo: boolean;
    webhookSaidaUrl: string | null;
    webhookSaidaSegredoDefinido: boolean;
    webhookEntradaSegredoDefinido: boolean;
  };
  status: {
    falhasConsecutivas: number;
    ultimaSincronizacaoEm: string | null;
    ultimoSucessoEm: string | null;
    ultimoErro: string | null;
    clientesSincronizados: number;
    clientesRemovidosNoCrm: number;
    eventosPendentes: number;
    falhasUltimas24h: number;
    tarefasComFalha: number;
    ultimaExecucao: {
      status: string;
      criados: number;
      atualizados: number;
      removidos: number;
      invalidos: number;
    } | null;
  };
  endpoints: {
    crmUtilizados: string[];
    webhookEntrada: string;
    apiIntegracao: string;
    documentacao: string;
  };
}

function SegredoExibido({
  valor,
  aoFechar,
}: {
  valor: { titulo: string; linhas: [string, string][] } | null;
  aoFechar: () => void;
}) {
  return (
    <Dialogo
      aberto={!!valor}
      aoMudar={(a) => !a && aoFechar()}
      titulo={valor?.titulo ?? ''}
      descricao="Copie agora: por segurança, este valor não será exibido novamente."
    >
      <dl className="space-y-3">
        {valor?.linhas.map(([rotulo, v]) => (
          <div key={rotulo}>
            <dt className="text-xs font-medium text-suave uppercase">{rotulo}</dt>
            <dd className="mt-1 flex items-center gap-2">
              <code className="flex-1 rounded bg-gray-100 px-2 py-1.5 text-xs break-all">{v}</code>
              <Botao
                variante="secundario"
                tamanho="icone"
                aria-label={`Copiar ${rotulo}`}
                onClick={() =>
                  void navigator.clipboard.writeText(v).then(() => toast.success('Copiado.'))
                }
              >
                <Copy className="h-4 w-4" aria-hidden />
              </Botao>
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex justify-end">
        <Botao onClick={aoFechar}>Concluído</Botao>
      </div>
    </Dialogo>
  );
}

function VisaoGeral({ painel, atualizar }: { painel: Painel; atualizar: () => void }) {
  const { tem } = useAuth();
  const gerenciar = tem('integracao:gerenciar');
  const [executando, setExecutando] = useState<string | null>(null);
  const [segredo, setSegredo] = useState<{ titulo: string; linhas: [string, string][] } | null>(
    null,
  );
  const c = painel.configuracao;
  const form = useForm<
    z.input<typeof configuracaoIntegracaoSchema>,
    unknown,
    z.output<typeof configuracaoIntegracaoSchema>
  >({
    resolver: zodResolver(configuracaoIntegracaoSchema),
    defaultValues: {
      ativo: c.ativo,
      baseUrl: c.baseUrl,
      authHeaderNome: c.authHeaderNome ?? '',
      authHeaderValor: '',
      timeoutMs: c.timeoutMs,
      intervaloSyncMinutos: c.intervaloSyncMinutos,
      webhookSaidaAtivo: c.webhookSaidaAtivo,
      webhookSaidaUrl: c.webhookSaidaUrl ?? '',
    },
  });
  const e = form.formState.errors;

  const acao = async (nome: string, fn: () => Promise<void>) => {
    setExecutando(nome);
    try {
      await fn();
      atualizar();
    } catch (er) {
      tratarErro(er);
    } finally {
      setExecutando(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          rotulo="Situação"
          valor={
            !c.ativo ? 'Desativada' : painel.status.falhasConsecutivas ? 'Com falhas' : 'Operando'
          }
          tom={!c.ativo ? 'neutro' : painel.status.falhasConsecutivas ? 'critico' : 'positivo'}
          icone={<PlugZap className="h-5 w-5" />}
        />
        <Indicador
          rotulo="Clientes sincronizados"
          valor={painel.status.clientesSincronizados}
          detalhe={`${painel.status.clientesRemovidosNoCrm} removido(s) no CRM`}
        />
        <Indicador
          rotulo="Falhas nas últimas 24 h"
          valor={painel.status.falhasUltimas24h}
          tom={painel.status.falhasUltimas24h ? 'alerta' : 'neutro'}
        />
        <Indicador
          rotulo="Eventos pendentes / tarefas com falha"
          valor={`${painel.status.eventosPendentes} / ${painel.status.tarefasComFalha}`}
          tom={painel.status.tarefasComFalha ? 'alerta' : 'neutro'}
        />
      </div>

      <Cartao
        titulo="Sincronização de clientes"
        acoes={
          gerenciar && (
            <div className="flex gap-2">
              <Botao
                variante="secundario"
                tamanho="sm"
                carregando={executando === 'testar'}
                onClick={() =>
                  void acao('testar', async () => {
                    const r = await api<{
                      ok: boolean;
                      latenciaMs?: number;
                      clientes?: number;
                      erro?: string;
                    }>('/integracao/crm/testar', { metodo: 'POST' });
                    if (r.ok)
                      toast.success(
                        `Conexão OK: ${r.clientes} cliente(s) disponíveis em ${r.latenciaMs} ms.`,
                      );
                    else toast.error(`Falha na conexão: ${r.erro}`);
                  })
                }
              >
                Testar conexão
              </Botao>
              <Botao
                tamanho="sm"
                icone={<RefreshCw className="h-4 w-4" aria-hidden />}
                carregando={executando === 'sync'}
                disabled={!c.ativo}
                onClick={() =>
                  void acao('sync', async () => {
                    const r = await api<{
                      criados: number;
                      atualizados: number;
                      removidos: number;
                      inalterados: number;
                    }>('/integracao/crm/sincronizar', { metodo: 'POST' });
                    toast.success(
                      `Sincronizado: ${r.criados} novo(s), ${r.atualizados} atualizado(s), ${r.removidos} removido(s), ${r.inalterados} sem alteração.`,
                    );
                  })
                }
              >
                Sincronizar agora
              </Botao>
            </div>
          )
        }
      >
        <ListaDados
          itens={[
            ['Última sincronização', formatarDataHora(painel.status.ultimaSincronizacaoEm)],
            ['Último sucesso', formatarDataHora(painel.status.ultimoSucessoEm)],
            ['Falhas consecutivas', String(painel.status.falhasConsecutivas)],
            [
              'Último resultado',
              painel.status.ultimaExecucao ? (
                <EtiquetaStatus key="r" status={painel.status.ultimaExecucao.status} />
              ) : null,
            ],
            ['Último erro', painel.status.ultimoErro],
            ['Endpoints do CRM utilizados', painel.endpoints.crmUtilizados.join(' · ')],
          ]}
        />
      </Cartao>

      <Cartao titulo="Configuração">
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit(async (dados) => {
            try {
              await api('/integracao/crm', { metodo: 'PUT', corpo: dados });
              toast.success('Configuração salva.');
              form.setValue('authHeaderValor', '');
              atualizar();
            } catch (er) {
              tratarErro(er, form.setError);
            }
          })}
        >
          <fieldset disabled={!gerenciar} className="space-y-4">
            <Caixa
              rotulo="Integração ativa (sincronização automática e recebimento de webhooks)"
              {...form.register('ativo')}
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <Campo
                rotulo="URL base da API do CRM"
                erro={e.baseUrl?.message}
                obrigatorio
                className="md:col-span-2"
                dica="Ex.: https://crm.agrogest.com.br"
              >
                <Entrada type="url" {...form.register('baseUrl')} />
              </Campo>
              <Campo rotulo="Tempo limite (ms)" erro={e.timeoutMs?.message}>
                <Entrada type="number" min="1000" max="60000" {...form.register('timeoutMs')} />
              </Campo>
              <Campo
                rotulo="Intervalo de sincronização (min)"
                erro={e.intervaloSyncMinutos?.message}
              >
                <Entrada
                  type="number"
                  min="5"
                  max="1440"
                  {...form.register('intervaloSyncMinutos')}
                />
              </Campo>
              <Campo
                rotulo="Cabeçalho de autenticação"
                erro={e.authHeaderNome?.message}
                dica="Opcional; o CRM atual não exige (ex.: Authorization)"
              >
                <Entrada {...form.register('authHeaderNome')} />
              </Campo>
              <Campo
                rotulo="Valor do cabeçalho"
                erro={e.authHeaderValor?.message}
                className="md:col-span-3"
                dica={
                  c.authHeaderDefinido
                    ? 'Já definido (cifrado). Deixe em branco para manter.'
                    : 'Armazenado cifrado (AES-256-GCM).'
                }
              >
                <Entrada type="password" autoComplete="off" {...form.register('authHeaderValor')} />
              </Campo>
            </div>
            <div className="rounded-md border border-gray-200 p-3">
              <p className="mb-2 text-sm font-medium">
                Webhooks enviados ao CRM (estoque.saldo_atualizado)
              </p>
              <p className="mb-3 text-xs text-suave">
                O CRM Agrogest ainda não possui receptor de webhooks; ative quando houver um
                endpoint disponível.
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[auto_1fr] md:items-end">
                <Caixa rotulo="Enviar webhooks" {...form.register('webhookSaidaAtivo')} />
                <Campo rotulo="URL de destino" erro={e.webhookSaidaUrl?.message}>
                  <Entrada type="url" {...form.register('webhookSaidaUrl')} />
                </Campo>
              </div>
            </div>
            {gerenciar && (
              <div className="flex justify-end">
                <Botao type="submit" carregando={form.formState.isSubmitting}>
                  Salvar configuração
                </Botao>
              </div>
            )}
          </fieldset>
        </form>
      </Cartao>

      <Cartao titulo="Webhooks e API de integração">
        <ListaDados
          itens={[
            [
              'URL de webhook (entrada)',
              <code key="w" className="text-xs">
                {painel.endpoints.webhookEntrada}
              </code>,
            ],
            [
              'Segredo de entrada (HMAC)',
              c.webhookEntradaSegredoDefinido ? (
                <Etiqueta key="se" cor="verde">
                  Configurado
                </Etiqueta>
              ) : (
                <Etiqueta key="se" cor="amarelo">
                  Não configurado
                </Etiqueta>
              ),
            ],
            [
              'Segredo de saída (HMAC)',
              c.webhookSaidaSegredoDefinido ? (
                <Etiqueta key="ss" cor="verde">
                  Configurado
                </Etiqueta>
              ) : (
                <Etiqueta key="ss">Não configurado</Etiqueta>
              ),
            ],
            [
              'API de integração',
              <code key="a" className="text-xs">
                {painel.endpoints.apiIntegracao}
              </code>,
            ],
            [
              'Documentação (OpenAPI)',
              <a
                key="d"
                className="underline"
                href={painel.endpoints.documentacao}
                target="_blank"
                rel="noreferrer"
              >
                {painel.endpoints.documentacao}
              </a>,
            ],
          ]}
        />
        {gerenciar && (
          <div className="mt-4 flex flex-wrap gap-2">
            {(['entrada', 'saida'] as const).map((tipo) => (
              <Botao
                key={tipo}
                variante="secundario"
                tamanho="sm"
                icone={<KeyRound className="h-4 w-4" aria-hidden />}
                carregando={executando === tipo}
                onClick={() =>
                  void acao(tipo, async () => {
                    const r = await api<{ segredo: string }>(`/integracao/crm/segredos/${tipo}`, {
                      metodo: 'POST',
                    });
                    setSegredo({
                      titulo: `Segredo de webhook (${tipo})`,
                      linhas: [['Segredo', r.segredo]],
                    });
                  })
                }
              >
                Gerar segredo de {tipo === 'entrada' ? 'entrada' : 'saída'}
              </Botao>
            ))}
          </div>
        )}
      </Cartao>
      <SegredoExibido valor={segredo} aoFechar={() => setSegredo(null)} />
    </div>
  );
}

function Execucoes() {
  const [pagina, setPagina] = useState(1);
  const { data, isLoading, error } = useListagem<{
    id: string;
    tipo: string;
    gatilho: string;
    status: string;
    iniciadoEm: string;
    finalizadoEm: string | null;
    totalRecebidos: number;
    criados: number;
    atualizados: number;
    removidos: number;
    invalidos: number;
    erro: string | null;
  }>('/integracao/execucoes', { pagina, porPagina: 20 }, { intervalo: 30_000 });
  return (
    <>
      <Tabela
        legenda="Execuções de sincronização"
        dados={data?.dados}
        carregando={isLoading}
        erro={error}
        chave={(x) => x.id}
        colunas={[
          { titulo: 'Início', celula: (x) => formatarDataHora(x.iniciadoEm) },
          { titulo: 'Gatilho', celula: (x) => (x.gatilho === 'MANUAL' ? 'Manual' : 'Agendado') },
          { titulo: 'Status', celula: (x) => <EtiquetaStatus status={x.status} /> },
          { titulo: 'Recebidos', alinhamento: 'direita', celula: (x) => x.totalRecebidos },
          {
            titulo: 'Novos / atualizados / removidos',
            alinhamento: 'direita',
            celula: (x) => `${x.criados} / ${x.atualizados} / ${x.removidos}`,
          },
          {
            titulo: 'Inválidos',
            alinhamento: 'direita',
            secundaria: true,
            celula: (x) => x.invalidos,
          },
          {
            titulo: 'Erro',
            secundaria: true,
            celula: (x) => <span className="text-red-800">{x.erro ?? ''}</span>,
          },
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

function Logs() {
  const [filtro, setFiltro] = useState({ sucesso: '', direcao: '', pagina: 1 });
  const { data, isLoading, error } = useListagem<{
    id: string;
    direcao: string;
    operacao: string;
    metodo: string | null;
    url: string | null;
    statusHttp: number | null;
    duracaoMs: number | null;
    tentativa: number;
    sucesso: boolean;
    erro: string | null;
    criadoEm: string;
  }>('/integracao/logs', { ...filtro, porPagina: 30 });
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-3">
        <FiltroSelecao
          rotulo="Resultado"
          valor={filtro.sucesso}
          aoMudar={(sucesso) => setFiltro({ ...filtro, sucesso, pagina: 1 })}
          opcoes={[
            { valor: 'true', rotulo: 'Sucesso' },
            { valor: 'false', rotulo: 'Falha' },
          ]}
        />
        <FiltroSelecao
          rotulo="Direção"
          valor={filtro.direcao}
          aoMudar={(direcao) => setFiltro({ ...filtro, direcao, pagina: 1 })}
          todos="Todas"
          opcoes={[
            { valor: 'SAIDA', rotulo: 'Estoque → CRM' },
            { valor: 'ENTRADA', rotulo: 'CRM → Estoque' },
          ]}
        />
      </div>
      <Tabela
        legenda="Logs de integração"
        dados={data?.dados}
        carregando={isLoading}
        erro={error}
        chave={(l) => l.id}
        colunas={[
          { titulo: 'Data/hora', celula: (l) => formatarDataHora(l.criadoEm) },
          {
            titulo: 'Direção',
            celula: (l) => (l.direcao === 'SAIDA' ? 'Estoque → CRM' : 'CRM → Estoque'),
          },
          {
            titulo: 'Operação',
            celula: (l) => (
              <code className="text-xs">
                {l.metodo} {l.url ?? l.operacao}
              </code>
            ),
          },
          { titulo: 'HTTP', alinhamento: 'direita', celula: (l) => l.statusHttp ?? '—' },
          {
            titulo: 'Tentativa',
            alinhamento: 'direita',
            secundaria: true,
            celula: (l) => l.tentativa,
          },
          {
            titulo: 'Duração',
            alinhamento: 'direita',
            secundaria: true,
            celula: (l) => (l.duracaoMs !== null ? `${l.duracaoMs} ms` : '—'),
          },
          {
            titulo: 'Resultado',
            celula: (l) =>
              l.sucesso ? (
                <Etiqueta cor="verde">Sucesso</Etiqueta>
              ) : (
                <Etiqueta cor="vermelho">Falha</Etiqueta>
              ),
          },
          {
            titulo: 'Erro',
            secundaria: true,
            celula: (l) => <span className="text-xs text-red-800">{l.erro ?? ''}</span>,
          },
        ]}
      />
      {data && (
        <Paginacao
          pagina={data.pagina}
          totalPaginas={data.totalPaginas}
          total={data.total}
          aoMudar={(pagina) => setFiltro({ ...filtro, pagina })}
        />
      )}
    </>
  );
}

function Eventos() {
  const { tem } = useAuth();
  const qc = useQueryClient();
  const [pagina, setPagina] = useState(1);
  const { data, isLoading, error } = useListagem<{
    id: string;
    eventoId: string;
    tipo: string;
    status: string;
    tentativas: number;
    erro: string | null;
    recebidoEm: string;
    processadoEm: string | null;
  }>('/integracao/eventos', { pagina, porPagina: 20 });
  return (
    <>
      <Tabela
        legenda="Eventos recebidos por webhook"
        dados={data?.dados}
        carregando={isLoading}
        erro={error}
        chave={(e) => e.id}
        textoVazio="Nenhum evento recebido."
        colunas={[
          { titulo: 'Recebido em', celula: (e) => formatarDataHora(e.recebidoEm) },
          { titulo: 'Evento', celula: (e) => <code className="text-xs">{e.tipo}</code> },
          {
            titulo: 'ID',
            secundaria: true,
            celula: (e) => <code className="text-xs">{e.eventoId}</code>,
          },
          {
            titulo: 'Status',
            celula: (e) => (
              <EtiquetaStatus status={e.status === 'RECEBIDO' ? 'PENDENTE' : e.status} />
            ),
          },
          {
            titulo: 'Tentativas',
            alinhamento: 'direita',
            secundaria: true,
            celula: (e) => e.tentativas,
          },
          {
            titulo: 'Erro',
            secundaria: true,
            celula: (e) => <span className="text-xs text-red-800">{e.erro ?? ''}</span>,
          },
          {
            titulo: 'Ações',
            alinhamento: 'direita',
            celula: (e) =>
              tem('integracao:gerenciar') &&
              ['ERRO', 'RECEBIDO'].includes(e.status) && (
                <Botao
                  variante="fantasma"
                  tamanho="sm"
                  icone={<RotateCw className="h-4 w-4" aria-hidden />}
                  onClick={async () => {
                    try {
                      await api(`/integracao/eventos/${e.id}/reprocessar`, { metodo: 'POST' });
                      toast.success('Evento reenfileirado para processamento.');
                      await qc.invalidateQueries({ queryKey: ['/integracao/eventos'] });
                    } catch (er) {
                      tratarErro(er);
                    }
                  }}
                >
                  Reprocessar
                </Botao>
              ),
          },
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

function ClientesApi() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useConsulta<
    {
      id: string;
      nome: string;
      clientId: string;
      escopos: string[];
      ativo: boolean;
      criadoEm: string;
      ultimoUsoEm: string | null;
      revogadoEm: string | null;
      criadoPor: { nome: string };
    }[]
  >('/integracao/clientes-api');
  const [novo, setNovo] = useState(false);
  const [revogando, setRevogando] = useState<string | null>(null);
  const [segredo, setSegredo] = useState<{ titulo: string; linhas: [string, string][] } | null>(
    null,
  );
  const form = useForm<
    z.input<typeof clienteApiSchema>,
    unknown,
    z.output<typeof clienteApiSchema>
  >({
    resolver: zodResolver(clienteApiSchema),
    defaultValues: { nome: 'CRM Agrogest', escopos: ['estoque:consultar', 'pedidos:gerenciar'] },
  });
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Botao icone={<KeyRound className="h-4 w-4" aria-hidden />} onClick={() => setNovo(true)}>
          Novo cliente de API
        </Botao>
      </div>
      <Tabela
        legenda="Clientes da API de integração"
        dados={data}
        carregando={isLoading}
        erro={error}
        chave={(c) => c.id}
        textoVazio="Nenhum cliente de API. Crie um para o CRM consumir a API de integração."
        colunas={[
          { titulo: 'Nome', celula: (c) => c.nome },
          { titulo: 'client_id', celula: (c) => <code className="text-xs">{c.clientId}</code> },
          {
            titulo: 'Escopos',
            celula: (c) => (
              <span className="flex flex-wrap gap-1">
                {c.escopos.map((e) => (
                  <Etiqueta key={e}>{e}</Etiqueta>
                ))}
              </span>
            ),
          },
          {
            titulo: 'Último uso',
            secundaria: true,
            celula: (c) => formatarDataHora(c.ultimoUsoEm) || '—',
          },
          {
            titulo: 'Situação',
            celula: (c) =>
              c.revogadoEm ? (
                <Etiqueta cor="vermelho">Revogado</Etiqueta>
              ) : (
                <Etiqueta cor="verde">Ativo</Etiqueta>
              ),
          },
          {
            titulo: 'Ações',
            alinhamento: 'direita',
            celula: (c) =>
              !c.revogadoEm &&
              c.clientId !== 'crm-agrogest-webhooks' && (
                <Botao variante="fantasma" tamanho="sm" onClick={() => setRevogando(c.id)}>
                  Revogar
                </Botao>
              ),
          },
        ]}
      />
      <Dialogo
        aberto={novo}
        aoMudar={setNovo}
        titulo="Novo cliente de API"
        descricao="Credenciais OAuth 2.0 (client credentials) para o CRM."
      >
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit(async (dados) => {
            try {
              const r = await api<{ clientId: string; clientSecret: string }>(
                '/integracao/clientes-api',
                { metodo: 'POST', corpo: dados },
              );
              setNovo(false);
              setSegredo({
                titulo: 'Credenciais criadas',
                linhas: [
                  ['client_id', r.clientId],
                  ['client_secret', r.clientSecret],
                ],
              });
              await qc.invalidateQueries({ queryKey: ['/integracao/clientes-api'] });
            } catch (e) {
              tratarErro(e, form.setError);
            }
          })}
        >
          <Campo rotulo="Nome" erro={form.formState.errors.nome?.message} obrigatorio>
            <Entrada {...form.register('nome')} />
          </Campo>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Escopos</legend>
            <div className="space-y-2">
              {(Object.entries(ESCOPOS_INTEGRACAO) as [EscopoIntegracao, string][]).map(
                ([escopo, descricao]) => (
                  <Caixa
                    key={escopo}
                    rotulo={`${escopo} — ${descricao}`}
                    value={escopo}
                    {...form.register('escopos')}
                  />
                ),
              )}
            </div>
            {form.formState.errors.escopos && (
              <p className="mt-1 text-xs font-medium text-red-700">
                {form.formState.errors.escopos.message}
              </p>
            )}
          </fieldset>
          <div className="flex justify-end">
            <Botao type="submit" carregando={form.formState.isSubmitting}>
              Criar credenciais
            </Botao>
          </div>
        </form>
      </Dialogo>
      <SegredoExibido valor={segredo} aoFechar={() => setSegredo(null)} />
      <Confirmacao
        aberto={!!revogando}
        aoMudar={(a) => !a && setRevogando(null)}
        titulo="Revogar cliente de API"
        mensagem="O CRM perderá o acesso com estas credenciais imediatamente."
        rotuloConfirmar="Revogar"
        perigo
        aoConfirmar={async () => {
          try {
            await api(`/integracao/clientes-api/${revogando}/revogar`, { metodo: 'POST' });
            toast.success('Cliente de API revogado.');
            await qc.invalidateQueries({ queryKey: ['/integracao/clientes-api'] });
          } catch (e) {
            tratarErro(e);
            throw e;
          }
        }}
      />
    </>
  );
}

function Tarefas() {
  const { tem } = useAuth();
  const { data, isLoading, error, refetch } = useConsulta<{
    resumo: { tipo: string; status: string; total: number }[];
    falhas: {
      id: string;
      tipo: string;
      tentativas: number;
      ultimoErro: string | null;
      criadoEm: string;
    }[];
  }>('/integracao/tarefas', undefined, { intervalo: 15_000 });
  if (isLoading) return <Carregando />;
  if (error || !data) return <ErroCarregamento erro={error} />;
  return (
    <div className="space-y-4">
      <Tabela
        legenda="Resumo da fila de processamento"
        dados={data.resumo}
        chave={(r) => `${r.tipo}-${r.status}`}
        textoVazio="Fila vazia."
        colunas={[
          { titulo: 'Tipo de tarefa', celula: (r) => <code className="text-xs">{r.tipo}</code> },
          {
            titulo: 'Status',
            celula: (r) => (
              <EtiquetaStatus
                status={
                  r.status === 'CONCLUIDA'
                    ? 'SUCESSO'
                    : r.status === 'FALHOU'
                      ? 'FALHA'
                      : r.status === 'PROCESSANDO'
                        ? 'EM_ANDAMENTO'
                        : 'PENDENTE'
                }
              />
            ),
          },
          { titulo: 'Quantidade', alinhamento: 'direita', celula: (r) => r.total },
        ]}
      />
      <h2 className="text-lg font-semibold">Tarefas que esgotaram as tentativas</h2>
      <Tabela
        legenda="Tarefas com falha"
        dados={data.falhas}
        chave={(f) => f.id}
        textoVazio="Nenhuma tarefa com falha."
        colunas={[
          { titulo: 'Criada em', celula: (f) => formatarDataHora(f.criadoEm) },
          { titulo: 'Tipo', celula: (f) => <code className="text-xs">{f.tipo}</code> },
          { titulo: 'Tentativas', alinhamento: 'direita', celula: (f) => f.tentativas },
          {
            titulo: 'Último erro',
            celula: (f) => <span className="text-xs text-red-800">{f.ultimoErro}</span>,
          },
          {
            titulo: 'Ações',
            alinhamento: 'direita',
            celula: (f) =>
              tem('integracao:gerenciar') && (
                <Botao
                  variante="fantasma"
                  tamanho="sm"
                  onClick={async () => {
                    try {
                      await api(`/integracao/tarefas/${f.id}/reprocessar`, { metodo: 'POST' });
                      toast.success('Tarefa reenfileirada.');
                      await refetch();
                    } catch (e) {
                      tratarErro(e);
                    }
                  }}
                >
                  Reprocessar
                </Botao>
              ),
          },
        ]}
      />
    </div>
  );
}

export default function PaginaIntegracao() {
  const { tem } = useAuth();
  const { data, error, isLoading, refetch } = useConsulta<Painel>('/integracao/crm', undefined, {
    intervalo: 30_000,
  });
  if (isLoading) return <Carregando />;
  if (error || !data) return <ErroCarregamento erro={error} tentarNovamente={refetch} />;
  return (
    <>
      <CabecalhoPagina
        titulo="Integração com o CRM Agrogest"
        descricao="Sincronização de clientes, API de pedidos e saldos, webhooks e logs"
      />
      <Abas
        rotulo="Integração"
        abas={[
          {
            valor: 'geral',
            titulo: 'Visão geral e configuração',
            conteudo: <VisaoGeral painel={data} atualizar={() => void refetch()} />,
          },
          { valor: 'execucoes', titulo: 'Execuções', conteudo: <Execucoes /> },
          { valor: 'logs', titulo: 'Logs', conteudo: <Logs /> },
          { valor: 'eventos', titulo: 'Eventos (webhooks)', conteudo: <Eventos /> },
          {
            valor: 'clientes-api',
            titulo: 'Clientes de API',
            conteudo: <ClientesApi />,
            oculta: !tem('integracao:gerenciar'),
          },
          { valor: 'tarefas', titulo: 'Fila de processamento', conteudo: <Tarefas /> },
        ]}
      />
    </>
  );
}
