'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  configuracoesSistemaSchema,
  formatarDataHora,
  ROTULOS_TIPO_NOTIFICACAO,
  TIPOS_NOTIFICACAO,
} from '@estoque/shared';
import { BarraFiltros, FiltroData } from '@/components/listagem';
import { Abas } from '@/components/ui/abas';
import { CabecalhoPagina, Carregando, Cartao, ErroCarregamento } from '@/components/ui/basicos';
import { Botao } from '@/components/ui/botao';
import { Caixa, Campo, Entrada } from '@/components/ui/campos';
import { Paginacao, Tabela } from '@/components/ui/tabela';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useConsulta, useFiltrosUrl, useListagem } from '@/lib/hooks';
import { tratarErro } from '@/lib/utils';

type Config = z.input<typeof configuracoesSistemaSchema>;

function Sistema() {
  const { data, isLoading, error } =
    useConsulta<z.output<typeof configuracoesSistemaSchema>>('/configuracoes');
  if (isLoading) return <Carregando />;
  if (error || !data) return <ErroCarregamento erro={error} />;
  return <FormSistema inicial={data} />;
}

function FormSistema({ inicial }: { inicial: Config }) {
  const form = useForm<Config, unknown, z.output<typeof configuracoesSistemaSchema>>({
    resolver: zodResolver(configuracoesSistemaSchema),
    defaultValues: {
      ...inicial,
      notificacoes: { ...inicial.notificacoes, emailsDestino: inicial.notificacoes.emailsDestino },
    },
  });
  const [emails, setEmails] = useState((inicial.notificacoes.emailsDestino ?? []).join(', '));
  const e = form.formState.errors;
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit(async (dados) => {
        try {
          await api('/configuracoes', { metodo: 'PUT', corpo: dados });
          toast.success('Configurações salvas.');
        } catch (erro) {
          tratarErro(erro, form.setError);
        }
      })}
    >
      <Cartao titulo="Alertas de movimentação fora do padrão">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Campo
            rotulo="Desvios-padrão acima da média"
            erro={e.alertas?.multiplicadorDesvio?.message}
            dica="Saída maior que média + k × desvio é atípica"
          >
            <Entrada
              type="number"
              step="0.5"
              min="1"
              max="10"
              {...form.register('alertas.multiplicadorDesvio')}
            />
          </Campo>
          <Campo rotulo="Janela de análise (dias)" erro={e.alertas?.janelaDias?.message}>
            <Entrada type="number" min="7" max="365" {...form.register('alertas.janelaDias')} />
          </Campo>
          <Campo
            rotulo="Mínimo de amostras"
            erro={e.alertas?.minimoAmostras?.message}
            dica="Abaixo disso, a regra estatística não é aplicada"
          >
            <Entrada type="number" min="3" max="100" {...form.register('alertas.minimoAmostras')} />
          </Campo>
          <Campo
            rotulo="% do saldo consumido em uma saída"
            erro={e.alertas?.percentualSaldoAtipico?.message}
            dica="0 desativa esta regra"
          >
            <Entrada
              type="number"
              min="0"
              max="100"
              {...form.register('alertas.percentualSaldoAtipico')}
            />
          </Campo>
          <Campo rotulo="Início do horário de operação" erro={e.alertas?.horarioInicio?.message}>
            <Entrada type="time" {...form.register('alertas.horarioInicio')} />
          </Campo>
          <Campo
            rotulo="Fim do horário de operação"
            erro={e.alertas?.horarioFim?.message}
            dica="Registros manuais fora do horário geram alerta"
          >
            <Entrada type="time" {...form.register('alertas.horarioFim')} />
          </Campo>
        </div>
      </Cartao>
      <Cartao titulo="Notificações por e-mail">
        <Caixa
          rotulo="Enviar alertas por e-mail"
          {...form.register('notificacoes.emailHabilitado')}
        />
        <Campo
          rotulo="Destinatários"
          erro={
            e.notificacoes?.emailsDestino?.message ?? e.notificacoes?.emailsDestino?.[0]?.message
          }
          dica="Separe vários e-mails por vírgula"
          className="mt-3"
        >
          <Entrada
            value={emails}
            onChange={(ev) => {
              setEmails(ev.target.value);
              form.setValue(
                'notificacoes.emailsDestino',
                ev.target.value
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean),
              );
            }}
          />
        </Campo>
        <fieldset className="mt-3">
          <legend className="mb-1 text-sm font-medium">Tipos de alerta enviados por e-mail</legend>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {TIPOS_NOTIFICACAO.map((t) => (
              <Caixa
                key={t}
                rotulo={ROTULOS_TIPO_NOTIFICACAO[t]}
                value={t}
                {...form.register('notificacoes.tiposPorEmail')}
              />
            ))}
          </div>
        </fieldset>
      </Cartao>
      <Cartao titulo="Integração e retenção de dados (LGPD)">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Campo
            rotulo="Falhas consecutivas para alertar"
            erro={e.integracao?.falhasParaAlerta?.message}
          >
            <Entrada
              type="number"
              min="1"
              max="20"
              {...form.register('integracao.falhasParaAlerta')}
            />
          </Campo>
          <Campo
            rotulo="Retenção de logs de integração (dias)"
            erro={e.retencao?.logsIntegracaoDias?.message}
          >
            <Entrada
              type="number"
              min="30"
              max="3650"
              {...form.register('retencao.logsIntegracaoDias')}
            />
          </Campo>
          <Campo
            rotulo="Retenção da auditoria (dias)"
            erro={e.retencao?.logsAuditoriaDias?.message}
            dica="Mínimo de 180 dias"
          >
            <Entrada
              type="number"
              min="180"
              max="3650"
              {...form.register('retencao.logsAuditoriaDias')}
            />
          </Campo>
        </div>
      </Cartao>
      <div className="flex justify-end">
        <Botao type="submit" carregando={form.formState.isSubmitting}>
          Salvar configurações
        </Botao>
      </div>
    </form>
  );
}

