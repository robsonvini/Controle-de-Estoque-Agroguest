'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect, type ReactNode } from 'react';
import { Estrutura } from '@/components/layout/estrutura';
import { Carregando } from '@/components/ui/basicos';
import { useAuth } from '@/lib/auth';

/** Área autenticada: exige sessão e força a troca de senha no primeiro acesso. */
export default function LayoutAutenticado({ children }: { children: ReactNode }) {
  const { usuario, carregando } = useAuth();
  const router = useRouter();
  const caminho = usePathname();

  useEffect(() => {
    if (carregando) return;
    if (!usuario) router.replace(`/login?destino=${encodeURIComponent(caminho)}`);
    else if (usuario.deveTrocarSenha && caminho !== '/conta')
      router.replace('/conta?trocarSenha=1');
  }, [usuario, carregando, router, caminho]);

  if (carregando || !usuario) return <Carregando texto="Verificando sessão…" />;
  return (
    <Estrutura>
      <Suspense fallback={<Carregando />}>{children}</Suspense>
    </Estrutura>
  );
}
