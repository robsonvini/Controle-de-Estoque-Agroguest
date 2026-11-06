/**
 * Exporta a especificação OpenAPI para docs/openapi.json.
 * Uso: npm run build -w @estoque/api && npm run openapi:export -w @estoque/api
 */
import { NestFactory } from '@nestjs/core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from '../app.module';
import { configurarApp, gerarOpenApi } from '../configurar-app';

async function exportar() {
  const app = await NestFactory.create(AppModule, { logger: false, rawBody: true });
  configurarApp(app);
  await app.init();
  const documento = gerarOpenApi(app);
  const destino = resolve(__dirname, '../../../../docs/openapi.json');
  mkdirSync(resolve(destino, '..'), { recursive: true });
  writeFileSync(destino, `${JSON.stringify(documento, null, 2)}\n`);
  await app.close();
  console.warn(`OpenAPI exportado: ${destino} (${Object.keys(documento.paths).length} rotas)`);
}

void exportar();
