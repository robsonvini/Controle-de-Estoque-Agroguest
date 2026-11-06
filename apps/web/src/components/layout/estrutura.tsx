'use client';

import * as Menu from '@radix-ui/react-dropdown-menu';
import { Bell, KeyRound, LogOut, Menu as IconeMenu, Sprout, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { useConsulta } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { MENU } from './menu';

function Navegacao({ aoNavegar }: { aoNavegar?: () => void }) {
  const caminho = usePathname();
  const { algum } = useAuth();
  return (
    <nav aria-label="Menu principal" className="flex-1 overflow-y-auto px-2 py-3">
      <ul className="space-y-0.5">
        {MENU.filter((i) => algum(...i.permissoes)).map((item) => {
          const ativo = caminho === item.href || caminho.startsWith(`${item.href}/`);
          const Icone = item.icone;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={aoNavegar}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-marca-50 hover:bg-marca-800',
                  ativo && 'bg-marca-900 text-white',
                )}
              >
                <Icone className="h-4 w-4 shrink-0" aria-hidden />
                {item.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Marca() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 px-4 py-4 text-white">
      <Sprout className="h-6 w-6" aria-hidden />
      <span className="text-lg font-semibold">Estoque Agrogest</span>
    </Link>
  );
}

function SinoNotificacoes() {
  const { tem } = useAuth();
  // Atualização periódica sem recarregar a página
  const { data } = useConsulta<{ naoLidas: number; criticas: number }>(
    tem('notificacoes:ler') ? '/notificacoes/contagem' : null,
    undefined,
    { intervalo: 30_000 },
  );
  const n = data?.naoLidas ?? 0;
  return (
    <Link
      href="/notificacoes"
      className="relative rounded-md p-2 text-texto hover:bg-gray-100"
      aria-label={n ? `Notificações: ${n} não lida${n > 1 ? 's' : ''}` : 'Notificações'}
    >
      <Bell className="h-5 w-5" aria-hidden />
      {n > 0 && (
        <span
          aria-hidden
          className={cn(
            'absolute -top-0.5 -right-0.5 min-w-5 rounded-full px-1 text-center text-xs font-bold text-white',
            data?.criticas ? 'bg-red-700' : 'bg-marca-700',
          )}
        >
          {n > 99 ? '99+' : n}
        </span>
      )}
    </Link>
  );
}

function MenuUsuario() {
  const { usuario, sair } = useAuth();
  if (!usuario) return null;
  const iniciais = usuario.nome
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <Menu.Root>
      {/* Nome acessível = texto visível + prefixo para leitores de tela (WCAG 2.5.3) */}
      <Menu.Trigger className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-gray-100">
        <span className="sr-only">Menu do usuário </span>
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-full bg-marca-700 text-xs font-bold text-white"
        >
          {iniciais}
        </span>
        <span className="sr-only sm:not-sr-only sm:block sm:text-left sm:text-sm">
          <span className="block font-medium">{usuario.nome}</span>
          <span className="block text-xs text-suave">{usuario.perfil.nome}</span>
        </span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-48 rounded-md border border-borda bg-white p-1 shadow-lg"
        >
          <Menu.Item asChild>
            <Link
              href="/conta"
              className="flex items-center gap-2 rounded px-3 py-2 text-sm outline-none data-[highlighted]:bg-gray-100"
            >
              <KeyRound className="h-4 w-4" aria-hidden /> Minha conta e senha
            </Link>
          </Menu.Item>
          <Menu.Separator className="my-1 h-px bg-borda" />
          <Menu.Item
            onSelect={() => void sair()}
            className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm text-red-800 outline-none data-[highlighted]:bg-red-50"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Sair
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function Estrutura({ children }: { children: ReactNode }) {
  const [menuAberto, setMenuAberto] = useState(false);
  const caminho = usePathname();
  useEffect(() => setMenuAberto(false), [caminho]);

  return (
    <div className="flex min-h-screen">
      {/* Link para pular a navegação (WCAG 2.4.1) */}
      <a
        href="#conteudo"
        className="sr-only-focusable fixed top-2 left-2 z-50 rounded bg-white px-3 py-2 font-medium text-marca-800 shadow"
      >
        Pular para o conteúdo
      </a>

      <aside
        className="hidden w-64 shrink-0 flex-col bg-marca-700 lg:flex"
        aria-label="Barra lateral"
      >
        <Marca />
        <Navegacao />
      </aside>

      {menuAberto && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMenuAberto(false)}
            aria-hidden
          />
          <aside className="relative flex h-full w-72 flex-col bg-marca-700">
            <div className="flex items-center justify-between pr-2">
              <Marca />
              <button
                type="button"
                onClick={() => setMenuAberto(false)}
                className="rounded p-2 text-white hover:bg-marca-800"
                aria-label="Fechar menu"
                autoFocus
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <Navegacao aoNavegar={() => setMenuAberto(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-borda bg-white px-3 sm:px-5">
          <button
            type="button"
            onClick={() => setMenuAberto(true)}
            className="rounded-md p-2 hover:bg-gray-100 lg:hidden"
            aria-label="Abrir menu"
            aria-expanded={menuAberto}
          >
            <IconeMenu className="h-5 w-5" aria-hidden />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <SinoNotificacoes />
            <MenuUsuario />
          </div>
        </header>
        <main
          id="conteudo"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 p-4 outline-none sm:p-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
