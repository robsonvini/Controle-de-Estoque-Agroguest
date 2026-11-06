import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  auth,
  cenarioBasico,
  conciliacaoOk,
  criarApp,
  criarUsuarioLogado,
  entrada,
  limparBanco,
  saldo,
  type Contexto,
} from './helpers';

describe('Fluxos de negócio: pedidos, compras e inventário', () => {
  let ctx: Contexto;
  let token: string;
  let c: Awaited<ReturnType<typeof cenarioBasico>>;

  beforeAll(async () => {
    ctx = await criarApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await limparBanco(ctx.prisma);
    ({ token } = await criarUsuarioLogado(ctx, 'Gestor de Estoque'));
    c = await cenarioBasico(ctx, token);
  });

  it('pedido reserva, impede venda do reservado, confirma baixando e cancela liberando', async () => {
    await entrada(ctx, token, c.produto.id, c.local.id, 10).expect(201);
    const pedido = (
      await ctx
        .http()
        .post('/api/v1/pedidos')
        .set(auth(token))
        .send({ itens: [{ produtoId: c.produto.id, localId: c.local.id, quantidade: 7 }] })
        .expect(201)
    ).body;
    expect(pedido.status).toBe('RESERVADO');
    expect(await saldo(ctx, c.produto.id, c.local.id)).toEqual({ quantidade: 10, reservado: 7 });

    // Apenas 3 disponíveis para saída avulsa
    await ctx
      .http()
      .post('/api/v1/movimentacoes/saidas')
      .set(auth(token))
      .send({
        motivo: 'VENDA',
        itens: [{ produtoId: c.produto.id, localId: c.local.id, quantidade: 4 }],
      })
      .expect(409);

    const confirmado = (
      await ctx.http().post(`/api/v1/pedidos/${pedido.id}/confirmar`).set(auth(token)).expect(200)
    ).body;
    expect(confirmado.status).toBe('CONFIRMADO');
    expect(confirmado.movimentacoes).toHaveLength(1);
    expect(await saldo(ctx, c.produto.id, c.local.id)).toEqual({ quantidade: 3, reservado: 0 });

    // Confirmar de novo é idempotente (não baixa duas vezes)
    await ctx.http().post(`/api/v1/pedidos/${pedido.id}/confirmar`).set(auth(token)).expect(200);
    expect(await saldo(ctx, c.produto.id, c.local.id)).toEqual({ quantidade: 3, reservado: 0 });
    // Pedido confirmado não pode ser cancelado
    await ctx
      .http()
      .post(`/api/v1/pedidos/${pedido.id}/cancelar`)
      .set(auth(token))
      .send({ motivo: 'desistência' })
      .expect(422);

    const p2 = (
      await ctx
        .http()
        .post('/api/v1/pedidos')
        .set(auth(token))
        .send({ itens: [{ produtoId: c.produto.id, localId: c.local.id, quantidade: 2 }] })
        .expect(201)
    ).body;
    await ctx
      .http()
      .post(`/api/v1/pedidos/${p2.id}/cancelar`)
      .set(auth(token))
      .send({ motivo: 'Cliente desistiu' })
      .expect(200);
    expect(await saldo(ctx, c.produto.id, c.local.id)).toEqual({ quantidade: 3, reservado: 0 });
    expect(await conciliacaoOk(ctx)).toBe(true);
  });

  it('reservas concorrentes não ultrapassam o disponível', async () => {
    await entrada(ctx, token, c.produto.id, c.local.id, 5).expect(201);
    const respostas = await Promise.all(
      Array.from({ length: 12 }, () =>
        ctx
          .http()
          .post('/api/v1/pedidos')
          .set(auth(token))
          .send({ itens: [{ produtoId: c.produto.id, localId: c.local.id, quantidade: 1 }] }),
      ),
    );
    expect(respostas.filter((r) => r.status === 201)).toHaveLength(5);
    expect(await saldo(ctx, c.produto.id, c.local.id)).toEqual({ quantidade: 5, reservado: 5 });
  });

  it('compra: envio, recebimento parcial e total com custo do pedido', async () => {
    const compra = (
      await ctx
        .http()
        .post('/api/v1/compras')
        .set(auth(token))
        .send({
          fornecedorId: c.fornecedor.id,
          itens: [{ produtoId: c.produto.id, quantidade: 20, precoUnitario: 12.5 }],
        })
        .expect(201)
    ).body;
    // Rascunho não pode ser recebido
    await ctx
      .http()
      .post(`/api/v1/compras/${compra.id}/recebimentos`)
      .set(auth(token))
      .send({ itens: [{ itemId: compra.itens[0].id, localId: c.local.id, quantidade: 5 }] })
      .expect(422);
    await ctx.http().post(`/api/v1/compras/${compra.id}/enviar`).set(auth(token)).expect(200);

    const r1 = await ctx
      .http()
      .post(`/api/v1/compras/${compra.id}/recebimentos`)
      .set(auth(token))
      .send({
        numeroDocumento: 'NF-1001',
        itens: [{ itemId: compra.itens[0].id, localId: c.local.id, quantidade: 8 }],
      })
      .expect(201);
    expect(r1.body.pedido.status).toBe('PARCIALMENTE_RECEBIDO');
    // Não aceita receber mais que o pendente (12)
    await ctx
      .http()
      .post(`/api/v1/compras/${compra.id}/recebimentos`)
      .set(auth(token))
      .send({ itens: [{ itemId: compra.itens[0].id, localId: c.local.id, quantidade: 13 }] })
      .expect(422);
    const r2 = await ctx
      .http()
      .post(`/api/v1/compras/${compra.id}/recebimentos`)
      .set(auth(token))
      .send({
        numeroDocumento: 'NF-1002',
        itens: [{ itemId: compra.itens[0].id, localId: c.local2.id, quantidade: 12 }],
      })
      .expect(201);
    expect(r2.body.pedido.status).toBe('RECEBIDO');

    const produto = await ctx.prisma.produto.findUniqueOrThrow({ where: { id: c.produto.id } });
    expect(Number(produto.custoMedio)).toBe(12.5);
    expect(await saldo(ctx, c.produto.id, c.local.id)).toEqual({ quantidade: 8, reservado: 0 });
    expect(await saldo(ctx, c.produto.id, c.local2.id)).toEqual({ quantidade: 12, reservado: 0 });

    // Estorno de um recebimento reabre o pedido
    await ctx
      .http()
      .post(`/api/v1/movimentacoes/${r1.body.movimentacaoId}/estorno`)
      .set(auth(token))
      .send({ justificativa: 'NF cancelada' })
      .expect(201);
    const compraAtual = (
      await ctx.http().get(`/api/v1/compras/${compra.id}`).set(auth(token)).expect(200)
    ).body;
    expect(compraAtual.status).toBe('PARCIALMENTE_RECEBIDO');
    expect(Number(compraAtual.itens[0].quantidadePendente)).toBe(8);
  });

  it('inventário: contagem cega, divergência, ajuste com aprovação segregada', async () => {
    await entrada(ctx, token, c.produto.id, c.local.id, 10).expect(201);
    const { token: operador } = await criarUsuarioLogado(ctx, 'Operador de Estoque');

    const inv = (
      await ctx
        .http()
        .post('/api/v1/inventarios')
        .set(auth(operador))
        .send({ descricao: 'Inventário mensal DEP-01', localId: c.local.id })
        .expect(201)
    ).body;
    expect(inv.contagemCega).toBe(true);
    expect(inv.itens[0].quantidadeSistema).toBeNull();
    // Não permite dois inventários abertos no mesmo local
    await ctx
      .http()
      .post('/api/v1/inventarios')
      .set(auth(operador))
      .send({ descricao: 'Outro', localId: c.local.id })
      .expect(422);

    await ctx
      .http()
      .post(`/api/v1/inventarios/${inv.id}/contagens`)
      .set(auth(operador))
      .send({ itens: [{ itemId: inv.itens[0].id, quantidadeContada: 8 }] })
      .expect(200);
    const revisao = (
      await ctx
        .http()
        .post(`/api/v1/inventarios/${inv.id}/concluir-contagem`)
        .set(auth(operador))
        .expect(200)
    ).body;
    expect(revisao.status).toBe('EM_REVISAO');
    expect(Number(revisao.itens[0].divergencia)).toBe(-2);

    const { ajusteId } = (
      await ctx
        .http()
        .post(`/api/v1/inventarios/${inv.id}/solicitar-ajuste`)
        .set(auth(operador))
        .send({ justificativa: 'Quebra identificada na contagem' })
        .expect(200)
    ).body;
    expect(ajusteId).toBeTruthy();

    // Operador não aprova; o gestor aprova
    await ctx.http().post(`/api/v1/ajustes/${ajusteId}/aprovar`).set(auth(operador)).expect(403);
    const aprovado = (
      await ctx.http().post(`/api/v1/ajustes/${ajusteId}/aprovar`).set(auth(token)).expect(200)
    ).body;
    expect(aprovado.status).toBe('APROVADO');
    expect(await saldo(ctx, c.produto.id, c.local.id)).toEqual({ quantidade: 8, reservado: 0 });
    const final = (
      await ctx.http().get(`/api/v1/inventarios/${inv.id}`).set(auth(token)).expect(200)
    ).body;
    expect(final.status).toBe('FINALIZADO');
    expect(await conciliacaoOk(ctx)).toBe(true);
  });

  it('quem solicita o ajuste não pode aprová-lo (segregação de funções)', async () => {
    await entrada(ctx, token, c.produto.id, c.local.id, 10).expect(201);
    const ajuste = (
      await ctx
        .http()
        .post('/api/v1/ajustes')
        .set(auth(token))
        .send({
          justificativa: 'Sobra encontrada',
          itens: [{ produtoId: c.produto.id, localId: c.local.id, quantidadeDelta: 2 }],
        })
        .expect(201)
    ).body;
    const r = await ctx
      .http()
      .post(`/api/v1/ajustes/${ajuste.id}/aprovar`)
      .set(auth(token))
      .expect(422);
    expect(r.body.detail).toMatch(/segregação/);
    expect(await saldo(ctx, c.produto.id, c.local.id)).toEqual({ quantidade: 10, reservado: 0 });
  });
});
