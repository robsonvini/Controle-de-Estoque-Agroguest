/**
 * Teste de desempenho e consistência sob carga (k6).
 *
 * Cenários simultâneos:
 *  - consultas:  listagem de produtos e de saldos (leitura intensa)
 *  - baixas:     saídas concorrentes distribuídas (cada VU baixa um produto/local diferente)
 *  - disputa:    saídas concorrentes do MESMO produto/local — mede a correção sob disputa
 *                (as baixas são serializadas por design para o saldo nunca ficar negativo)
 * Ao final, verifica a conciliação saldo materializado × livro-razão.
 *
 * Execução (API de teste com RATE_LIMIT_POR_MINUTO elevado — todos os VUs saem do mesmo IP):
 *   docker run --rm -i -e BASE=http://host.docker.internal:3334 -e EMAIL=... -e SENHA=... \
 *     grafana/k6 run - < tests/perf/estoque.k6.js
 */
import http from 'k6/http';
import { check, fail } from 'k6';

const BASE = `${__ENV.BASE || 'http://localhost:3334'}/api/v1`;
const VUS_BAIXAS = 10;

export const options = {
  scenarios: {
    consultas: { executor: 'constant-vus', vus: 20, duration: '30s', exec: 'consultas' },
    baixas: { executor: 'constant-vus', vus: VUS_BAIXAS, duration: '30s', exec: 'baixas' },
    disputa: { executor: 'constant-vus', vus: 5, duration: '30s', exec: 'disputa' },
  },
  thresholds: {
    'http_req_duration{cenario:consulta}': ['p(95)<300'],
    'http_req_duration{cenario:baixa}': ['p(95)<500'],
    'http_req_failed{cenario:consulta}': ['rate<0.01'],
    'checks{cenario:baixa}': ['rate>0.99'],
    'checks{cenario:disputa}': ['rate>0.99'],
  },
};

function json(r) {
  try {
    return r.json();
  } catch {
    return {};
  }
}

export function setup() {
  const login = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email: __ENV.EMAIL, senha: __ENV.SENHA }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  );
  if (login.status !== 200) fail(`login falhou: ${login.status}`);
  const token = json(login).accessToken;
  const h = { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } };
  const sufixo = Date.now();
  const un = json(http.get(`${BASE}/unidades?porPagina=50`, h)).dados.find((u) => u.sigla === 'UN');
  const local = json(
    http.post(
      `${BASE}/locais`,
      JSON.stringify({ codigo: `PERF-${sufixo}`, nome: 'Local de carga', tipo: 'DEPOSITO' }),
      h,
    ),
  );

  // Um produto por VU de baixas + um produto disputado
  const produtos = [];
  for (let i = 0; i <= VUS_BAIXAS; i++) {
    const p = json(
      http.post(
        `${BASE}/produtos`,
        JSON.stringify({
          codigoInterno: `P${sufixo}-${i}`,
          sku: `PERF-${sufixo}-${i}`,
          nome: `Produto de carga ${i}`,
          unidadeMedidaId: un.id,
          precoCusto: 1,
        }),
        h,
      ),
    );
    produtos.push(p.id);
  }
  const entrada = http.post(
    `${BASE}/movimentacoes/entradas`,
    JSON.stringify({
      motivo: 'DEVOLUCAO_CLIENTE',
      itens: produtos.map((id) => ({
        produtoId: id,
        localId: local.id,
        quantidade: 100000,
        custoUnitario: 1,
      })),
    }),
    h,
  );
  if (entrada.status !== 201) fail(`entrada inicial falhou: ${entrada.status} ${entrada.body}`);
  return { token, produtos, localId: local.id };
}

function saida(d, produtoId, cenario) {
  return http.post(
    `${BASE}/movimentacoes/saidas`,
    JSON.stringify({
      motivo: 'CONSUMO_INTERNO',
      destino: 'Teste de carga',
      itens: [{ produtoId, localId: d.localId, quantidade: 1 }],
    }),
    {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${d.token}` },
      tags: { cenario },
    },
  );
}

export function consultas(d) {
  const h = { headers: { Authorization: `Bearer ${d.token}` }, tags: { cenario: 'consulta' } };
  check(
    http.get(`${BASE}/produtos?porPagina=25&busca=PERF`, h),
    { 'listagem de produtos 200': (r) => r.status === 200 },
    { cenario: 'consulta' },
  );
  check(
    http.get(`${BASE}/estoque/saldos?porPagina=50`, h),
    { 'saldos 200': (r) => r.status === 200 },
    { cenario: 'consulta' },
  );
}

export function baixas(d) {
  const produtoId = d.produtos[(__VU - 1) % VUS_BAIXAS];
  check(
    saida(d, produtoId, 'baixa'),
    { 'baixa distribuída 201': (r) => r.status === 201 },
    { cenario: 'baixa' },
  );
}

export function disputa(d) {
  check(
    saida(d, d.produtos[VUS_BAIXAS], 'disputa'),
    { 'baixa disputada 201': (r) => r.status === 201 },
    { cenario: 'disputa' },
  );
}

export function teardown(d) {
  const h = { headers: { Authorization: `Bearer ${d.token}` } };
  const c = json(http.get(`${BASE}/estoque/conciliacao`, h));
  check(c, { 'saldo materializado = livro-razão': (x) => x.consistente === true });
  console.log(`Conciliação saldo × livro-razão consistente: ${c.consistente}`);
}
