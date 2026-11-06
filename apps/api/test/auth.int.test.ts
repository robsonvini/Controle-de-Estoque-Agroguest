import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  auth,
  criarApp,
  criarUsuarioLogado,
  limparBanco,
  SENHA_TESTE,
  type Contexto,
} from './helpers';

function cookie(setCookie: string[] | string | undefined, nome: string) {
  const lista = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const linha = lista.find((c) => c.startsWith(`${nome}=`));
  return linha?.split(';')[0]?.split('=')[1] ?? '';
}

describe('Autenticação e autorização', () => {
  let ctx: Contexto;

  beforeAll(async () => {
    ctx = await criarApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await limparBanco(ctx.prisma);
  });

  it('login, rotação do refresh token e detecção de reuso', async () => {
    const { usuario } = await criarUsuarioLogado(
      ctx,
      'Operador de Estoque',
      'operador@teste.local',
    );
    const login = await ctx
      .http()
      .post('/api/v1/auth/login')
      .send({ email: usuario.email, senha: SENHA_TESTE })
      .expect(200);
    expect(login.body.usuario.permissoes).toContain('saidas:registrar');
    const set = login.headers['set-cookie'] as unknown as string[];
    expect(set.find((c) => c.startsWith('estoque_rt='))).toMatch(/HttpOnly/);
    expect(set.find((c) => c.startsWith('estoque_rt='))).toMatch(/SameSite=Strict/);
    const rt1 = cookie(set, 'estoque_rt');
    const csrf = cookie(set, 'estoque_csrf');

    // Sem cabeçalho CSRF: recusado
    await ctx
      .http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`estoque_rt=${rt1}`, `estoque_csrf=${csrf}`])
      .expect(403);

    const renovado = await ctx
      .http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`estoque_rt=${rt1}`, `estoque_csrf=${csrf}`])
      .set('X-CSRF-Token', csrf)
      .expect(200);
    const rt2 = cookie(renovado.headers['set-cookie'] as unknown as string[], 'estoque_rt');
    expect(rt2).not.toBe(rt1);
    await ctx.http().get('/api/v1/auth/me').set(auth(renovado.body.accessToken)).expect(200);

    // Reuso do token antigo fora da janela de concorrência revoga toda a família
    await ctx.prisma.sessao.updateMany({
      where: { substituidaEm: { not: null } },
      data: { substituidaEm: new Date(Date.now() - 60_000) },
    });
    await ctx
      .http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`estoque_rt=${rt1}`, `estoque_csrf=${csrf}`])
      .set('X-CSRF-Token', csrf)
      .expect(401);
    await ctx
      .http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`estoque_rt=${rt2}`, `estoque_csrf=${csrf}`])
      .set('X-CSRF-Token', csrf)
      .expect(401);
    const reuso = await ctx.prisma.logAuditoria.count({ where: { acao: 'REUSO_REFRESH_TOKEN' } });
    expect(reuso).toBe(1);
  });

  it('bloqueia a conta após tentativas falhas e registra na auditoria', async () => {
    const { usuario } = await criarUsuarioLogado(ctx, 'Consulta', 'consulta@teste.local');
    for (let i = 0; i < 5; i++) {
      await ctx
        .http()
        .post('/api/v1/auth/login')
        .send({ email: usuario.email, senha: 'errada' })
        .expect(401);
    }
    const r = await ctx
      .http()
      .post('/api/v1/auth/login')
      .send({ email: usuario.email, senha: SENHA_TESTE })
      .expect(429);
    expect(r.body.codigo).toBe('CONTA_BLOQUEADA');
    expect(
      await ctx.prisma.logAuditoria.count({ where: { acao: 'BLOQUEIO_POR_TENTATIVAS' } }),
    ).toBe(1);
  });

  it('mensagem genérica para usuário inexistente (sem enumeração)', async () => {
    const r = await ctx
      .http()
      .post('/api/v1/auth/login')
      .send({ email: 'ninguem@teste.local', senha: 'x' })
      .expect(401);
    expect(r.body.detail).toBe('E-mail ou senha inválidos.');
  });

  it('usuário desativado perde o acesso imediatamente', async () => {
    const { token: tokenAdmin } = await criarUsuarioLogado(ctx, 'Administrador');
    const { usuario, token } = await criarUsuarioLogado(ctx, 'Operador de Estoque');
    await ctx.http().get('/api/v1/auth/me').set(auth(token)).expect(200);
    await ctx
      .http()
      .patch(`/api/v1/usuarios/${usuario.id}`)
      .set(auth(tokenAdmin))
      .send({ ativo: false })
      .expect(200);
    await ctx.http().get('/api/v1/auth/me').set(auth(token)).expect(401);
  });

  it('matriz de autorização por perfil', async () => {
    const { token: consulta } = await criarUsuarioLogado(ctx, 'Consulta');
    const { token: comprador } = await criarUsuarioLogado(ctx, 'Comprador');
    await ctx.http().get('/api/v1/produtos').expect(401);
    await ctx.http().get('/api/v1/produtos').set(auth('token-invalido')).expect(401);
    await ctx.http().get('/api/v1/produtos').set(auth(consulta)).expect(200);
    await ctx.http().get('/api/v1/usuarios').set(auth(consulta)).expect(403);
    await ctx.http().post('/api/v1/categorias').set(auth(consulta)).send({ nome: 'X' }).expect(403);
    await ctx.http().get('/api/v1/compras').set(auth(comprador)).expect(200);
    await ctx.http().get('/api/v1/inventarios').set(auth(comprador)).expect(403);
    await ctx.http().get('/api/v1/integracao/crm').set(auth(comprador)).expect(403);
  });

  it('erros seguem RFC 7807 com mensagens em português', async () => {
    const { token } = await criarUsuarioLogado(ctx, 'Administrador');
    const r = await ctx
      .http()
      .post('/api/v1/fornecedores')
      .set(auth(token))
      .send({ tipoPessoa: 'PJ', documento: '123', razaoSocial: '' })
      .expect(400);
    expect(r.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(r.body.erros).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ campo: 'documento', mensagem: 'CNPJ inválido' }),
        expect.objectContaining({ campo: 'razaoSocial', mensagem: 'Campo obrigatório' }),
      ]),
    );
  });

  it('limita tentativas de login por minuto (rate limit)', async () => {
    const respostas = [];
    for (let i = 0; i < 12; i++) {
      respostas.push(
        await ctx
          .http()
          .post('/api/v1/auth/login')
          .send({ email: `x${i}@teste.local`, senha: 'x' }),
      );
    }
    expect(respostas.some((r) => r.status === 429)).toBe(true);
  });
});
