#!/usr/bin/env node
/**
 * Cliente de teste da API de integração (simula o CRM Agrogest).
 *
 * Executa, contra um Estoque em execução, o fluxo completo de uma venda:
 *   1. OAuth 2.0 client credentials (token)
 *   2. Catálogo e consulta de saldo por SKU
 *   3. Criação de pedido com Idempotency-Key (reserva de estoque)
 *   4. Reenvio do mesmo pedido (prova de idempotência: sem nova reserva)
 *   5. Confirmação da venda (baixa automática) e nova consulta de saldo
 *   6. (Opcional) Webhook assinado com HMAC-SHA256 — evento cliente.atualizado
 *
 * Uso:
 *   ESTOQUE_URL=http://localhost:3333 CLIENT_ID=cli_... CLIENT_SECRET=sk_... SKU=SEM-MILHO-01 \
 *   [QUANTIDADE=1] [CLIENTE_CRM_ID=<uuid>] [WEBHOOK_SEGREDO=whsec_...] node cliente.mjs
 *
 * Saída: relatório passo a passo; código de saída 0 em sucesso, 1 em falha.
 */
import { createHmac, randomUUID } from 'node:crypto';

const cfg = {
  url: (process.env.ESTOQUE_URL ?? 'http://localhost:3333').replace(/\/+$/, ''),
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  sku: process.env.SKU,
  quantidade: Number(process.env.QUANTIDADE ?? 1),
  clienteCrmId: process.env.CLIENTE_CRM_ID,
  webhookSegredo: process.env.WEBHOOK_SEGREDO,
};

const base = `${cfg.url}/api/integracao/v1`;
let passo = 0;
const ok = (msg, extra) => console.log(`✔ ${++passo}. ${msg}${extra ? `\n     ${extra}` : ''}`);
const falhar = (msg, detalhe) => {
  console.error(`✖ ${++passo}. ${msg}`);
  if (detalhe)
    console.error(`     ${typeof detalhe === 'string' ? detalhe : JSON.stringify(detalhe)}`);
  process.exit(1);
};

