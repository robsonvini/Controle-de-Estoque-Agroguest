'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  criarUsuarioSchema,
  formatarDataHora,
  MODULOS_PERMISSAO,
  perfilSchema,
  senhaForteSchema,
} from '@estoque/shared';
import { BarraFiltros, FiltroSelecao } from '@/components/listagem';
import { Abas } from '@/components/ui/abas';
import { CabecalhoPagina, Etiqueta } from '@/components/ui/basicos';
import { Botao } from '@/components/ui/botao';
import { AreaTexto, Caixa, Campo, Entrada, Selecao } from '@/components/ui/campos';
import { Dialogo } from '@/components/ui/dialogo';
import { Paginacao, Tabela } from '@/components/ui/tabela';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useConsulta, useFiltrosUrl, useListagem } from '@/lib/hooks';
import { tratarErro } from '@/lib/utils';

interface Usuario {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  deveTrocarSenha: boolean;
  bloqueadoAte: string | null;
  ultimoLoginEm: string | null;
  perfil: { id: string; nome: string };
}
interface Perfil {
  id: string;
  nome: string;
  descricao: string | null;
  sistema: boolean;
  permissoes: string[];
  totalUsuarios: number;
}
interface Permissao {
  codigo: string;
  modulo: string;
  moduloNome: string;
  descricao: string;
}

const DICA_SENHA = 'Mínimo de 10 caracteres, com maiúscula, minúscula, número e símbolo.';

