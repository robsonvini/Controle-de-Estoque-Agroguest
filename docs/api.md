# API REST

A especificação completa (OpenAPI 3) está em [`openapi.json`](openapi.json). A documentação
interativa (Swagger UI) é servida em `/api/docs`. Para regenerar o arquivo:

```bash
npm run build -w @estoque/api && npm run openapi:export -w @estoque/api
```

## Superfícies

| Prefixo                             | Público                     | Autenticação                                              |
| ----------------------------------- | --------------------------- | --------------------------------------------------------- |
| `/api/v1/*`                         | Interface web e usuários    | Bearer JWT de usuário (15 min) + refresh token em cookie  |
| `/api/integracao/v1/*`              | CRM e outros sistemas       | OAuth 2.0 client credentials (escopos); webhooks com HMAC |
| `/api/health`, `/api/health/pronto` | Balanceador e monitoramento | Pública                                                   |

## Convenções

- **JSON**, campos em camelCase. Quantidades e valores monetários são devolvidos como **texto
  decimal** (ex.: `"12.5000"`), para não perder precisão. Datas em ISO 8601 UTC.
- **Paginação:** `?pagina=1&porPagina=20&busca=…&ordenarPor=…&ordem=asc|desc`. A resposta tem o
  formato `{ dados, total, pagina, porPagina, totalPaginas }`.
- **Erros (RFC 7807, `application/problem+json`):**

  ```json
  {
    "type": "https://estoque.agrogest/erros/validacao",
    "title": "Requisição inválida",
    "status": 400,
    "detail": "Os dados enviados são inválidos.",
    "codigo": "VALIDACAO",
    "erros": [{ "campo": "itens.0.quantidade", "mensagem": "A quantidade deve ser maior que zero" }]
  }
  ```

  | Status | Códigos frequentes                                                                      |
  | ------ | --------------------------------------------------------------------------------------- |
  | 400    | `VALIDACAO`, `IDEMPOTENCIA_OBRIGATORIA`                                                 |
  | 401    | `NAO_AUTENTICADO`, `invalid_token`                                                      |
  | 403    | `PROIBIDO`, `CSRF`, `insufficient_scope`                                                |
  | 404    | `NAO_ENCONTRADO`                                                                        |
  | 409    | `SALDO_INSUFICIENTE`, `DUPLICADO`, `IDEMPOTENCIA_EM_PROCESSAMENTO`, `REGISTRO_IMUTAVEL` |
  | 422    | `REGRA_DE_NEGOCIO`, `IDEMPOTENCIA_CONFLITO`, `SEGREGACAO_FUNCOES`                       |
  | 429    | `LIMITE_REQUISICOES`, `CONTA_BLOQUEADA`                                                 |

- **Idempotência:** as operações que alteram o estoque aceitam `Idempotency-Key` (8 a 100
  caracteres); na API de integração, `POST /pedidos` a exige.
  - Uma repetição devolve a resposta original, com o cabeçalho `Idempotent-Replayed: true`.
  - A mesma chave com outro corpo retorna `422`.
  - As chaves expiram em 24 h.
- **Rastreabilidade:** cada resposta traz `X-Request-Id`, que aparece nos logs estruturados.

## Autenticação de usuários

| Rota                                       | Descrição                                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/v1/auth/login`                  | `{ email, senha }` → `{ accessToken, expiraEm, usuario }`. Grava os cookies `estoque_rt` (httpOnly, `SameSite=Strict`, path `/api/v1/auth`) e `estoque_csrf` |
| `POST /api/v1/auth/refresh`                | Exige o cabeçalho `X-CSRF-Token` igual ao cookie `estoque_csrf`. Rotaciona o refresh token; o reuso de um token rotacionado revoga a sessão inteira          |
| `POST /api/v1/auth/logout`                 | Revoga a sessão e limpa os cookies                                                                                                                           |
| `GET /api/v1/auth/me`                      | Perfil e permissões do usuário                                                                                                                               |
| `POST /api/v1/auth/trocar-senha`           | Encerra as demais sessões                                                                                                                                    |
| `GET`, `DELETE /api/v1/auth/sessoes[/:id]` | Sessões ativas                                                                                                                                               |

## Principais recursos (`/api/v1`)

| Recurso          | Rotas                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Produtos         | `GET/POST /produtos`, `GET/PUT /produtos/:id`, `GET /produtos/codigo/:codigo`, `GET /produtos/:id/kardex`, `POST/DELETE /produtos/:id/imagens[/:imagemId]`          |
| Cadastros        | `/categorias` (+ `/categorias/arvore`), `/unidades`, `/locais`, `/fornecedores` (+ `/:id/compras`)                                                                  |
| Movimentações    | `POST /movimentacoes/entradas`, `/saidas`, `/transferencias`, `/:id/estorno`; `GET /movimentacoes[/:id]`                                                            |
| Estoque          | `GET /estoque/saldos`, `GET /estoque/conciliacao`                                                                                                                   |
| Compras          | `/compras`, `/compras/:id/enviar`, `/cancelar`, `/recebimentos`                                                                                                     |
| Pedidos de venda | `/pedidos`, `/pedidos/:id/confirmar`, `/cancelar`                                                                                                                   |
| Inventário       | `/inventarios`, `/:id/contagens`, `/concluir-contagem`, `/reabrir`, `/solicitar-ajuste`, `/cancelar`                                                                |
| Ajustes          | `/ajustes`, `/ajustes/:id/aprovar`, `/rejeitar`                                                                                                                     |
| Clientes (CRM)   | `GET /clientes[/:id]`                                                                                                                                               |
| Integração       | `/integracao/crm` (painel e configuração), `/crm/testar`, `/crm/sincronizar`, `/crm/segredos/:tipo`, `/execucoes`, `/logs`, `/eventos`, `/tarefas`, `/clientes-api` |
| Gestão           | `/dashboard`, `/relatorios/:tipo?formato=json\|pdf\|xlsx`, `/notificacoes`, `/configuracoes`, `/auditoria`, `/usuarios`, `/perfis`, `/lgpd`                         |

A API de integração está descrita em [integracao-crm.md](integracao-crm.md).
