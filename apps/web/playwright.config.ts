import { defineConfig, devices } from '@playwright/test';

/**
 * Testes de interface (E2E) e de acessibilidade.
 * Sobem uma API dedicada (porta 3334) apontando para o banco de TESTES e o
 * frontend (porta 3100) apontando para essa API — os dados de desenvolvimento não são tocados.
 */
const URL_TESTE = 'postgresql://estoque:estoque_dev@localhost:5432/estoque_test?schema=public';
const BANCO = process.env.DATABASE_URL_TEST ?? URL_TESTE;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: './e2e/preparar.ts',
  use: {
    baseURL: 'http://localhost:3100',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /responsivo\.spec\.ts/ },
    { name: 'celular', use: { ...devices['Pixel 7'] }, testMatch: /responsivo\.spec\.ts/ },
  ],
  webServer: [
    {
      command: 'node dist/main.js',
      cwd: '../api',
      port: 3334,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        PORT: '3334',
        DATABASE_URL: BANCO,
        NODE_ENV: 'test',
        WEB_ORIGIN: 'http://localhost:3100',
        LOG_LEVEL: 'warn',
        // Cada teste faz login; o rate limit de produção (10/min) é testado nos testes de API
        LOGIN_LIMITE_POR_MINUTO: '1000',
      },
    },
    {
      command: 'npx next dev --port 3100',
      port: 3100,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { API_INTERNAL_URL: 'http://localhost:3334', NEXT_DIST_DIR: '.next-e2e' },
    },
  ],
});
