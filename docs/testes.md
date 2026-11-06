# Testes e qualidade

| Tipo                      | Ferramenta                                                                      | Onde                                                         | Comando                                                             |
| ------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| Unitários                 | Vitest                                                                          | `packages/shared/src/*.test.ts`, `apps/api/src/**/*.spec.ts` | `npm test -w @estoque/shared` · `npm run test:unit -w @estoque/api` |
| Integração e API          | Vitest + Supertest + **PostgreSQL real**                                        | `apps/api/test/*.int.test.ts`                                | `npm run test:integration -w @estoque/api`                          |
| Sincronização com o CRM   | CRM simulado com o contrato real                                                | `apps/api/test/integracao-crm.int.test.ts`                   | idem                                                                |
| Interface (E2E)           | Playwright                                                                      | `apps/web/e2e`                                               | `npm run test:e2e`                                                  |
| Acessibilidade            | axe-core (WCAG 2.2 A/AA)                                                        | `apps/web/e2e`                                               | idem                                                                |
| Desempenho e concorrência | k6                                                                              | `tests/perf/estoque.k6.js`                                   | veja abaixo                                                         |
| Segurança                 | npm audit, varredura do ECR, OWASP ZAP, testes de RBAC, rate limit, CSRF e HMAC | CI e testes                                                  | `npm audit --omit=dev`                                              |
| Contrato da API           | Geração do OpenAPI testada                                                      | `apps/api/test/openapi.int.test.ts`                          | idem                                                                |

Os testes de integração usam o banco **`estoque_test`**, criado pelo `infra:up`. As migrations e o
seed de referência são aplicados automaticamente antes da suíte, e as tabelas de negócio são
limpas a cada teste. Os dados de desenvolvimento nunca são tocados.

## Cobertura das regras críticas

**Concorrência:**

- 50 saídas simultâneas sobre saldo 10: exatamente 10 sucessos e 40 recusas (409), com saldo final
  0 e conciliação consistente.
- Entradas, saídas e transferências misturadas em paralelo terminam com o saldo igual ao do ledger.
- Reservas concorrentes nunca ultrapassam o disponível.

**Idempotência:**

- A mesma chave executa uma única vez; conteúdo diferente com a mesma chave retorna 422.
- 10 envios simultâneos da mesma chave geram uma única baixa.
- Um `idExterno` repetido devolve o pedido original.

**Imutabilidade:** `UPDATE` e `DELETE` no livro-razão são rejeitados pelo banco, e um saldo negativo
é rejeitado pelo `CHECK`.

**Custo médio:** cálculo ponderado e reversão no estorno.

**Fluxos:**

- Pedido: reserva → confirmação (baixa única) → cancelamento com liberação.
- Compra: envio → recebimento parcial e total → estorno, que reabre o pedido.
- Inventário: contagem cega → divergência → ajuste aprovado por outro usuário.

**Segurança:**

- Matriz de autorização (401 e 403 por perfil).
- Rotação e reuso de refresh token.
- CSRF, bloqueio de conta, rate limit e mensagens sem enumeração de usuários.
- RFC 7807 com mensagens em português.

**Integração:**

- Sincronização de clientes: criação, atualização e remoção, registros inválidos, 5xx com
  retentativas, timeout, resposta não-JSON, cabeçalho de autenticação e alerta de falha.
- OAuth e escopos; webhooks com assinatura, replay e deduplicação.

**Interface:**

- Login.
- Navegação por teclado (link para pular ao conteúdo).
- Fluxo local → produto → entrada → saída (incluindo a recusa por saldo insuficiente).
- 13 telas sem violações WCAG 2.2 AA.
- Layout em celular.

## Teste de desempenho

```bash
# API apontando para o banco de testes, com o rate limit global elevado (todos os VUs saem do mesmo IP)
PORT=3334 DATABASE_URL=postgresql://estoque:estoque_dev@localhost:5432/estoque_test RATE_LIMIT_POR_MINUTO=1000000 \
  node apps/api/dist/main.js &
docker run --rm -i -e BASE=http://host.docker.internal:3334 -e EMAIL=<admin> -e SENHA=<senha> \
  grafana/k6 run - < tests/perf/estoque.k6.js
```

Resultado de referência (Docker Desktop no Windows, 35 VUs por 30 s, ~460 req/s):

| Cenário                  | Resultado                       |
| ------------------------ | ------------------------------- |
| Consultas                | p95 de 57 ms, 0% de erro        |
| Baixas distribuídas      | p95 de 355 ms, 100% registradas |
| Disputa pelo mesmo saldo | 100% corretas                   |
| Conciliação final        | Consistente                     |

As baixas do **mesmo** produto no **mesmo** local são serializadas por design, para manter a
garantia de saldo não negativo. A vazão nesse ponto de disputa é de dezenas de baixas por segundo.

## Testes manuais recomendados antes da publicação

1. Login, troca de senha obrigatória e logout em todas as abas.
2. Cadastro de produto com imagem (texto alternativo) e busca por código de barras (leitor USB).
3. Entrada por compra (pedido de compra → recebimento parcial → recebimento total).
4. Saída por venda e por perda; saldo e alertas no dashboard atualizados sem recarregar.
5. Inventário com divergência → ajuste → aprovação por outro usuário.
6. Integração: teste de conexão, sincronização manual e `tools/crm-test-client` contra homologação.
7. Exportação de cada relatório em PDF e Excel.
8. Navegação completa só por teclado e com leitor de tela (NVDA ou VoiceOver) nas telas principais.