function Auditoria() {
  const [f, definir] = useFiltrosUrl({ busca: '', dataInicio: '', dataFim: '' });
  const { data, isLoading, isFetching, error } = useListagem<{
    id: string;
    acao: string;
    entidade: string;
    entidadeId: string | null;
    ator: string;
    ip: string | null;
    criadoEm: string;
    dados: unknown;
  }>('/auditoria', { ...f, porPagina: 30 });
  return (
    <>
      <BarraFiltros
        busca={f.busca}
        aoBuscar={(busca) => definir({ busca })}
        placeholder="Ação (ex.: LOGIN) ou identificador do registro"
      >
        <FiltroData
          rotulo="De"
          valor={f.dataInicio}
          aoMudar={(dataInicio) => definir({ dataInicio })}
        />
        <FiltroData rotulo="Até" valor={f.dataFim} aoMudar={(dataFim) => definir({ dataFim })} />
      </BarraFiltros>
      <Tabela
        legenda="Registro de atividades"
        dados={data?.dados}
        carregando={isLoading || isFetching}
        erro={error}
        chave={(a) => a.id}
        colunas={[
          { titulo: 'Data/hora', celula: (a) => formatarDataHora(a.criadoEm) },
          { titulo: 'Responsável', celula: (a) => a.ator },
          { titulo: 'Ação', celula: (a) => <code className="text-xs">{a.acao}</code> },
          {
            titulo: 'Registro',
            celula: (a) => `${a.entidade}${a.entidadeId ? ` · ${a.entidadeId.slice(0, 8)}` : ''}`,
          },
          { titulo: 'IP', secundaria: true, celula: (a) => a.ip ?? '—' },
          {
            titulo: 'Detalhes',
            secundaria: true,
            celula: (a) =>
              a.dados ? (
                <details>
                  <summary className="cursor-pointer text-xs text-marca-800">Ver</summary>
                  <pre className="mt-1 max-w-md overflow-x-auto rounded bg-gray-50 p-2 text-xs">
                    {JSON.stringify(a.dados, null, 2)}
                  </pre>
                </details>
              ) : null,
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

function Lgpd() {
  const [email, setEmail] = useState('');
  const [documento, setDocumento] = useState('');
  const [resultado, setResultado] = useState<unknown>(null);
  const [carregando, setCarregando] = useState(false);
  return (
    <div className="space-y-4">
      <Cartao titulo="Direitos do titular — acesso e portabilidade">
        <p className="mb-3 text-sm text-suave">
          Localiza dados pessoais de um titular (usuários, fornecedores pessoa física, contatos e
          espelho de clientes do CRM). A consulta é registrada na auditoria. Dados de clientes são
          controlados pelo CRM; correções e exclusões devem ser feitas lá.
        </p>
        <form
          className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_1fr_auto]"
          onSubmit={async (e) => {
            e.preventDefault();
            setCarregando(true);
            try {
              setResultado(
                await api('/lgpd/titular', {
                  consulta: { email: email || undefined, documento: documento || undefined },
                }),
              );
            } catch (er) {
              tratarErro(er);
            } finally {
              setCarregando(false);
            }
          }}
        >
          <Campo rotulo="E-mail do titular">
            <Entrada type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Campo>
          <Campo rotulo="CPF/CNPJ do titular">
            <Entrada value={documento} onChange={(e) => setDocumento(e.target.value)} />
          </Campo>
          <Botao type="submit" carregando={carregando}>
            Consultar
          </Botao>
        </form>
        {resultado !== null && (
          <div className="mt-4">
            <div className="mb-2 flex justify-end">
              <Botao
                variante="secundario"
                tamanho="sm"
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob([JSON.stringify(resultado, null, 2)], { type: 'application/json' }),
                  );
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'dados-do-titular.json';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Baixar JSON (portabilidade)
              </Botao>
            </div>
            <pre className="max-h-96 overflow-auto rounded-md bg-gray-50 p-3 text-xs">
              {JSON.stringify(resultado, null, 2)}
            </pre>
          </div>
        )}
      </Cartao>
      <Cartao titulo="Anonimização">
        <p className="text-sm text-suave">
          Usuários desligados podem ser anonimizados em <strong>Usuários e permissões</strong> pela
          API <code>POST /api/v1/lgpd/usuarios/:id/anonimizar</code>; fornecedores pessoa física
          inativos, por <code>POST /api/v1/lgpd/fornecedores/:id/anonimizar</code>. O histórico de
          movimentações é preservado sem os dados pessoais.
        </p>
      </Cartao>
    </div>
  );
}

export default function PaginaConfiguracoes() {
  const { tem } = useAuth();
  return (
    <>
      <CabecalhoPagina
        titulo="Configurações"
        descricao="Parâmetros do sistema, auditoria de atividades e LGPD"
      />
      <Abas
        rotulo="Configurações"
        abas={[
          {
            valor: 'sistema',
            titulo: 'Parâmetros do sistema',
            conteudo: <Sistema />,
            oculta: !tem('configuracoes:gerenciar'),
          },
          {
            valor: 'auditoria',
            titulo: 'Auditoria',
            conteudo: <Auditoria />,
            oculta: !tem('auditoria:ler'),
          },
          { valor: 'lgpd', titulo: 'LGPD', conteudo: <Lgpd />, oculta: !tem('lgpd:gerenciar') },
        ]}
      />
    </>
  );
}
