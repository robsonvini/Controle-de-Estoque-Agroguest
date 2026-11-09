# Estoque Agrogest

Sistema web de gestão e controle de estoque integrado ao **CRM Agrogest**. Cobre produtos,
entradas, saídas, transferências, compras, pedidos de venda com reserva, inventário com ajustes
aprovados, fornecedores, alertas, relatórios com exportação em PDF e Excel e integração com o CRM
por API, com idempotência e webhooks assinados.

- **Backend:** NestJS 11, Prisma 7, PostgreSQL 17 e worker de fila no próprio PostgreSQL.
- **Frontend:** Next.js 16 (React 19), TanStack Query, React Hook Form e Tailwind 4, com acessibilidade WCAG 2.2 AA.
- **Compartilhado:** schemas Zod 4, a mesma validação no navegador e no servidor.
- **Nuvem:** AWS (ECS Fargate, RDS, S3, ALB com WAF, Secrets Manager e CloudWatch), via Terraform.

## Sistema publicado

Acesse <https://estoque-web-fyeb.onrender.com>. O acesso exige login, e as credenciais são
fornecidas individualmente pelo responsável do projeto.

O sistema está no plano gratuito do Render, que hiberna por inatividade: o primeiro acesso pode
levar alguns minutos.

## Início rápido (desenvolvimento)

Requisitos: Node.js 22.12 ou superior (testado no 24), Docker e Git.

```bash
npm install
npm run infra:up                       # PostgreSQL, armazenamento S3 local e Mailpit
cp .env.example apps/api/.env          # gere segredos novos (instruções no próprio arquivo)
npm run db:deploy && npm run db:seed   # migrations e dados de referência + administrador inicial
npm run dev                            # API :3333, worker, web :3000
```

Acesse <http://localhost:3000> com o administrador definido em `SEED_ADMIN_EMAIL` e
`SEED_ADMIN_SENHA`. A troca de senha é exigida no primeiro acesso. A documentação interativa da
API fica em <http://localhost:3333/api/docs>.

## Estrutura

```
apps/api            API REST + worker (NestJS, Prisma)
apps/web            Interface web (Next.js)
packages/shared     Schemas, enums, permissões e formatação compartilhados
tools/crm-test-client  Cliente de teste que simula o CRM consumindo a API de integração
infra/              Docker Compose, Dockerfiles e Terraform (AWS)
tests/perf          Teste de carga (k6)
docs/               Documentação técnica, OpenAPI e manual do usuário
```

## Scripts principais

| Comando                              | Descrição                                                           |
| ------------------------------------ | ------------------------------------------------------------------- |
| `npm run dev`                        | Sobe API, worker e web em modo de desenvolvimento                   |
| `npm run build`                      | Compila todos os pacotes                                            |
| `npm run lint` / `npm run typecheck` | Análise estática                                                    |
| `npm test`                           | Testes unitários e de integração (exige o PostgreSQL do `infra:up`) |
| `npm run test:e2e`                   | Testes de interface e de acessibilidade (Playwright + axe)          |
| `npm run db:migrate`                 | Cria e aplica uma nova migration (desenvolvimento)                  |
| `npm run db:deploy`                  | Aplica as migrations pendentes (homologação e produção)             |

## Documentação

| Documento                                        | Conteúdo                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| [docs/arquitetura.md](docs/arquitetura.md)       | Visão geral, componentes, decisões e fluxos                      |
| [docs/modelo-dados.md](docs/modelo-dados.md)     | Modelo relacional, regras de integridade e auditoria             |
| [docs/integracao-crm.md](docs/integracao-crm.md) | Análise do CRM, mapeamento, contrato da API e webhooks           |
| [docs/api.md](docs/api.md)                       | Convenções da API REST e [OpenAPI](docs/openapi.json)            |
| [docs/instalacao.md](docs/instalacao.md)         | Instalação, configuração, execução e manutenção                  |
| [docs/deploy-aws.md](docs/deploy-aws.md)         | Publicação na AWS, ambientes, backups e recuperação de desastres |
| [docs/deploy-render.md](docs/deploy-render.md)   | Publicação alternativa no Render com PostgreSQL                  |
| [docs/seguranca-lgpd.md](docs/seguranca-lgpd.md) | Controles de segurança e adequação à LGPD                        |
| [docs/testes.md](docs/testes.md)                 | Estratégia de testes e como executá-los                          |
| [docs/manual-usuario.md](docs/manual-usuario.md) | Manual de utilização                                             |
| [CONTRIBUTING.md](CONTRIBUTING.md)               | Branches, commits, Pull Requests e revisão de código             |
| [CHANGELOG.md](CHANGELOG.md)                     | Histórico de versões                                             |