function Usuarios({ perfis }: { perfis: Perfil[] }) {
  const { tem, usuario: eu } = useAuth();
  const qc = useQueryClient();
  const [f, definir] = useFiltrosUrl({ busca: '', perfilId: '', ativo: '' });
  const { data, isLoading, isFetching, error, refetch } = useListagem<Usuario>('/usuarios', {
    ...f,
    porPagina: 25,
  });
  const [dialogo, setDialogo] = useState<{
    tipo: 'novo' | 'editar' | 'senha';
    usuario?: Usuario;
  } | null>(null);
  const novo = useForm<
    z.input<typeof criarUsuarioSchema>,
    unknown,
    z.output<typeof criarUsuarioSchema>
  >({ resolver: zodResolver(criarUsuarioSchema) });
  const edicao = useForm<{ nome: string; perfilId: string; ativo: boolean }>();
  const senha = useForm<{ novaSenha: string }>({
    resolver: zodResolver(z.object({ novaSenha: senhaForteSchema })),
  });
  const gerenciar = tem('usuarios:gerenciar');
  const atualizar = () => qc.invalidateQueries({ queryKey: ['/usuarios'] });

  return (
    <>
      {gerenciar && (
        <div className="mb-3 flex justify-end">
          <Botao
            icone={<Plus className="h-4 w-4" aria-hidden />}
            onClick={() => {
              novo.reset({ nome: '', email: '', perfilId: '', senhaInicial: '' });
              setDialogo({ tipo: 'novo' });
            }}
          >
            Novo usuário
          </Botao>
        </div>
      )}
      <BarraFiltros
        busca={f.busca}
        aoBuscar={(busca) => definir({ busca })}
        placeholder="Nome ou e-mail"
      >
        <FiltroSelecao
          rotulo="Perfil"
          valor={f.perfilId}
          aoMudar={(perfilId) => definir({ perfilId })}
          opcoes={perfis.map((p) => ({ valor: p.id, rotulo: p.nome }))}
        />
        <FiltroSelecao
          rotulo="Situação"
          valor={f.ativo}
          aoMudar={(ativo) => definir({ ativo })}
          todos="Todas"
          opcoes={[
            { valor: 'true', rotulo: 'Ativos' },
            { valor: 'false', rotulo: 'Inativos' },
          ]}
        />
      </BarraFiltros>
      <Tabela
        legenda="Usuários"
        dados={data?.dados}
        carregando={isLoading || isFetching}
        erro={error}
        tentarNovamente={refetch}
        chave={(u) => u.id}
        colunas={[
          {
            titulo: 'Nome',
            celula: (u) => (
              <>
                <strong>{u.nome}</strong>
                <span className="block text-xs text-suave">{u.email}</span>
              </>
            ),
          },
          { titulo: 'Perfil', celula: (u) => u.perfil.nome },
          {
            titulo: 'Último acesso',
            secundaria: true,
            celula: (u) => formatarDataHora(u.ultimoLoginEm) || 'Nunca',
          },
          {
            titulo: 'Situação',
            celula: (u) => (
              <span className="flex flex-wrap gap-1">
                <Etiqueta cor={u.ativo ? 'verde' : 'cinza'}>
                  {u.ativo ? 'Ativo' : 'Inativo'}
                </Etiqueta>
                {u.bloqueadoAte && new Date(u.bloqueadoAte) > new Date() && (
                  <Etiqueta cor="vermelho">Bloqueado</Etiqueta>
                )}
                {u.deveTrocarSenha && <Etiqueta cor="amarelo">Troca de senha pendente</Etiqueta>}
              </span>
            ),
          },
          {
            titulo: 'Ações',
            alinhamento: 'direita',
            celula: (u) =>
              gerenciar && (
                <span className="flex justify-end gap-1">
                  <Botao
                    variante="fantasma"
                    tamanho="sm"
                    onClick={() => {
                      edicao.reset({ nome: u.nome, perfilId: u.perfil.id, ativo: u.ativo });
                      setDialogo({ tipo: 'editar', usuario: u });
                    }}
                  >
                    Editar
                  </Botao>
                  <Botao
                    variante="fantasma"
                    tamanho="sm"
                    onClick={() => {
                      senha.reset({ novaSenha: '' });
                      setDialogo({ tipo: 'senha', usuario: u });
                    }}
                  >
                    Redefinir senha
                  </Botao>
                  {u.bloqueadoAte && new Date(u.bloqueadoAte) > new Date() && (
                    <Botao
                      variante="fantasma"
                      tamanho="sm"
                      onClick={async () => {
                        try {
                          await api(`/usuarios/${u.id}/desbloquear`, { metodo: 'POST' });
                          toast.success('Usuário desbloqueado.');
                          await atualizar();
                        } catch (e) {
                          tratarErro(e);
                        }
                      }}
                    >
                      Desbloquear
                    </Botao>
                  )}
                </span>
              ),
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

      <Dialogo
        aberto={dialogo?.tipo === 'novo'}
        aoMudar={(a) => !a && setDialogo(null)}
        titulo="Novo usuário"
        descricao="O usuário deverá trocar a senha no primeiro acesso."
      >
        <form
          noValidate
          className="space-y-3"
          onSubmit={novo.handleSubmit(async (dados) => {
            try {
              await api('/usuarios', { metodo: 'POST', corpo: dados });
              toast.success('Usuário criado.');
              setDialogo(null);
              await atualizar();
            } catch (e) {
              tratarErro(e, novo.setError);
            }
          })}
        >
          <Campo rotulo="Nome" erro={novo.formState.errors.nome?.message} obrigatorio>
            <Entrada autoComplete="off" {...novo.register('nome')} />
          </Campo>
          <Campo rotulo="E-mail" erro={novo.formState.errors.email?.message} obrigatorio>
            <Entrada type="email" autoComplete="off" {...novo.register('email')} />
          </Campo>
          <Campo rotulo="Perfil" erro={novo.formState.errors.perfilId?.message} obrigatorio>
            <Selecao {...novo.register('perfilId')}>
              <option value="">Selecione…</option>
              {perfis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo
            rotulo="Senha inicial"
            erro={novo.formState.errors.senhaInicial?.message}
            obrigatorio
            dica={DICA_SENHA}
          >
            <Entrada
              type="password"
              autoComplete="new-password"
              {...novo.register('senhaInicial')}
            />
          </Campo>
          <div className="flex justify-end">
            <Botao type="submit" carregando={novo.formState.isSubmitting}>
              Criar usuário
            </Botao>
          </div>
        </form>
      </Dialogo>

      <Dialogo
        aberto={dialogo?.tipo === 'editar'}
        aoMudar={(a) => !a && setDialogo(null)}
        titulo={`Editar ${dialogo?.usuario?.nome ?? ''}`}
      >
        <form
          className="space-y-3"
          onSubmit={edicao.handleSubmit(async (dados) => {
            try {
              await api(`/usuarios/${dialogo!.usuario!.id}`, { metodo: 'PATCH', corpo: dados });
              toast.success('Usuário atualizado.');
              setDialogo(null);
              await atualizar();
            } catch (e) {
              tratarErro(e);
            }
          })}
        >
          <Campo rotulo="Nome" obrigatorio>
            <Entrada {...edicao.register('nome', { required: true })} />
          </Campo>
          <Campo rotulo="Perfil" obrigatorio>
            <Selecao {...edicao.register('perfilId')}>
              {perfis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Caixa
            rotulo="Usuário ativo"
            disabled={dialogo?.usuario?.id === eu?.id}
            {...edicao.register('ativo')}
          />
          <div className="flex justify-end">
            <Botao type="submit" carregando={edicao.formState.isSubmitting}>
              Salvar
            </Botao>
          </div>
        </form>
      </Dialogo>

      <Dialogo
        aberto={dialogo?.tipo === 'senha'}
        aoMudar={(a) => !a && setDialogo(null)}
        titulo="Redefinir senha"
        descricao="As sessões do usuário serão encerradas e a troca será exigida no próximo acesso."
      >
        <form
          noValidate
          className="space-y-3"
          onSubmit={senha.handleSubmit(async (dados) => {
            try {
              await api(`/usuarios/${dialogo!.usuario!.id}/redefinir-senha`, {
                metodo: 'POST',
                corpo: dados,
              });
              toast.success('Senha redefinida.');
              setDialogo(null);
            } catch (e) {
              tratarErro(e, senha.setError);
            }
          })}
        >
          <Campo
            rotulo="Nova senha temporária"
            erro={senha.formState.errors.novaSenha?.message}
            obrigatorio
            dica={DICA_SENHA}
          >
            <Entrada type="password" autoComplete="new-password" {...senha.register('novaSenha')} />
          </Campo>
          <div className="flex justify-end">
            <Botao type="submit" carregando={senha.formState.isSubmitting}>
              Redefinir
            </Botao>
          </div>
        </form>
      </Dialogo>
    </>
  );
}

function Perfis({ perfis, permissoes }: { perfis: Perfil[]; permissoes: Permissao[] }) {
  const { tem } = useAuth();
  const qc = useQueryClient();
  const [editando, setEditando] = useState<Perfil | 'novo' | null>(null);
  const form = useForm<z.input<typeof perfilSchema>, unknown, z.output<typeof perfilSchema>>({
    resolver: zodResolver(perfilSchema),
  });
  const modulos = [...new Set(permissoes.map((p) => p.modulo))];
  const abrir = (p: Perfil | 'novo') => {
    form.reset(
      p === 'novo'
        ? { nome: '', descricao: '', permissoes: [] }
        : { nome: p.nome, descricao: p.descricao ?? '', permissoes: p.permissoes as never },
    );
    setEditando(p);
  };
  return (
    <>
      {tem('perfis:gerenciar') && (
        <div className="mb-3 flex justify-end">
          <Botao icone={<Plus className="h-4 w-4" aria-hidden />} onClick={() => abrir('novo')}>
            Novo perfil
          </Botao>
        </div>
      )}
      <Tabela
        legenda="Perfis de acesso"
        dados={perfis}
        chave={(p) => p.id}
        colunas={[
          {
            titulo: 'Perfil',
            celula: (p) => (
              <>
                <strong>{p.nome}</strong>
                {p.sistema && (
                  <span className="ml-2">
                    <Etiqueta>Padrão</Etiqueta>
                  </span>
                )}
                <span className="block text-xs text-suave">{p.descricao}</span>
              </>
            ),
          },
          { titulo: 'Permissões', alinhamento: 'direita', celula: (p) => p.permissoes.length },
          { titulo: 'Usuários', alinhamento: 'direita', celula: (p) => p.totalUsuarios },
          {
            titulo: 'Ações',
            alinhamento: 'direita',
            celula: (p) => (
              <Botao variante="fantasma" tamanho="sm" onClick={() => abrir(p)}>
                {tem('perfis:gerenciar') ? 'Editar' : 'Ver'}
              </Botao>
            ),
          },
        ]}
      />
      <Dialogo
        aberto={!!editando}
        aoMudar={(a) => !a && setEditando(null)}
        titulo={editando === 'novo' ? 'Novo perfil' : `Perfil: ${editando?.nome ?? ''}`}
        largura="max-w-3xl"
      >
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit(async (dados) => {
            try {
              await api(editando === 'novo' ? '/perfis' : `/perfis/${(editando as Perfil).id}`, {
                metodo: editando === 'novo' ? 'POST' : 'PUT',
                corpo: dados,
              });
              toast.success('Perfil salvo. As permissões valem em até 30 segundos.');
              setEditando(null);
              await qc.invalidateQueries({ queryKey: ['/perfis'] });
            } catch (e) {
              tratarErro(e, form.setError);
            }
          })}
        >
          <fieldset disabled={!tem('perfis:gerenciar')} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Campo rotulo="Nome" erro={form.formState.errors.nome?.message} obrigatorio>
                <Entrada {...form.register('nome')} />
              </Campo>
              <Campo rotulo="Descrição" erro={form.formState.errors.descricao?.message}>
                <AreaTexto rows={1} {...form.register('descricao')} />
              </Campo>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {modulos.map((m) => (
                <fieldset key={m} className="rounded-md border border-gray-200 p-3">
                  <legend className="px-1 text-sm font-semibold">
                    {MODULOS_PERMISSAO[m] ?? m}
                  </legend>
                  {permissoes
                    .filter((p) => p.modulo === m)
                    .map((p) => (
                      <Caixa
                        key={p.codigo}
                        rotulo={p.descricao}
                        value={p.codigo}
                        {...form.register('permissoes')}
                        className="py-0.5"
                      />
                    ))}
                </fieldset>
              ))}
            </div>
            {form.formState.errors.permissoes && (
              <p className="text-xs font-medium text-red-700">
                {form.formState.errors.permissoes.message}
              </p>
            )}
          </fieldset>
          {tem('perfis:gerenciar') && (
            <div className="flex justify-end">
              <Botao type="submit" carregando={form.formState.isSubmitting}>
                Salvar perfil
              </Botao>
            </div>
          )}
        </form>
      </Dialogo>
    </>
  );
}

export default function PaginaUsuarios() {
  const { data: perfis } = useConsulta<Perfil[]>('/perfis');
  const { data: permissoes } = useConsulta<Permissao[]>('/perfis/permissoes');
  return (
    <>
      <CabecalhoPagina
        titulo="Usuários e permissões"
        descricao="Controle de acesso por perfil, com permissões específicas por módulo"
      />
      <Abas
        rotulo="Usuários e permissões"
        abas={[
          { valor: 'usuarios', titulo: 'Usuários', conteudo: <Usuarios perfis={perfis ?? []} /> },
          {
            valor: 'perfis',
            titulo: 'Perfis e permissões',
            conteudo: <Perfis perfis={perfis ?? []} permissoes={permissoes ?? []} />,
          },
        ]}
      />
    </>
  );
}
