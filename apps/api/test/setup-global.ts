import { execSync } from 'node:child_process';
import { config as carregarEnv } from 'dotenv';

/**
 * Prepara o banco de testes: aplica as migrations e os dados de referência
 * (permissões, perfis e unidades). Executado uma vez antes da suíte de integração.
 * Atenção: o globalSetup roda no processo principal, que não recebe `test.env`.
 */
export default function setup() {
  const arquivo = carregarEnv({ path: '.env', quiet: true }).parsed ?? {};
  const url =
    process.env.DATABASE_URL_TEST ??
    arquivo.DATABASE_URL_TEST ??
    'postgresql://estoque:estoque_dev@localhost:5432/estoque_test?schema=public';
  if (!/estoque_test/.test(url)) {
    throw new Error(
      'DATABASE_URL_TEST deve apontar para um banco de testes dedicado (estoque_test).',
    );
  }
  const env = { ...process.env, DATABASE_URL: url, SEED_ADMIN_EMAIL: '', SEED_ADMIN_SENHA: '' };
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env });
  execSync('npx prisma db seed', { stdio: 'pipe', env });
}
