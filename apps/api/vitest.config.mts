import { config as carregarEnv } from 'dotenv';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const arquivoEnv = carregarEnv({ path: '.env', quiet: true }).parsed ?? {};
const urlTeste =
  process.env.DATABASE_URL_TEST ??
  arquivoEnv.DATABASE_URL_TEST ??
  'postgresql://estoque:estoque_dev@localhost:5432/estoque_test?schema=public';

export default defineConfig({
  // SWC preserva os metadados de decorators exigidos pelo NestJS
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: urlTeste,
      LOGIN_MAX_TENTATIVAS: '5',
    },
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.spec.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/**/*.int.test.ts'],
          globalSetup: ['test/setup-global.ts'],
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
