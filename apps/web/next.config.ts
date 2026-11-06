import path from 'node:path';
import type { NextConfig } from 'next';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3333';

const csp = [
  "default-src 'self'",
  // Next.js injeta scripts inline de hidratação
  "script-src 'self' 'unsafe-inline'" +
    (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
  "style-src 'self' 'unsafe-inline'",
  // Imagens de produtos via URLs pré-assinadas do S3 (e s3mock em desenvolvimento)
  `img-src 'self' data: blob: https://*.amazonaws.com ${process.env.NODE_ENV === 'development' ? 'http://localhost:9090' : ''}`,
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const config: NextConfig = {
  output: 'standalone',
  // Monorepo: o rastreamento de arquivos do build standalone parte da raiz do repositório
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // Diretório de build separado permite rodar os testes E2E com o servidor de desenvolvimento aberto
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  poweredByHeader: false,
  reactStrictMode: true,
  // A API é servida no mesmo domínio (/api), evitando CORS e mantendo cookies SameSite=Strict.
  // Em produção o ALB encaminha /api/* diretamente para o serviço da API.
  async rewrites() {
    return [{ source: '/api/:caminho*', destination: `${API_URL}/api/:caminho*` }];
  },
  async headers() {
    return [
      {
        source: '/:caminho*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default config;
