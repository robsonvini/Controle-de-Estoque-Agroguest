import 'dotenv/config';
import { z } from 'zod';

const booleano = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3333),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  TRUST_PROXY: booleano,

  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET deve ter ao menos 32 caracteres'),
  JWT_INTEGRACAO_SECRET: z
    .string()
    .min(32, 'JWT_INTEGRACAO_SECRET deve ter ao menos 32 caracteres'),
  ACCESS_TOKEN_TTL_SEGUNDOS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DIAS: z.coerce.number().int().min(1).max(30).default(7),
  COOKIE_SECURE: booleano,
  LOGIN_MAX_TENTATIVAS: z.coerce.number().int().min(3).max(20).default(5),
  LOGIN_BLOQUEIO_MINUTOS: z.coerce.number().int().min(1).max(1440).default(15),
  CRYPTO_KEY: z
    .string()
    .refine(
      (v) => Buffer.from(v, 'base64').length === 32,
      'CRYPTO_KEY deve ter 32 bytes em base64',
    ),

  SEED_ADMIN_NOME: z.string().default('Administrador'),
  SEED_ADMIN_EMAIL: z.string().optional(),
  SEED_ADMIN_SENHA: z.string().optional(),

  S3_BUCKET: z.string().default('estoque-arquivos'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ENDPOINT: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  S3_FORCE_PATH_STYLE: booleano,
  S3_ACCESS_KEY_ID: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  S3_SECRET_ACCESS_KEY: z
    .string()
    .optional()
    .transform((v) => v || undefined),

  EMAIL_HABILITADO: booleano,
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: booleano,
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_REMETENTE: z.string().default('Estoque Agrogest <estoque@agrogest.local>'),

  CRM_BASE_URL: z.string().default('http://localhost:8000'),
  CRM_TIMEOUT_MS: z.coerce.number().int().default(10000),
  CRM_SYNC_INTERVALO_MINUTOS: z.coerce.number().int().default(15),

  WORKER_INTERVALO_MS: z.coerce.number().int().min(200).default(2000),
  WORKER_LOTE: z.coerce.number().int().min(1).max(200).default(20),
});

export type Env = z.infer<typeof schema>;

function carregar(): Env {
  const resultado = schema.safeParse(process.env);
  if (!resultado.success) {
    const erros = resultado.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuração de ambiente inválida:\n${erros.join('\n')}`);
  }
  if (resultado.data.NODE_ENV === 'production' && !resultado.data.COOKIE_SECURE) {
    throw new Error('Em produção, COOKIE_SECURE deve ser true (HTTPS obrigatório).');
  }
  return resultado.data;
}

export const env: Env = carregar();
