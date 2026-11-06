# Instalação, configuração, execução e manutenção

## Requisitos

- Node.js 22.12 ou superior (testado no 24) e npm 10 ou superior
- Docker com Docker Compose (PostgreSQL, armazenamento S3 local e Mailpit)
- Git

## Instalação (desenvolvimento)

```bash
git clone <repositório> estoque-agrogest && cd estoque-agrogest
npm install                       # instala todos os workspaces e os hooks do Git (husky)
npm run infra:up                  # PostgreSQL :5432, s3mock :9090, Mailpit SMTP :2525 / UI :8026
cp .env.example apps/api/.env     # depois gere os segredos (veja abaixo)
npm run db:deploy                 # aplica as migrations
npm run db:seed                   # dados de referência + administrador inicial
npm run dev                       # API :3333, worker, web :3000
```

O contêiner do PostgreSQL cria também o banco `estoque_test`, usado pelos testes automatizados.

## Configuração (`apps/api/.env`)

Todas as variáveis estão comentadas em [`.env.example`](../.env.example). As essenciais:

| Variável                                           | Descrição                                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                     | Conexão PostgreSQL                                                                                                                                |
| `JWT_ACCESS_SECRET`, `JWT_INTEGRACAO_SECRET`       | Segredos aleatórios com 32 ou mais caracteres. Gere com `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`          |
| `CRYPTO_KEY`                                       | 32 bytes em base64, para cifrar credenciais de integração. Gere com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `COOKIE_SECURE`                                    | `true` sempre que houver HTTPS. Obrigatório em produção: a API não inicia sem ele                                                                 |
| `WEB_ORIGIN`                                       | URL pública do frontend                                                                                                                           |
| `S3_*`                                             | Armazenamento de imagens. Na AWS, deixe `S3_ENDPOINT` e as chaves vazios e use a role da tarefa                                                   |
| `EMAIL_HABILITADO`, `SMTP_*`                       | Envio de alertas por e-mail                                                                                                                       |
| `CRM_BASE_URL`                                     | URL inicial da API do CRM. Depois disso, a configuração é mantida pela tela **Integração CRM**                                                    |
| `SEED_ADMIN_*`                                     | Administrador inicial, criado só se não existir                                                                                                   |
| `RATE_LIMIT_POR_MINUTO`, `LOGIN_LIMITE_POR_MINUTO` | Limites por IP (padrão: 600 requisições/min e 10 logins/min)                                                                                      |

> **Nunca versione** o arquivo `.env`. Em homologação e produção os segredos vêm do AWS Secrets
> Manager (veja [deploy-aws.md](deploy-aws.md)).

## Execução

| Modo                                 | Comando                                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desenvolvimento (recarga automática) | `npm run dev`                                                                                                                                                                         |
| Somente API / somente worker         | `npm run dev -w @estoque/api` / `npm run dev:worker -w @estoque/api`                                                                                                                  |
| Produção local (build)               | `npm run build`, depois `npm run start -w @estoque/api`, `npm run start:worker -w @estoque/api` e `npm run start -w @estoque/web`                                                     |
| Contêineres (imagens de produção)    | `docker compose -f infra/docker-compose.yml -f infra/docker-compose.app.yml up -d --build`, com `JWT_*`, `CRYPTO_KEY` e `SEED_ADMIN_SENHA` exportadas; acesse <http://localhost:8080> |

> O **worker** precisa estar em execução para alertas, e-mails, webhooks e a sincronização
> automática com o CRM. Sem ele, as tarefas ficam na fila (tabela `tarefas`) e são processadas
> quando o worker subir.

## Primeiros passos após a instalação

1. Entre com o administrador inicial e troque a senha.
2. Crie locais de armazenamento, em **Estoque → Locais**, e categorias.
3. Cadastre fornecedores e produtos.
4. Em **Integração CRM**, informe a URL do CRM, ative a integração e clique em
   **Sincronizar agora**.
5. Crie usuários com perfis adequados em **Usuários e permissões**.

## Manutenção

| Tarefa                           | Como                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Atualizar o schema               | Altere `apps/api/prisma/schema.prisma`, depois `npm run db:migrate -- --name descricao`                 |
| Regras SQL (CHECK, trigger)      | `npx prisma migrate dev --create-only --name ...` no `apps/api`, edite o SQL e aplique                  |
| Conferir consistência do estoque | `GET /api/v1/estoque/conciliacao` (deve retornar `consistente: true`)                                   |
| Reprocessar falhas               | **Integração CRM → Fila de processamento / Eventos**                                                    |
| Retenção (LGPD)                  | Automática, todos os dias às 03:30, conforme **Configurações → Retenção**                               |
| Atualizar dependências           | `npm outdated`, atualização, depois `npm run lint && npm run typecheck && npm test && npm run test:e2e` |
| Exportar o OpenAPI               | `npm run openapi:export -w @estoque/api`                                                                |
| Backup local                     | `docker exec estoque-agrogest-postgres-1 pg_dump -U estoque -Fc estoque > backup.dump`                  |
| Restaurar backup local           | `docker exec -i estoque-agrogest-postgres-1 pg_restore -U estoque -d estoque --clean < backup.dump`     |

## Solução de problemas

| Sintoma                                              | Causa provável                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `Configuração de ambiente inválida` ao iniciar a API | Variável ausente ou inválida; a mensagem lista os campos                             |
| Login responde 429                                   | Rate limit de login ou conta bloqueada por tentativas (desbloqueie em **Usuários**)  |
| Sincronização falha com "Circuito aberto"            | O CRM ficou indisponível em 5 tentativas seguidas; uma nova tentativa ocorre em 60 s |
| Alertas não aparecem                                 | O worker não está em execução                                                        |
| Imagens não carregam em desenvolvimento              | O contêiner `s3` não está no ar (`npm run infra:up`)                                 |
