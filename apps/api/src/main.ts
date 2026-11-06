import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { env } from './config/env';
import { configurarApp, gerarOpenApi } from './configurar-app';

async function bootstrap() {
  // rawBody: necessário para validar a assinatura HMAC dos webhooks
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));
  configurarApp(app);

  const documento = gerarOpenApi(app);
  SwaggerModule.setup('api/docs', app, documento, {
    jsonDocumentUrl: 'api/docs/openapi.json',
    customSiteTitle: 'Estoque Agrogest — API',
  });

  await app.listen(env.PORT);
  app.get(Logger).log(`API disponível em http://localhost:${env.PORT}/api (docs em /api/docs)`);
}

void bootstrap();
