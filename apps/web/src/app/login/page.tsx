'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Sprout } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { loginSchema } from '@estoque/shared';
import { z } from 'zod';
import { Botao } from '@/components/ui/botao';
import { Campo, Entrada } from '@/components/ui/campos';
import { ErroApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Dados = z.input<typeof loginSchema>;

function FormularioLogin() {
  const { entrar, usuario, carregando } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const destino = params.get('destino');
  const [erroGeral, setErroGeral] = useState('');
  const form = useForm<Dados, unknown, z.output<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });

  const irParaDestino = () =>
    router.replace(
      destino && destino.startsWith('/') && !destino.startsWith('//') ? destino : '/dashboard',
    );

  useEffect(() => {
    if (!carregando && usuario) irParaDestino();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario, carregando]);

  const enviar = form.handleSubmit(async (dados) => {
    setErroGeral('');
    try {
      const u = await entrar(dados.email, dados.senha);
      if (u.deveTrocarSenha) router.replace('/conta?trocarSenha=1');
      else irParaDestino();
    } catch (e) {
      setErroGeral(e instanceof ErroApi ? e.message : 'Não foi possível conectar ao servidor.');
    }
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-marca-50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-borda bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="rounded-full bg-marca-700 p-3 text-white" aria-hidden>
            <Sprout className="h-7 w-7" />
          </span>
          <h1 className="text-xl font-semibold">Estoque Agrogest</h1>
          <p className="text-sm text-suave">Acesse com seu e-mail e senha</p>
        </div>
        {params.get('expirada') && (
          <p role="status" className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            Sua sessão expirou. Entre novamente.
          </p>
        )}
        {erroGeral && (
          <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-900">
            {erroGeral}
          </p>
        )}
        <form onSubmit={enviar} noValidate className="space-y-4">
          <Campo rotulo="E-mail" erro={form.formState.errors.email?.message} obrigatorio>
            <Entrada type="email" autoComplete="username" autoFocus {...form.register('email')} />
          </Campo>
          <Campo rotulo="Senha" erro={form.formState.errors.senha?.message} obrigatorio>
            <Entrada type="password" autoComplete="current-password" {...form.register('senha')} />
          </Campo>
          <Botao
            type="submit"
            className="w-full justify-center"
            carregando={form.formState.isSubmitting}
          >
            Entrar
          </Botao>
        </form>
      </div>
    </main>
  );
}

export default function PaginaLogin() {
  return (
    <Suspense>
      <FormularioLogin />
    </Suspense>
  );
}
