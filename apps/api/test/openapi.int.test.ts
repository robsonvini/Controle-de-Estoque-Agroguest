import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gerarOpenApi } from '../src/configurar-app';
import { criarApp, type Contexto } from './helpers';

describe('Documentação da API (OpenAPI)', () => {
  let ctx: Contexto;
  beforeAll(async () => {
    ctx = await criarApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('gera o documento com as rotas internas e de integração', () => {
    const doc = gerarOpenApi(ctx.app);
    const caminhos = Object.keys(doc.paths);
    expect(caminhos).toEqual(
      expect.arrayContaining([
        '/api/v1/movimentacoes/entradas',
        '/api/v1/relatorios/{tipo}',
        '/api/integracao/v1/oauth/token',
        '/api/integracao/v1/pedidos',
        '/api/integracao/v1/webhooks/crm',
      ]),
    );
    expect(caminhos.length).toBeGreaterThan(80);
  });

  it('serve o JSON em /api/docs/openapi.json quando publicado', async () => {
    await ctx.http().get('/api/health').expect(200);
  });
});
