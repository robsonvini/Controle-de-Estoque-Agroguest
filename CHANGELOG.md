# Histórico de alterações

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o versionamento,
[SemVer](https://semver.org/lang/pt-BR/).

## [0.1.0] — 2026-11-06

Primeira versão funcional.

### Adicionado

- **Cadastros:** produtos (SKU, código de barras, imagens, preços, mínimo e máximo, localização),
  categorias com subcategorias, unidades de medida, locais hierárquicos e fornecedores com contatos.
- **Motor de estoque:**
  - saldo por produto e local, com reserva;
  - livro-razão imutável e estornos;
  - custo médio ponderado;
  - idempotência e proteção contra concorrência.
- **Movimentações:** entradas (compra, recebimento, devolução de cliente, ajuste positivo), saídas
  (venda, consumo interno, perda, avaria, devolução ao fornecedor) e transferências.
- **Compras:** pedidos com recebimento parcial e total. **Vendas:** pedidos com reserva,
  confirmação (baixa) e cancelamento.
- **Inventário:** contagem cega, divergências e ajustes com aprovação segregada.
- **Integração com o CRM Agrogest:**
  - espelho de clientes sincronizado;
  - API OAuth 2.0 com escopos (catálogo, saldos, pedidos);
  - webhooks HMAC de entrada e de saída;
  - logs, retentativas, circuit breaker e alertas.
- **Alertas:** estoque mínimo, esgotado, reposição, movimentação atípica, divergência, ajuste
  pendente e falha de sincronização. Notificações na aplicação e por e-mail.
- **Dashboard** com indicadores e gráficos acessíveis; **9 relatórios** com exportação em PDF e Excel.
- **Segurança:**
  - Argon2id, refresh token rotativo com detecção de reuso e CSRF;
  - bloqueio por tentativas e rate limit;
  - RBAC com 35 permissões e 6 perfis;
  - auditoria imutável e LGPD (acesso, portabilidade, anonimização e retenção).
- **Interface** responsiva em conformidade com a WCAG 2.2 AA (verificada com axe).
- **Testes:**
  - unitários;
  - de integração com PostgreSQL real, incluindo concorrência;
  - E2E e de acessibilidade com Playwright;
  - de carga com k6;
  - cliente de teste do CRM.
- **Infraestrutura:** Docker, GitHub Actions (CI e deploy por branch via OIDC) e Terraform para a
  AWS (ECS Fargate, RDS, S3, ALB, WAF, Secrets Manager, CloudWatch, recuperação de desastres).
