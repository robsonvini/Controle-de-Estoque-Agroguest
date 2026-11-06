# Publicação na AWS

A infraestrutura é declarada em Terraform (`infra/terraform`) e o deploy é feito pelo GitHub Actions
(`.github/workflows/deploy.yml`).

## Arquitetura na nuvem

| Recurso                           | Uso                                                                                                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VPC em 2 zonas de disponibilidade | Sub-redes públicas (ALB, NAT) e privadas (ECS, RDS); endpoint S3                                                                                                            |
| ALB + ACM + WAF                   | HTTPS (TLS 1.2/1.3), redirecionamento HTTP→HTTPS, `/api/*` para a API; regras gerenciadas da AWS (OWASP comum, SQLi, entradas maliciosas, reputação de IP) e limite por IP  |
| ECS Fargate (ARM64)               | Serviços `api`, `worker` e `web` + tarefa avulsa `migracao`; deploy contínuo com rollback automático (circuit breaker) e autoescala por CPU                                 |
| RDS PostgreSQL 17                 | Criptografia KMS, SSL obrigatório, backups automáticos com PITR, Multi-AZ em produção, Performance Insights                                                                 |
| S3                                | Imagens: privado, versionado, KMS, somente TLS, ciclo de vida para versões antigas                                                                                          |
| Secrets Manager                   | `DATABASE_URL`, segredos JWT, `CRYPTO_KEY` e senha do administrador inicial                                                                                                 |
| ECR                               | Imagens imutáveis com varredura de vulnerabilidades                                                                                                                         |
| CloudWatch + Route 53 + SNS       | Logs estruturados, health check externo e alarmes (disponibilidade, 5xx, latência, alvos saudáveis, CPU, disco e conexões do banco, erros da aplicação) enviados por e-mail |

## Ambientes

| Ambiente        | Branch    | Terraform           | Características                                                                                   |
| --------------- | --------- | ------------------- | ------------------------------------------------------------------------------------------------- |
| Desenvolvimento | `develop` | `ambientes/dev`     | Custo mínimo, sem proteção de exclusão                                                            |
| Homologação     | `homolog` | `ambientes/homolog` | Espelho reduzido da produção; varredura OWASP ZAP após cada deploy                                |
| Produção        | `main`    | `ambientes/prod`    | Multi-AZ, NAT por zona, backups de 35 dias replicados em outra região, aprovação manual no GitHub |

Cada ambiente tem conta ou VPC, banco, segredos e domínio próprios. Nenhum dado é compartilhado
entre eles.

## Primeira publicação

1. **Pré-requisitos:**
   - zona no Route 53 para o domínio;
   - bucket S3 para o estado do Terraform (com versionamento);
   - identidade verificada no SES, se houver e-mail.
2. **Papel de deploy (uma vez por conta):**

   ```bash
   cd infra/terraform/global
   terraform init && terraform apply -var="repositorio=agrogest/estoque"
   ```

   Cadastre cada ARN de saída como segredo `AWS_ROLE_ARN` no **Environment** correspondente do
   GitHub (`desenvolvimento`, `homologacao`, `producao`). Configure também as variáveis
   `URL_APLICACAO`, `URL_HOMOLOGACAO` e `AWS_REGION`, e exija revisores no ambiente `producao`.

3. **Infraestrutura do ambiente:**

   ```bash
   cd infra/terraform/ambientes/prod
   cp terraform.tfvars.example terraform.tfvars        # ajuste domínio, zona, e-mails e URL do CRM
   terraform init -backend-config=../backend.hcl -backend-config="key=estoque/prod.tfstate"
   terraform plan -out plano && terraform apply plano
   ```

4. **Primeiro deploy:** faça push na branch do ambiente. O pipeline:
   - publica as imagens ARM64 no ECR;
   - executa a tarefa de migração (`prisma migrate deploy` + seed de referência);
   - atualiza os serviços e aguarda a estabilidade;
   - valida `/api/health/pronto`.
5. **Administrador inicial:** a senha está no Secrets Manager (saída `segredo_admin_inicial`), e a
   troca é obrigatória no primeiro acesso.

   ```bash
   aws secretsmanager get-secret-value --secret-id <arn> --query SecretString --output text
   ```

## Deploys seguintes

Basta fazer merge via Pull Request na branch do ambiente. As migrations precisam ser
retrocompatíveis, porque a versão anterior continua atendendo até o fim do deploy. Se uma nova
revisão não ficar saudável, o ECS faz o rollback automaticamente.

## Backups e recuperação de desastres

| Mecanismo                  | Configuração                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| Backups automáticos do RDS | Diários, com PITR (restauração para qualquer segundo da janela): 3, 7 e 35 dias (dev, homolog e prod) |
| Réplica de backups         | Produção: backups automáticos replicados em outra região (`regiao_dr`, padrão us-east-1)              |
| Snapshot final             | Criado na exclusão da instância (homologação e produção)                                              |
| S3                         | Versionamento (recupera arquivos sobrescritos ou excluídos por 90 dias)                               |
| Infraestrutura             | Recriável integralmente pelo Terraform                                                                |

**Procedimento de recuperação** (perda da região principal), com alvos de RPO ≤ 5 min (PITR) e
RTO ≈ 1–2 h:

1. Restaure o banco na região DR a partir do backup replicado:

   ```bash
   aws rds restore-db-instance-to-point-in-time \
     --source-db-instance-automated-backups-arn <arn> --target-db-instance-identifier estoque-prod-dr \
     --use-latest-restorable-time --region us-east-1
   ```

2. Aplique o Terraform do ambiente com `regiao=us-east-1`, apontando o segredo `DATABASE_URL`
   para a instância restaurada.
3. Publique as imagens (pipeline) e atualize o DNS, que a saída do Terraform já aponta para o
   novo ALB.

Teste o procedimento de restauração em homologação pelo menos a cada semestre.

## Monitoramento e operação

- **Logs:** CloudWatch Logs `/ecs/estoque-<ambiente>/{api,worker,web,migracao}`, em JSON
  estruturado, com `X-Request-Id` e sem dados sensíveis.
- **Disponibilidade:** health check do Route 53 em 3 regiões contra `/api/health/pronto`.
- **Alarmes:** chegam por e-mail (SNS). Confirme a assinatura recebida após o primeiro `apply`.
- **Saúde funcional:** a tela **Integração CRM** mostra falhas de sincronização, eventos pendentes e
  tarefas com falha; `GET /api/v1/estoque/conciliacao` confirma a consistência do estoque.
