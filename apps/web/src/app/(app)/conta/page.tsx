'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { formatarDataHora, trocarSenhaSchema } from '@estoque/shared';
import { CabecalhoPagina, Cartao, Etiqueta, ListaDados } from '@/components/ui/basicos';
import { Botao } from '@/components/ui/botao';
import { Campo, Entrada } from '@/components/ui/campos';
import { Tabela } from '@/components/ui/tabela';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useConsulta } from '@/lib/hooks';
import { tratarErro } from '@/lib/utils';

interface Sessao {
  id: string;
  ip: string | null;
  userAgent: string | null;
  criadoEm: string;
  ultimoUsoEm: string;
  expiraEm: string;
  atual: boolean;
}

export default function PaginaConta() {
  const { usuario, atualizar } = useAuth();
  const router = useRouter();
  const obrigatoria = useSearchParams().get('trocarSenha') === '1' || usuario?.deveTrocarSenha;
  const qc = useQueryClient();
  const sessoes = useConsulta<Sessao[]>('/auth/sessoes');
  const form = useForm<
    z.input<typeof trocarSenhaSchema>,
    unknown,
    z.output<typeof trocarSenhaSchema>
  >({ resolver: zodResolver(trocarSenhaSchema) });
  const e = form.formState.errors;

  return (
    <>
      <CabecalhoPagina titulo="Minha conta" />
      {obrigatoria && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Por segurança, defina uma nova senha para continuar usando o sistema.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Cartao titulo="Dados de acesso">
          <ListaDados
            itens={[
              ['Nome', usuario?.nome],
              ['E-mail', usuario?.email],
              ['Perfil', usuario?.perfil.nome],
            ]}
          />
        </Cartao>
        <Cartao titulo="Alterar senha">
          <form
            noValidate
            className="space-y-3"
            onSubmit={form.handleSubmit(async (dados) => {
              try {
                await api('/auth/trocar-senha', { metodo: 'POST', corpo: dados });
                toast.success('Senha alterada. As demais sessões foram encerradas.');
                form.reset({ senhaAtual: '', novaSenha: '', confirmacao: '' });
                await atualizar();
                if (obrigatoria) router.replace('/dashboard');
              } catch (erro) {
                tratarErro(erro, form.setError);
              }
            })}
          >
            <Campo rotulo="Senha atual" erro={e.senhaAtual?.message} obrigatorio>
              <Entrada
                type="password"
                autoComplete="current-password"
                {...form.register('senhaAtual')}
              />
            </Campo>
            <Campo
              rotulo="Nova senha"
              erro={e.novaSenha?.message}
              obrigatorio
              dica="Mínimo de 10 caracteres, com maiúscula, minúscula, número e símbolo."
            >
              <Entrada
                type="password"
                autoComplete="new-password"
                {...form.register('novaSenha')}
              />
            </Campo>
            <Campo rotulo="Confirmação da nova senha" erro={e.confirmacao?.message} obrigatorio>
              <Entrada
                type="password"
                autoComplete="new-password"
                {...form.register('confirmacao')}
              />
            </Campo>
            <div className="flex justify-end">
              <Botao type="submit" carregando={form.formState.isSubmitting}>
                Alterar senha
              </Botao>
            </div>
          </form>
        </Cartao>
      </div>
      <h2 className="mt-6 mb-2 text-lg font-semibold">Sessões ativas</h2>
      <Tabela
        legenda="Sessões ativas"
        dados={sessoes.data}
        carregando={sessoes.isLoading}
        erro={sessoes.error}
        chave={(s) => s.id}
        colunas={[
          {
            titulo: 'Dispositivo',
            celula: (s) => <span className="text-xs">{s.userAgent ?? 'Desconhecido'}</span>,
          },
          { titulo: 'IP', celula: (s) => s.ip ?? '—' },
          { titulo: 'Último uso', celula: (s) => formatarDataHora(s.ultimoUsoEm) },
          { titulo: 'Expira em', secundaria: true, celula: (s) => formatarDataHora(s.expiraEm) },
          {
            titulo: 'Ações',
            alinhamento: 'direita',
            celula: (s) =>
              s.atual ? (
                <Etiqueta cor="verde">Esta sessão</Etiqueta>
              ) : (
                <Botao
                  variante="fantasma"
                  tamanho="sm"
                  onClick={async () => {
                    try {
                      await api(`/auth/sessoes/${s.id}`, { metodo: 'DELETE' });
                      toast.success('Sessão encerrada.');
                      await qc.invalidateQueries({ queryKey: ['/auth/sessoes'] });
                    } catch (er) {
                      tratarErro(er);
                    }
                  }}
                >
                  Encerrar
                </Botao>
              ),
          },
        ]}
      />
    </>
  );
}
