import { INestApplication, VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { env } from './config/env';

// BigInt (números sequenciais) é serializado como texto no JSON
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
  return this.toString();
};

/** Configuração HTTP compartilhada entre a aplicação real e os testes de API. */
export function configurarApp(app: INestApplication) {
  const express = app as NestExpressApplication;
  express.set('trust proxy', env.TRUST_PROXY ? 1 : false);
  express.disable('x-powered-by');
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Swagger UI usa estilos e scripts inline
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(cookieParser());
  express.useBodyParser('json', { limit: '1mb' });
  app.enableCors({
    origin: env.WEB_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'X-CSRF-Token',
      'X-Request-Id',
    ],
    exposedHeaders: ['Content-Disposition', 'Idempotent-Replayed', 'X-Request-Id'],
  });
  app.enableShutdownHooks();
}

export function gerarOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Estoque Agrogest — API')
    .setDescription(
      [
        'API REST do sistema de gestão e controle de estoque integrado ao CRM Agrogest.',
        '',
        '* **/api/v1/** — API interna usada pelo frontend (JWT de usuário).',
        '* **/api/integracao/v1/** — API de integração para o CRM (OAuth 2.0 client credentials).',
        '',
        'Erros seguem a RFC 7807 (`application/problem+json`). Operações de movimentação aceitam o',
        'cabeçalho `Idempotency-Key` para evitar processamento em duplicidade.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .addOAuth2(
      {
        type: 'oauth2',
        flows: {
          clientCredentials: {
            tokenUrl: '/api/integracao/v1/oauth/token',
            scopes: {
              'estoque:consultar': 'Consultar catálogo e saldos',
              'pedidos:gerenciar': 'Gerenciar pedidos de venda',
              'webhooks:enviar': 'Enviar eventos por webhook',
            },
          },
        },
      },
      'integracao',
    )
    .build();
  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
}
