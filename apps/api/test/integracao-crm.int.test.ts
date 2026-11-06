import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assinar } from '../src/modules/integracao/webhooks.service';
import { WebhooksService } from '../src/modules/integracao/webhooks.service';
import { AlertasService } from '../src/modules/notificacoes/alertas.service';
import { CriptoService } from '../src/common/cripto.service';
import { clienteCrm, CrmSimulado } from './crm-simulado';
import {
  auth,
  cenarioBasico,
  criarApp,
  criarUsuarioLogado,
  entrada,
  limparBanco,
  saldo,
  type Contexto,
} from './helpers';

const C1 = '9b2f4c1e-6a7d-4e3b-9c1a-0f5e8d7c6b5a';
const C2 = '1c3e5a7b-9d2f-4a6c-8e0b-2d4f6a8c0e1b';

describe('Integração com o CRM Agrogest', () => {
  let ctx: Contexto;
  let crm: CrmSimulado;
  let urlCrm: string;
  let admin: string;

  beforeAll(async () => {
    ctx = await criarApp();
    crm = new CrmSimulado();
    urlCrm = await crm.iniciar();
  });
  afterAll(async () => {
    await crm.parar();
    await ctx.app.close();
  });
  beforeEach(async () => {
    await limparBanco(ctx.prisma);
    crm.clientes = [];
    crm.modo = 'ok';
    crm.requisicoes = [];
    ({ token: admin } = await criarUsuarioLogado(ctx, 'Administrador'));
    await ctx
      .http()
      .put('/api/v1/integracao/crm')
      .set(auth(admin))
      .send({
        ativo: true,
        baseUrl: urlCrm,
        timeoutMs: 1000,
        intervaloSyncMinutos: 15,
        webhookSaidaAtivo: false,
      })
      .expect(200);
  });

  describe('sincronização de clientes', () => {
    it('cria, atualiza, detecta inalterados e marca removidos no CRM', async () => {
      crm.clientes = [
        clienteCrm(C1, 'Fazenda Boa Vista'),
        clienteCrm(C2, 'Sítio Esperança', { cnpj: null, cpf: '529.982.247-25' }),
      ];
      const r1 = (
        await ctx.http().post('/api/v1/integracao/crm/sincronizar').set(auth(admin)).expect(200)
      ).body;
      expect(r1).toMatchObject({ status: 'SUCESSO', criados: 2, atualizados: 0, removidos: 0 });

      const local = await ctx.prisma.clienteCrm.findUniqueOrThrow({ where: { crmId: C2 } });
      expect(local.cpf).toBe('52998224725');
      expect(local.uf).toBe('SP');

      crm.clientes = [clienteCrm(C1, 'Fazenda Boa Vista', { cidade: 'Sertãozinho' })];
      const r2 = (
        await ctx.http().post('/api/v1/integracao/crm/sincronizar').set(auth(admin)).expect(200)
      ).body;
      expect(r2).toMatchObject({ criados: 0, atualizados: 1, removidos: 1 });
      expect(
        (await ctx.prisma.clienteCrm.findUniqueOrThrow({ where: { crmId: C2 } })).removidoNoCrm,
      ).toBe(true);

      // Listagem do espelho mascara CPF (LGPD)
      const lista = (
        await ctx.http().get('/api/v1/clientes?incluirRemovidos=true').set(auth(admin)).expect(200)
      ).body;
      const sitio = lista.dados.find((c: { crmId: string }) => c.crmId === C2);
      expect(sitio.cpf).toBe('***.982.247-**');
      // Usa somente o endpoint verificado do CRM
      expect(crm.requisicoes.every((r) => r.metodo === 'GET' && r.url === '/api/clientes')).toBe(
        true,
      );
    });

    it('ignora registros fora do contrato e contabiliza como inválidos', async () => {
      crm.clientes = [clienteCrm(C1, 'Fazenda Boa Vista'), { id: 'nao-uuid', nome: '' }];
      const r = (
        await ctx.http().post('/api/v1/integracao/crm/sincronizar').set(auth(admin)).expect(200)
      ).body;
      expect(r).toMatchObject({ criados: 1, invalidos: 1, totalRecebidos: 2 });
    });

    it('falhas: retenta, registra logs, conta falhas e gera alerta após o limite', async () => {
      crm.modo = 'erro500';
      for (let i = 0; i < 3; i++) {
        await ctx.http().post('/api/v1/integracao/crm/sincronizar').set(auth(admin)).expect(502);
      }
      const integracao = await ctx.prisma.integracao.findUniqueOrThrow({
        where: { codigo: 'crm-agrogest' },
      });
      expect(integracao.falhasConsecutivas).toBe(3);
      // 3 tentativas por sincronização (política de retentativa)
      expect(
        await ctx.prisma.integracaoLog.count({ where: { sucesso: false, direcao: 'SAIDA' } }),
      ).toBe(9);
      const alerta = await ctx.prisma.notificacao.findFirst({
        where: { tipo: 'FALHA_SINCRONIZACAO', resolvida: false },
      });
      expect(alerta).not.toBeNull();

      crm.modo = 'ok';
      crm.clientes = [clienteCrm(C1, 'Fazenda Boa Vista')];
      await ctx.http().post('/api/v1/integracao/crm/sincronizar').set(auth(admin)).expect(200);
      expect(
        (await ctx.prisma.notificacao.findUniqueOrThrow({ where: { id: alerta!.id } })).resolvida,
      ).toBe(true);
      expect((await ctx.prisma.integracao.findFirstOrThrow()).falhasConsecutivas).toBe(0);
    });

    it('timeout e resposta não-JSON são tratados como falha controlada', async () => {
      crm.modo = 'html';
      const r = await ctx
        .http()
        .post('/api/v1/integracao/crm/sincronizar')
        .set(auth(admin))
        .expect(502);
      expect(r.body.detail).toMatch(/JSON/);
      crm.modo = 'lento';
      const t = await ctx
        .http()
        .post('/api/v1/integracao/crm/sincronizar')
        .set(auth(admin))
        .expect(502);
      expect(t.body.detail).toMatch(/Tempo limite/);
    }, 30_000);

    it('envia o cabeçalho de autenticação configurado (cifrado em repouso)', async () => {
      await ctx
        .http()
        .put('/api/v1/integracao/crm')
        .set(auth(admin))
        .send({
          ativo: true,
          baseUrl: urlCrm,
          timeoutMs: 1000,
          intervaloSyncMinutos: 15,
          webhookSaidaAtivo: false,
          authHeaderNome: 'Authorization',
          authHeaderValor: 'Bearer token-do-crm',
        })
        .expect(200);
      const i = await ctx.prisma.integracao.findFirstOrThrow();
      expect(i.authHeaderValorCifrado).not.toContain('token-do-crm');
      await ctx.http().post('/api/v1/integracao/crm/sincronizar').set(auth(admin)).expect(200);
      expect(crm.requisicoes.at(-1)!.cabecalhos.authorization).toBe('Bearer token-do-crm');
    });
  });

  describe('API de integração (OAuth 2.0 client credentials)', () => {
    async function credenciais(escopos = ['estoque:consultar', 'pedidos:gerenciar']) {
      const c = (
        await ctx
          .http()
          .post('/api/v1/integracao/clientes-api')
          .set(auth(admin))
          .send({ nome: 'CRM Agrogest', escopos })
          .expect(201)
      ).body;
      const t = await ctx
        .http()
        .post('/api/integracao/v1/oauth/token')
        .send({
          grant_type: 'client_credentials',
          client_id: c.clientId,
          client_secret: c.clientSecret,
        })
        .expect(200);
      return { ...c, token: t.body.access_token as string };
    }

    it('fluxo completo: token → saldo → pedido idempotente → confirmação → baixa', async () => {
      const cen = await cenarioBasico(ctx, admin);
      await entrada(ctx, admin, cen.produto.id, cen.local.id, 6).expect(201);
      await entrada(ctx, admin, cen.produto.id, cen.local2.id, 4).expect(201);
      crm.clientes = [clienteCrm(C1, 'Fazenda Boa Vista')];
      const { token } = await credenciais();

      const s = (
        await ctx
          .http()
          .get('/api/integracao/v1/produtos/SEM-MILHO-01/saldo')
          .set(auth(token))
          .expect(200)
      ).body;
      expect(Number(s.disponivel)).toBe(10);

      const pedido = {
        idExterno: 'CRM-VENDA-0001',
        clienteCrmId: C1,
        itens: [{ sku: 'sem-milho-01', quantidade: 8, precoUnitario: 20 }],
      };
      // Idempotency-Key obrigatória
      await ctx.http().post('/api/integracao/v1/pedidos').set(auth(token)).send(pedido).expect(400);
      const p1 = await ctx
        .http()
        .post('/api/integracao/v1/pedidos')
        .set(auth(token))
        .set('Idempotency-Key', 'crm-venda-0001-a')
        .send(pedido)
        .expect(201);
      expect(p1.body.status).toBe('RESERVADO');
      // Reserva distribuída entre os dois locais (6 + 2)
      expect(p1.body.itens).toHaveLength(2);
      expect(p1.body.clienteCrmId).toBe(C1);

      // Mesmo idExterno com outra chave: devolve o existente sem nova reserva
      const p2 = await ctx
        .http()
        .post('/api/integracao/v1/pedidos')
        .set(auth(token))
        .set('Idempotency-Key', 'crm-venda-0001-b')
        .send(pedido)
        .expect(200);
      expect(p2.body.id).toBe(p1.body.id);
      expect(p2.body.jaExistia).toBe(true);
      const reservado =
        (await saldo(ctx, cen.produto.id, cen.local.id)).reservado +
        (await saldo(ctx, cen.produto.id, cen.local2.id)).reservado;
      expect(reservado).toBe(8);

      const conf = await ctx
        .http()
        .post('/api/integracao/v1/pedidos/CRM-VENDA-0001/confirmar')
        .set(auth(token))
        .expect(200);
      expect(conf.body.status).toBe('CONFIRMADO');
      await ctx
        .http()
        .post('/api/integracao/v1/pedidos/CRM-VENDA-0001/confirmar')
        .set(auth(token))
        .expect(200);
      const depois = (
        await ctx
          .http()
          .get('/api/integracao/v1/produtos/SEM-MILHO-01/saldo')
          .set(auth(token))
          .expect(200)
      ).body;
      expect(Number(depois.disponivel)).toBe(2);

      // Movimentação de saída registrada com o cliente de API como responsável
      const mov = await ctx.prisma.movimentacao.findFirstOrThrow({ where: { motivo: 'VENDA' } });
      expect(mov.clienteApiId).not.toBeNull();
      expect(
        await ctx.prisma.integracaoLog.count({ where: { direcao: 'ENTRADA' } }),
      ).toBeGreaterThan(0);
    });

    it('rejeita escopo insuficiente, credenciais inválidas e cliente revogado', async () => {
      const c = await credenciais(['estoque:consultar']);
      await ctx
        .http()
        .post('/api/integracao/v1/pedidos')
        .set(auth(c.token))
        .set('Idempotency-Key', 'qualquer-chave-1')
        .send({})
        .expect(403);
      await ctx
        .http()
        .post('/api/integracao/v1/oauth/token')
        .send({ grant_type: 'client_credentials', client_id: c.clientId, client_secret: 'errado' })
        .expect(401);
      await ctx.http().get('/api/integracao/v1/produtos').set(auth(c.token)).expect(200);
      await ctx
        .http()
        .post(`/api/v1/integracao/clientes-api/${c.id}/revogar`)
        .set(auth(admin))
        .expect(204);
      await ctx
        .http()
        .post('/api/integracao/v1/oauth/token')
        .send({
          grant_type: 'client_credentials',
          client_id: c.clientId,
          client_secret: c.clientSecret,
        })
        .expect(401);
    });

    it('SKU inexistente e saldo insuficiente retornam erros claros', async () => {
      const cen = await cenarioBasico(ctx, admin);
      await entrada(ctx, admin, cen.produto.id, cen.local.id, 1).expect(201);
      const { token } = await credenciais();
      const r1 = await ctx
        .http()
        .post('/api/integracao/v1/pedidos')
        .set(auth(token))
        .set('Idempotency-Key', 'pedido-sku-invalido')
        .send({ idExterno: 'X1', itens: [{ sku: 'NAO-EXISTE', quantidade: 1 }] })
        .expect(422);
      expect(r1.body.detalhes.skus).toEqual(['NAO-EXISTE']);
      const r2 = await ctx
        .http()
        .post('/api/integracao/v1/pedidos')
        .set(auth(token))
        .set('Idempotency-Key', 'pedido-sem-saldo')
        .send({ idExterno: 'X2', itens: [{ sku: 'SEM-MILHO-01', quantidade: 5 }] })
        .expect(409);
      expect(r2.body.codigo).toBe('SALDO_INSUFICIENTE');
    });
  });

  describe('webhooks do CRM (HMAC)', () => {
    async function segredo() {
      return (
        await ctx
          .http()
          .post('/api/v1/integracao/crm/segredos/entrada')
          .set(auth(admin))
          .expect(200)
      ).body.segredo as string;
    }
    function enviar(corpo: object, chave: string, ts = Math.floor(Date.now() / 1000).toString()) {
      const bruto = JSON.stringify(corpo);
      return ctx
        .http()
        .post('/api/integracao/v1/webhooks/crm')
        .set('Content-Type', 'application/json')
        .set('X-Estoque-Timestamp', ts)
        .set('X-Estoque-Assinatura', assinar(chave, ts, bruto))
        .send(bruto);
    }

    it('aceita evento assinado, deduplica e processa pedido.criado e pedido.cancelado', async () => {
      const cen = await cenarioBasico(ctx, admin);
      await entrada(ctx, admin, cen.produto.id, cen.local.id, 10).expect(201);
      const chave = await segredo();
      const evento = {
        id: 'evt-0001',
        tipo: 'pedido.criado',
        ocorridoEm: new Date().toISOString(),
        dados: { idExterno: 'CRM-WH-1', itens: [{ sku: 'SEM-MILHO-01', quantidade: 3 }] },
      };
      const r1 = await enviar(evento, chave).expect(202);
      expect(r1.body).toMatchObject({ recebido: true, duplicado: false });
      const r2 = await enviar(evento, chave).expect(202);
      expect(r2.body.duplicado).toBe(true);

      const recebido = await ctx.prisma.eventoRecebido.findFirstOrThrow({
        where: { eventoId: 'evt-0001' },
      });
      await ctx.app.get(WebhooksService).processar(recebido.id);
      expect(await saldo(ctx, cen.produto.id, cen.local.id)).toEqual({
        quantidade: 10,
        reservado: 3,
      });

      await enviar(
        {
          id: 'evt-0002',
          tipo: 'pedido.cancelado',
          ocorridoEm: new Date().toISOString(),
          dados: { idExterno: 'CRM-WH-1', motivo: 'Cliente desistiu' },
        },
        chave,
      ).expect(202);
      const cancel = await ctx.prisma.eventoRecebido.findFirstOrThrow({
        where: { eventoId: 'evt-0002' },
      });
      await ctx.app.get(WebhooksService).processar(cancel.id);
      expect(await saldo(ctx, cen.produto.id, cen.local.id)).toEqual({
        quantidade: 10,
        reservado: 0,
      });
      expect(
        (await ctx.prisma.eventoRecebido.findUniqueOrThrow({ where: { id: cancel.id } })).status,
      ).toBe('PROCESSADO');
    });

    it('recusa assinatura inválida, timestamp antigo e webhook não configurado', async () => {
      const evento = {
        id: 'evt-x',
        tipo: 'cliente.atualizado',
        ocorridoEm: new Date().toISOString(),
        dados: { clienteId: C1 },
      };
      await enviar(evento, 'qualquer').expect(503);
      const chave = await segredo();
      await enviar(evento, 'segredo-errado').expect(401);
      const antigo = (Math.floor(Date.now() / 1000) - 3600).toString();
      await enviar(evento, chave, antigo).expect(401);
      await enviar(evento, chave).expect(202);
    });
  });

  describe('alertas automáticos', () => {
    it('estoque abaixo do mínimo, esgotado e resolução automática', async () => {
      const cen = await cenarioBasico(ctx, admin);
      const e = (await entrada(ctx, admin, cen.produto.id, cen.local.id, 4).expect(201)).body;
      const alertas = ctx.app.get(AlertasService);
      await alertas.avaliarMovimentacao(e.id);
      // mínimo = 5; disponível 4 → abaixo do mínimo + reposição
      expect(
        await ctx.prisma.notificacao.count({ where: { tipo: 'ESTOQUE_MINIMO', resolvida: false } }),
      ).toBe(1);
      expect(
        await ctx.prisma.notificacao.count({ where: { tipo: 'REPOSICAO', resolvida: false } }),
      ).toBe(1);

      const s = (
        await ctx
          .http()
          .post('/api/v1/movimentacoes/saidas')
          .set(auth(admin))
          .send({
            motivo: 'VENDA',
            itens: [{ produtoId: cen.produto.id, localId: cen.local.id, quantidade: 4 }],
          })
          .expect(201)
      ).body;
      await alertas.avaliarMovimentacao(s.id);
      expect(
        await ctx.prisma.notificacao.count({
          where: { tipo: 'ESTOQUE_ESGOTADO', resolvida: false },
        }),
      ).toBe(1);
      expect(
        await ctx.prisma.notificacao.count({ where: { tipo: 'ESTOQUE_MINIMO', resolvida: false } }),
      ).toBe(0);

      const e2 = (await entrada(ctx, admin, cen.produto.id, cen.local.id, 50).expect(201)).body;
      await alertas.avaliarMovimentacao(e2.id);
      expect(
        await ctx.prisma.notificacao.count({
          where: {
            resolvida: false,
            tipo: { in: ['ESTOQUE_ESGOTADO', 'ESTOQUE_MINIMO', 'REPOSICAO'] },
          },
        }),
      ).toBe(0);

      // Saída que consome a maior parte do saldo é atípica
      const grande = (
        await ctx
          .http()
          .post('/api/v1/movimentacoes/saidas')
          .set(auth(admin))
          .send({
            motivo: 'PERDA',
            observacao: 'Lote molhado',
            itens: [{ produtoId: cen.produto.id, localId: cen.local.id, quantidade: 45 }],
          })
          .expect(201)
      ).body;
      await alertas.avaliarMovimentacao(grande.id);
      const atipica = await ctx.prisma.notificacao.findFirst({
        where: { tipo: 'MOVIMENTACAO_ATIPICA', entidadeId: grande.id },
      });
      expect(atipica?.mensagem).toMatch(/consumiu 90% do saldo/);

      const lista = (
        await ctx.http().get('/api/v1/notificacoes?naoLidas=true').set(auth(admin)).expect(200)
      ).body;
      expect(lista.total).toBeGreaterThan(0);
      expect(CriptoService.sha256('x')).toHaveLength(64);
    });
  });
});
