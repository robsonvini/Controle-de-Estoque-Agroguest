# Segurança da informação e LGPD

## Autenticação e sessões

| Controle            | Implementação                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Senhas              | Argon2id (19 MiB, 2 iterações); política com mínimo de 10 caracteres, maiúscula, minúscula, número e símbolo; troca obrigatória no primeiro acesso e após redefinição                |
| Força bruta         | Bloqueio após 5 tentativas (15 min), rate limit de login por IP, mensagem genérica (sem enumeração de usuários) e tempo de resposta equalizado                                       |
| Tokens              | Access JWT de 15 min, mantido só em memória no navegador; refresh token aleatório em cookie `httpOnly`, `Secure`, `SameSite=Strict`, com path restrito, armazenado como hash SHA-256 |
| Rotação             | O refresh token é trocado a cada uso; a reapresentação de um token já rotacionado revoga toda a família de sessões e é registrada na auditoria                                       |
| CSRF                | Double-submit (cookie `estoque_csrf` + cabeçalho `X-CSRF-Token`) nas rotas que usam cookie; as demais exigem Bearer                                                                  |
| Controle de sessões | Listagem e encerramento de sessões; a desativação de usuário, a troca ou redefinição de senha e o logout revogam as sessões, com efeito em até 30 s                                  |
| SSO futuro          | Interface `ProvedorAutenticacao` para OAuth/OIDC do CRM, com `usuarios.provedor_auth` e `id_externo`                                                                                 |

## Autorização

- RBAC com 35 permissões no formato `modulo:acao` e perfis configuráveis. Há 6 perfis padrão:
  Administrador, Gestor de Estoque, Operador, Comprador, Consulta e Auditor.
- Todas as rotas passam pelo guard de autenticação e pelo de permissões. O frontend apenas oculta
  o que o usuário não pode usar; a decisão é sempre do servidor.
- **Segregação de funções:** quem solicita um ajuste não pode aprová-lo, regra validada na API e
  por `CHECK` no banco. Ajustes positivos diretos e estornos exigem permissões de gestor.
- O sistema impede ficar sem administrador ativo.
- Na API de integração, escopos OAuth por cliente e credenciais revogáveis.

## Proteção de dados e da aplicação

| Ameaça                 | Mitigação                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQL Injection          | Prisma parametrizado; SQL bruto apenas com template parametrizado (`Prisma.sql`); ordenação por lista de campos permitidos                        |
| XSS                    | React escapa a saída; CSP restritiva (`frame-ancestors 'none'`, `object-src` bloqueado); sem `dangerouslySetInnerHTML`; e-mails com HTML escapado |
| CSRF                   | `SameSite=Strict` + double-submit + Bearer                                                                                                        |
| Uploads maliciosos     | Tipo validado pelos bytes (JPEG, PNG ou WEBP), limite de 5 MB e 10 imagens; bucket privado com URLs pré-assinadas de 15 min                       |
| Webhooks forjados      | HMAC-SHA256 com comparação em tempo constante, timestamp com janela de 5 min e deduplicação por id                                                |
| Abuso                  | Rate limit por IP na aplicação e no WAF; regras gerenciadas do AWS WAF                                                                            |
| Cabeçalhos             | Helmet (HSTS, nosniff, Referrer-Policy etc.); `X-Powered-By` removido                                                                             |
| Validação              | Toda entrada validada no servidor com Zod (os mesmos schemas do frontend); erros sem detalhes internos                                            |
| Segredos               | Variáveis de ambiente em desenvolvimento e Secrets Manager na AWS; credenciais de integração cifradas no banco (AES-256-GCM); `.env` fora do Git  |
| Dados em trânsito      | TLS 1.2+ no ALB, SSL obrigatório no RDS e política de bucket que exige TLS                                                                        |
| Dados em repouso       | KMS no RDS, S3, ECR, logs e segredos                                                                                                              |
| Dependências           | `npm audit` no CI, varredura de imagens no ECR e OWASP ZAP em homologação                                                                         |
| Integridade do estoque | Livro-razão imutável (triggers), CHECKs, transações e conciliação                                                                                 |

## Registro de atividades (auditoria)

- `logs_auditoria` registra login, falha de login, bloqueio, reuso de token, CRUD de cadastros,
  movimentações, aprovações, exportações de relatório, configurações e ações LGPD. Cada registro
  traz o usuário ou cliente de API, o IP, o user agent e os dados relevantes.
- Campos sensíveis (senha, token, segredo, hash, CPF) são omitidos automaticamente.
- A auditoria é imutável (trigger). A exclusão ocorre apenas no expurgo de retenção, que exige um
  sinalizador de sessão explícito.
- Consulta em **Configurações → Auditoria** (permissão `auditoria:ler`).

## LGPD

| Princípio ou direito                         | Como é atendido                                                                                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Finalidade e necessidade                     | Dados pessoais restritos a usuários (acesso e auditoria), fornecedores PF e contatos (compras) e espelho de clientes (vínculo de vendas) |
| Minimização                                  | O espelho do CRM guarda apenas os campos necessários; os logs técnicos de integração não guardam payloads com dados pessoais             |
| Segurança                                    | Controles acima, com acesso por perfil                                                                                                   |
| Transparência e acesso (art. 18, II)         | **Configurações → LGPD**: localiza os dados de um titular por e-mail ou CPF/CNPJ                                                         |
| Portabilidade (art. 18, V)                   | Exportação em JSON                                                                                                                       |
| Eliminação e anonimização (art. 18, IV e VI) | Anonimização de usuários desligados e fornecedores PF inativos, preservando o histórico de estoque sem identificação                     |
| Controlador dos dados de clientes            | O CRM; correções e exclusões são feitas lá e refletidas pela sincronização                                                               |
| Retenção                                     | Configurável: logs de integração (padrão 180 dias) e auditoria (padrão 5 anos), com expurgo automático diário                            |
| Exibição                                     | CPF mascarado em listagens e nas respostas do espelho de clientes; logs com redação de campos sensíveis                                  |

**Recomendações organizacionais** (fora do software): manter o registro das operações de
tratamento (ROPA), designar o encarregado (DPO), assinar contrato de operador com a AWS (DPA) e
definir o procedimento de resposta a incidentes (comunicação à ANPD).
