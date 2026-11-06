import { execSync } from 'node:child_process';
import path from 'node:path';
import { hash } from '@node-rs/argon2';
import { Client } from 'pg';

export const ADMIN_E2E = { email: 'admin.e2e@agrogest.local', senha: 'Admin@E2E#2026' };
const BANCO =
  process.env.DATABASE_URL_TEST ??
  'postgresql://estoque:estoque_dev@localhost:5432/estoque_test?schema=public';

/** Prepara o banco de testes: migrations, dados de referência, limpeza e administrador de teste. */
export default async function preparar() {
  if (!/estoque_test/.test(BANCO))
    throw new Error('Os testes E2E exigem o banco dedicado estoque_test.');
  const api = path.resolve(__dirname, '../../api');
  const env = { ...process.env, DATABASE_URL: BANCO, SEED_ADMIN_EMAIL: '', SEED_ADMIN_SENHA: '' };
  execSync('npx prisma migrate deploy', { cwd: api, env, stdio: 'pipe' });
  execSync('npx prisma db seed', { cwd: api, env, stdio: 'pipe' });

  const db = new Client({ connectionString: BANCO.replace('?schema=public', '') });
  await db.connect();
  try {
    await db.query(`
      TRUNCATE TABLE notificacao_leituras, notificacoes, tarefas, chaves_idempotencia, integracao_eventos_recebidos,
        integracao_logs, integracao_execucoes, clientes_api, ajuste_itens, ajustes, inventario_itens, inventarios,
        reservas, pedido_itens, pedidos, crm_clientes, pedidos_compra_itens, pedidos_compra, saidas, entradas,
        movimentacao_itens, movimentacoes, saldos_estoque, produto_fornecedores, fornecedor_contatos, fornecedores,
        produto_imagens, produtos, locais_armazenamento, categorias, logs_auditoria, sessoes, usuarios
      RESTART IDENTITY CASCADE`);
    const { rows } = await db.query(`SELECT id FROM perfis WHERE nome = 'Administrador'`);
    await db.query(
      `INSERT INTO usuarios (id, nome, email, senha_hash, perfil_id, deve_trocar_senha, atualizado_em)
       VALUES (gen_random_uuid(), 'Administrador E2E', $1, $2, $3, false, now())`,
      [ADMIN_E2E.email, await hash(ADMIN_E2E.senha), rows[0].id],
    );
  } finally {
    await db.end();
  }
}
