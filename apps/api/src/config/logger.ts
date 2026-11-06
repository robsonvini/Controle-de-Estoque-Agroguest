import type { Params } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { env } from './env';

/**
 * Logs estruturados em JSON (CloudWatch). Campos sensíveis e dados pessoais
 * são redigidos (LGPD): senhas, tokens, cookies e documentos.
 */
export const opcoesLogger: Params = {
  pinoHttp: {
    level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
    genReqId: (req, res) => {
      const existente = req.headers['x-request-id'];
      const id =
        typeof existente === 'string' && existente.length <= 100 ? existente : randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-csrf-token"]',
        'req.headers["x-signature"]',
        'res.headers["set-cookie"]',
        '*.senha',
        '*.novaSenha',
        '*.senhaAtual',
        '*.client_secret',
        '*.cpf',
      ],
      censor: '[redigido]',
    },
    serializers: {
      req: (req: { id: string; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
    },
    autoLogging: { ignore: (req) => req.url?.startsWith('/api/health') ?? false },
    transport:
      env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' } }
        : undefined,
  },
};
