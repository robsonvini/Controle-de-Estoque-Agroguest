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

describe('Motor de estoque (integração com PostgreSQL)', () => {
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

  it('entrada atualiza saldo e custo médio ponderado', async () => {
    await entrada(ctx, token, c.produto.id, c.local.id, 10, 10, c.fornecedor.id).expect(201);
    await entrada(ctx, token, c.produto.id, c.local.id, 30, 14, c.fornecedor.id).expect(201);
    expect(await saldo(ctx, c.produto.id, c.local.id)).toEqual({ quantidade: 40, reservado: 0 });
    const p = await ctx.prisma.produto.findUniqueOrThrow({ where: { id: c.produto.id } });
    // (10*10 + 30*14) / 40 = 13
    expect(Number(p.custoMedio)).toBe(13);
    expect(await conciliacaoOk(ctx)).toBe(true);
  });

  it('saída sem saldo suficiente é rejeitada com 409 e saldo intacto', async () => {
    await entrada(ctx, token, c.produto.id, c.local.id, 3).expect(201);
    const res = await ctx
      .http()
      .post('/api/v1/movimentacoes/saidas')
      .set(auth(token))
      .send({
        motivo: 'CONSUMO_INTERNO',
        destino: 'Campo experimental',
        itens: [{ produtoId: c.produto.id, localId: c.local.id, quantidade: 5 }],
      })
      .expect(409);
    expect(res.body.codigo).toBe('SALDO_INSUFICIENTE');
    expect(res.body.detalhes.disponivel).toBe('3');
    expect(await saldo(ctx, c.produto.id, c.local.id)).toEqual({ quantidade: 3, reservado: 0 });
  });

  it('50 saídas simultâneas sobre saldo 10: exatamente 10 sucessos, saldo nunca negativo', async () => {
    await entrada(ctx, token, c.produto.id, c.local.id, 10).expect(201);
    const requisicoes = Array.from({ length: 50 }, () =>
      ctx
        .http()
        .post('/api/v1/movimentacoes/saidas')
        .set(auth(token))
        .send({
          motivo: 'VENDA',
          itens: [{ produtoId: c.produto.id, localId: c.local.id, quantidade: 1 }],
        }),
    );
    const respostas = await Promise.all(requisicoes);
    const sucessos = respostas.filter((r) => r.status === 201).length;
    const recusas = respostas.filter((r) => r.status === 409).length;
    expect(sucessos).toBe(10);
    expect(recusas).toBe(40);
    expect(await saldo(ctx, c.produto.id, c.local.id)).toEqual({ quantidade: 0, reservado: 0 });
    expect(await conciliacaoOk(ctx)).toBe(true);
  });

  it('entradas, saídas e transferências concorrentes mantêm saldo igual ao livro-razão', async () => {
    await entrada(ctx, token, c.produto.id, c.local.id, 100).expect(201);
    const ops = [];
    for (let i = 0; i < 20; i++) {
      ops.push(entrada(ctx, token, c.produto.id, c.local.id, 2));
      ops.push(
        ctx
          .http()
          .post('/api/v1/movimentacoes/saidas')
          .set(auth(token))
          .send({
            motivo: 'VENDA',
            itens: [{ produtoId: c.produto.id, localId: c.local.id, quantidade: 3 }],
          }),
      );
      ops.push(
        ctx
          .http()
          .post('/api/v1/movimentacoes/transferencias')
          .set(auth(token))
          .send({
            localOrigemId: c.local.id,
            localDestinoId: c.local2.id,
            itens: [{ produtoId: c.produto.id, quantidade: 1 }],
          }),
      );
    }
    const respostas = await Promise.all(ops);
    expect(respostas.every((r) => r.status === 201)).toBe(true);
    // 100 + 20*2 - 20*3 - 20*1 = 60 no local 1; 20 no local 2
    expect(await saldo(ctx, c.produto.id, c.local.id)).toEqual({ quantidade: 60, reservado: 0 });
    expect(await saldo(ctx, c.produto.id, c.local2.id)).toEqual({ quantidade: 20, reservado: 0 });
    expect(await conciliacaoOk(ctx)).toBe(true);
  });

  it('livro-razão é imutável no banco (UPDATE e DELETE bloqueados por trigger)', async () => {
    const mov = (await entrada(ctx, token, c.produto.id, c.local.id, 5).expect(201)).body;
    await expect(
      ctx.prisma
        .$executeRaw`UPDATE movimentacoes SET observacao = 'adulterado' WHERE id = ${mov.id}::uuid`,
    ).rejects.toThrow(/imutável/);
    await expect(
      ctx.prisma
        .$executeRaw`DELETE FROM movimentacao_itens WHERE movimentacao_id = ${mov.id}::uuid`,
    ).rejects.toThrow(/imutável/);
    await expect(ctx.prisma.$executeRaw`UPDATE saldos_estoque SET quantidade = -1`).rejects.toThrow(
      /ck_saldo/,
    );
  });

  it('idempotência: mesma chave executa uma vez; conteúdo diferente é recusado', async () => {
    const corpo = {
      motivo: 'VENDA',
      itens: [{ produtoId: c.produto.id, localId: c.local.id, quantidade: 1 }],
    };
    await entrada(ctx, token, c.produto.id, c.local.id, 10).expect(201);
    const chave = 'baixa-pedido-crm-0001';
    const r1 = await ctx
      .http()
      .post('/api/v1/movimentacoes/saidas')
      .set(auth(token))
      .set('Idempotency-Key', chave)
      .send(corpo)
      .expect(201);
    const r2 = await ctx
      .http()
      .post('/api/v1/movimentacoes/saidas')
      .set(auth(token))
      .set('Idempotency-Key', chave)
      .send(corpo)
      .expect(201);
    expect(r2.headers['idempotent-replayed']).toBe('true');
    expect(r2.body.id).toBe(r1.body.id);
    expect(await saldo(ctx, c.produto.id, c.local.id)).toEqual({ quantidade: 9, reservado: 0 });
    const r3 = await ctx
      .http()
      .post('/api/v1/movimentacoes/saidas')
      .set(auth(token))
      .set('Idempotency-Key', chave)
      .send({ ...corpo, itens: [{ ...corpo.itens[0], quantidade: 2 }] })
      .expect(422);
    expect(r3.body.codigo).toBe('IDEMPOTENCIA_CONFLITO');
  });

  it('idempotência sob concorrência: 10 envios simultâneos da mesma chave geram uma única baixa', async () => {
    await entrada(ctx, token, c.produto.id, c.local.id, 10).expect(201);
    const corpo = {
      motivo: 'VENDA',
      itens: [{ produtoId: c.produto.id, localId: c.local.id, quantidade: 1 }],
    };
    const respostas = await Promise.all(
      Array.from({ length: 10 }, () =>
        ctx
          .http()
          .post('/api/v1/movimentacoes/saidas')
          .set(auth(token))
          .set('Idempotency-Key', 'chave-concorrente-01')
          .send(corpo),
      ),
    );
    expect(respostas.every((r) => [201, 409].includes(r.status))).toBe(true);
    expect(await saldo(ctx, c.produto.id, c.local.id)).toEqual({ quantidade: 9, reservado: 0 });
  });

  it('estorno reverte saldo e custo, preserva o original e não pode ser repetido', async () => {
    await entrada(ctx, token, c.produto.id, c.local.id, 10, 10, c.fornecedor.id).expect(201);
    const mov = (
      await entrada(ctx, token, c.produto.id, c.local.id, 10, 20, c.fornecedor.id).expect(201)
    ).body;
    let p = await ctx.prisma.produto.findUniqueOrThrow({ where: { id: c.produto.id } });
    expect(Number(p.custoMedio)).toBe(15);

    const est = await ctx
      .http()
      .post(`/api/v1/movimentacoes/${mov.id}/estorno`)
      .set(auth(token))
      .send({ justificativa: 'NF lançada em duplicidade' })
      .expect(201);
    expect(est.body.tipo).toBe('ESTORNO');
    expect(est.body.estornoDe.id).toBe(mov.id);
    expect(await saldo(ctx, c.produto.id, c.local.id)).toEqual({ quantidade: 10, reservado: 0 });
    p = await ctx.prisma.produto.findUniqueOrThrow({ where: { id: c.produto.id } });
    expect(Number(p.custoMedio)).toBe(10);

    await ctx
      .http()
      .post(`/api/v1/movimentacoes/${mov.id}/estorno`)
      .set(auth(token))
      .send({ justificativa: 'de novo' })
      .expect(422);
    expect(await conciliacaoOk(ctx)).toBe(true);
  });

  it('respeita as casas decimais da unidade de medida', async () => {
    await entrada(ctx, token, c.produtoKg.id, c.local.id, 12.5).expect(201);
    const r = await ctx
      .http()
      .post('/api/v1/movimentacoes/saidas')
      .set(auth(token))
      .send({
        motivo: 'VENDA',
        itens: [{ produtoId: c.produto.id, localId: c.local.id, quantidade: 0.5 }],
      })
      .expect(422);
    expect(r.body.detail).toMatch(/casa\(s\) decimal/);
  });

  it('operador não pode estornar nem fazer ajuste positivo direto (RBAC)', async () => {
    const { token: tokenOperador } = await criarUsuarioLogado(ctx, 'Operador de Estoque');
    const mov = (await entrada(ctx, tokenOperador, c.produto.id, c.local.id, 5).expect(201)).body;
    await ctx
      .http()
      .post(`/api/v1/movimentacoes/${mov.id}/estorno`)
      .set(auth(tokenOperador))
      .send({ justificativa: 'x' })
      .expect(403);
    await ctx
      .http()
      .post('/api/v1/movimentacoes/entradas')
      .set(auth(tokenOperador))
      .send({
        motivo: 'AJUSTE_POSITIVO',
        observacao: 'sobra',
        itens: [{ produtoId: c.produto.id, localId: c.local.id, quantidade: 1 }],
      })
      .expect(403);
    const { token: tokenConsulta } = await criarUsuarioLogado(ctx, 'Consulta');
    await entrada(ctx, tokenConsulta, c.produto.id, c.local.id, 1).expect(403);
    await ctx.http().get('/api/v1/estoque/saldos').set(auth(tokenConsulta)).expect(200);
  });

  it('produto inativo não recebe entradas', async () => {
    await ctx.prisma.produto.update({ where: { id: c.produto.id }, data: { status: 'INATIVO' } });
    const r = await entrada(ctx, token, c.produto.id, c.local.id, 1).expect(422);
    expect(r.body.detail).toMatch(/inativo/);
  });
});
