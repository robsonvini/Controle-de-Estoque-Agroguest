import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Provedores } from './provedores';

export const metadata: Metadata = {
  title: { default: 'Estoque Agrogest', template: '%s · Estoque Agrogest' },
  description: 'Gestão e controle de estoque integrado ao CRM Agrogest',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1f5f3a',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">
        <Provedores>{children}</Provedores>
      </body>
    </html>
  );
}