async function chamar(metodo, caminho, { token, corpo, cabecalhos = {} } = {}) {
  const r = await fetch(`${base}${caminho}`, {
    method: metodo,
    headers: {
      Accept: 'application/json',
      ...(corpo !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...cabecalhos,
    },
    body:
      corpo === undefined ? undefined : typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
  const texto = await r.text();
  let json;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = texto;
  }
  return { status: r.status, json, cabecalhos: r.headers };
}

async function main() {
  console.log(`Cliente de teste da integração CRM → Estoque\nAPI: ${base}\n`);
  if (!cfg.clientId || !cfg.clientSecret)
    falhar('Defina CLIENT_ID e CLIENT_SECRET (gere em Integração CRM → Clientes de API).');
  if (!cfg.sku) falhar('Defina SKU com um produto que tenha saldo disponível.');

  // 1. Token
  const t = await chamar('POST', '/oauth/token', {
    corpo: {
      grant_type: 'client_credentials',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    },
  });
  if (t.status !== 200) falhar('Falha ao obter token', t.json);
  const token = t.json.access_token;
  ok('Token OAuth 2.0 obtido', `escopos: ${t.json.scope} · expira em ${t.json.expires_in} s`);

  // 2. Catálogo e saldo
  const cat = await chamar('GET', '/produtos?porPagina=5', { token });
  if (cat.status !== 200) falhar('Falha ao consultar catálogo', cat.json);
  ok(
    'Catálogo consultado',
    `${cat.json.total} produto(s) ativo(s); primeiros: ${cat.json.dados.map((p) => p.sku).join(', ')}`,
  );

  const s1 = await chamar('GET', `/produtos/${encodeURIComponent(cfg.sku)}/saldo`, { token });
  if (s1.status !== 200) falhar(`SKU ${cfg.sku} não encontrado`, s1.json);
  const disponivelAntes = Number(s1.json.disponivel);
  ok(
    `Saldo de ${cfg.sku}`,
    `disponível ${disponivelAntes} ${s1.json.unidade} · por local: ${JSON.stringify(s1.json.porLocal)}`,
  );
  if (disponivelAntes < cfg.quantidade)
    falhar(`Saldo insuficiente para o teste (necessário ${cfg.quantidade}).`);

  // 3. Pedido com idempotência
  const idExterno = `TESTE-CRM-${Date.now()}`;
  const chave = randomUUID();
  const pedido = {
    idExterno,
    ...(cfg.clienteCrmId && { clienteCrmId: cfg.clienteCrmId }),
    observacao: 'Pedido gerado pelo cliente de teste da integração',
    itens: [{ sku: cfg.sku, quantidade: cfg.quantidade }],
  };
  const p1 = await chamar('POST', '/pedidos', {
    token,
    corpo: pedido,
    cabecalhos: { 'Idempotency-Key': chave },
  });
  if (p1.status !== 201) falhar('Falha ao criar pedido', p1.json);
  ok(
    `Pedido ${idExterno} criado (HTTP 201)`,
    `status ${p1.json.status} · itens: ${p1.json.itens.map((i) => `${i.sku}@${i.localCodigo}=${i.quantidade}`).join(', ')}`,
  );

  // 4. Reenvio: mesma chave devolve a mesma resposta; nova chave com mesmo idExterno não duplica
  const p2 = await chamar('POST', '/pedidos', {
    token,
    corpo: pedido,
    cabecalhos: { 'Idempotency-Key': chave },
  });
  if (p2.cabecalhos.get('idempotent-replayed') !== 'true' || p2.json.id !== p1.json.id)
    falhar('Idempotência por chave não funcionou', p2.json);
  const p3 = await chamar('POST', '/pedidos', {
    token,
    corpo: pedido,
    cabecalhos: { 'Idempotency-Key': randomUUID() },
  });
  if (p3.status !== 200 || p3.json.id !== p1.json.id || !p3.json.jaExistia)
    falhar('Deduplicação por idExterno não funcionou', p3.json);
  ok(
    'Reenvios não duplicaram o pedido',
    'mesma chave → resposta reproduzida; mesmo idExterno → pedido existente (HTTP 200)',
  );

  const s2 = await chamar('GET', `/produtos/${encodeURIComponent(cfg.sku)}/saldo`, { token });
  ok(
    'Reserva aplicada',
    `disponível ${disponivelAntes} → ${s2.json.disponivel} (reservado ${s2.json.reservado})`,
  );

  // 5. Confirmação (baixa)
  const c = await chamar('POST', `/pedidos/${idExterno}/confirmar`, {
    token,
    cabecalhos: { 'Idempotency-Key': randomUUID() },
  });
  if (c.status !== 200 || c.json.status !== 'CONFIRMADO')
    falhar('Falha ao confirmar pedido', c.json);
  const c2 = await chamar('POST', `/pedidos/${idExterno}/confirmar`, { token });
  if (c2.status !== 200) falhar('Segunda confirmação deveria ser idempotente', c2.json);
  const s3 = await chamar('GET', `/produtos/${encodeURIComponent(cfg.sku)}/saldo`, { token });
  const esperado = disponivelAntes - cfg.quantidade;
  if (Number(s3.json.disponivel) !== esperado)
    falhar(`Saldo após baixa diverge: esperado ${esperado}, obtido ${s3.json.disponivel}`);
  ok('Venda confirmada e estoque baixado uma única vez', `disponível final ${s3.json.disponivel}`);

  // 6. Webhook assinado (opcional)
  if (cfg.webhookSegredo && cfg.clienteCrmId) {
    const corpo = JSON.stringify({
      id: `evt-${randomUUID()}`,
      tipo: 'cliente.atualizado',
      ocorridoEm: new Date().toISOString(),
      dados: { clienteId: cfg.clienteCrmId },
    });
    const ts = Math.floor(Date.now() / 1000).toString();
    const assinatura = `sha256=${createHmac('sha256', cfg.webhookSegredo).update(`${ts}.${corpo}`).digest('hex')}`;
    const w = await chamar('POST', '/webhooks/crm', {
      corpo,
      cabecalhos: { 'X-Estoque-Timestamp': ts, 'X-Estoque-Assinatura': assinatura },
    });
    if (w.status !== 202) falhar('Webhook recusado', w.json);
    const invalido = await chamar('POST', '/webhooks/crm', {
      corpo,
      cabecalhos: { 'X-Estoque-Timestamp': ts, 'X-Estoque-Assinatura': 'sha256=00' },
    });
    if (invalido.status !== 401)
      falhar('Webhook com assinatura inválida deveria ser recusado', invalido.json);
    ok('Webhook assinado aceito (202) e assinatura inválida recusada (401)');
  } else {
    console.log('• Webhook não testado (defina WEBHOOK_SEGREDO e CLIENTE_CRM_ID para incluir).');
  }

  console.log('\nResultado: integração validada com sucesso.');
}

main().catch((e) => falhar('Erro inesperado', e.message));
