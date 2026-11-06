import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/configurar-app';
import { AuthService } from '../src/modules/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

export const SENHA_TESTE = 'Senha@Forte123';

export interface Contexto {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
}

export async function criarApp(): Promise<Contexto> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = modulo.createNestApplication({ logger: false, rawBody: true });
  configurarApp(app);
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  return { app, prisma: app.get(PrismaService), http: () => request(url) };
}

/** Limpa os dados de negócio, preservando os dados de referência do seed. */
export async function limparBanco(prisma: PrismaService) {
  for (let tentativa = 1; ; tentativa++) {
    try {
      await truncar(prisma);
      break;
    } catch (e) {
      if (tentativa >= 5 || !/deadlock|40P01/.test(String(e))) throw e;
      await new Promise((r) => setTimeout(r, 200 * tentativa));
    }
  }
  await prisma.perfil.deleteMany({ where: { sistema: false } });
  await prisma.integracao.updateMany({
    data: {
      ativo: false,
      falhasConsecutivas: 0,
      webhookEntradaSegredoCifrado: null,
      webhookSaidaAtivo: false,
    },
  });
}

async function truncar(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      notificacao_leituras, notificacoes, tarefas, chaves_idempotencia, integracao_eventos_recebidos,
      integracao_logs, integracao_execucoes, clientes_api, ajuste_itens, ajustes, inventario_itens,
      inventarios, reservas, pedido_itens, pedidos, crm_clientes, pedidos_compra_itens, pedidos_compra,
      saidas, entradas, movimentacao_itens, movimentacoes, saldos_estoque, produto_fornecedores,
      fornecedor_contatos, fornecedores, produto_imagens, produtos, locais_armazenamento, categorias,
      logs_auditoria, sessoes, usuarios
    RESTART IDENTITY CASCADE`);
}

/** Cria usuário com o perfil indicado e devolve um access token. */
export async function criarUsuarioLogado(ctx: Contexto, perfilNome: string, email?: string) {
  const perfil = await ctx.prisma.perfil.findUniqueOrThrow({ where: { nome: perfilNome } });
  const usuario = await ctx.prisma.usuario.create({
    data: {
      nome: `${perfilNome} Teste`,
      email: email ?? `${randomUUID().slice(0, 8)}@teste.local`,
      perfilId: perfil.id,
      senhaHash: await hash(SENHA_TESTE),
    },
  });
  // Emite a sessão pelo serviço (o login HTTP e seu rate limit são testados em auth.int.test.ts)
  const sessao = await ctx.app
    .get(AuthService)
    .login({ email: usuario.email, senha: SENHA_TESTE }, {});
  return { usuario, token: sessao.accessToken };
}

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Cadastros mínimos para os testes de estoque (criados via API, como um usuário faria). */
export async function cenarioBasico(ctx: Contexto, token: string) {
  const unidade = await ctx.prisma.unidadeMedida.findUniqueOrThrow({ where: { sigla: 'UN' } });
  const kg = await ctx.prisma.unidadeMedida.findUniqueOrThrow({ where: { sigla: 'KG' } });
  const local = (
    await ctx
      .http()
      .post('/api/v1/locais')
      .set(auth(token))
      .send({ codigo: 'DEP-01', nome: 'Depósito 1', tipo: 'DEPOSITO' })
      .expect(201)
  ).body;
  const local2 = (
    await ctx
      .http()
      .post('/api/v1/locais')
      .set(auth(token))
      .send({ codigo: 'DEP-02', nome: 'Depósito 2', tipo: 'DEPOSITO' })
      .expect(201)
  ).body;
  const fornecedor = (
    await ctx
      .http()
      .post('/api/v1/fornecedores')
      .set(auth(token))
      .send({
        tipoPessoa: 'PJ',
        documento: '11.222.333/0001-81',
        razaoSocial: 'Fornecedor Teste Ltda',
      })
      .expect(201)
  ).body;
  const produto = (
    await ctx
      .http()
      .post('/api/v1/produtos')
      .set(auth(token))
      .send({
        codigoInterno: 'P001',
        sku: 'SEM-MILHO-01',
        nome: 'Semente de milho híbrido',
        unidadeMedidaId: unidade.id,
        precoCusto: 10,
        precoVenda: 15,
        estoqueMinimo: 5,
      })
      .expect(201)
  ).body;
  const produtoKg = (
    await ctx
      .http()
      .post('/api/v1/produtos')
      .set(auth(token))
      .send({
        codigoInterno: 'P002',
        sku: 'ADUBO-NPK',
        nome: 'Adubo NPK',
        unidadeMedidaId: kg.id,
        precoCusto: 4,
      })
      .expect(201)
  ).body;
  return { unidade, local, local2, fornecedor, produto, produtoKg };
}

export function entrada(
  ctx: Contexto,
  token: string,
  produtoId: string,
  localId: string,
  quantidade: number,
  custoUnitario = 10,
  fornecedorId?: string,
) {
  return ctx
    .http()
    .post('/api/v1/movimentacoes/entradas')
    .set(auth(token))
    .send({
      motivo: fornecedorId ? 'RECEBIMENTO' : 'DEVOLUCAO_CLIENTE',
      fornecedorId,
      itens: [{ produtoId, localId, quantidade, custoUnitario }],
    });
}

export async function saldo(ctx: Contexto, produtoId: string, localId: string) {
  const s = await ctx.prisma.saldoEstoque.findUnique({
    where: { produtoId_localId: { produtoId, localId } },
  });
  return { quantidade: Number(s?.quantidade ?? 0), reservado: Number(s?.reservado ?? 0) };
}

export async function conciliacaoOk(ctx: Contexto) {
  const linhas = await ctx.prisma.$queryRaw<unknown[]>`SELECT * FROM vw_conciliacao_saldos`;
  return linhas.length === 0;
}
