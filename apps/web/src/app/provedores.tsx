'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { ErroApi } from '@/lib/api';
import { ProvedorAuth } from '@/lib/auth';

export function Provedores({ children }: { children: ReactNode }) {
  const [cliente] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: true,
            retry: (falhas, erro) => !(erro instanceof ErroApi && erro.status < 500) && falhas < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={cliente}>
      <ProvedorAuth>{children}</ProvedorAuth>
      {/* Toasts são anunciados por leitores de tela (aria-live) */}
      <Toaster richColors position="top-right" closeButton toastOptions={{ duration: 6000 }} />
    </QueryClientProvider>
  );
}
