# Como contribuir

## Branches

| Branch                       | Ambiente        | Regras                                                                |
| ---------------------------- | --------------- | --------------------------------------------------------------------- |
| `main`                       | Produção        | Protegida; recebe merge apenas de `homolog` via Pull Request aprovado |
| `homolog`                    | Homologação     | Protegida; recebe merge de `develop` via Pull Request                 |
| `develop`                    | Desenvolvimento | Integração contínua das funcionalidades                               |
| `feat/*`, `fix/*`, `chore/*` | —               | Criadas a partir de `develop`; uma por tarefa                         |

Correções urgentes: `hotfix/*` a partir de `main`, com merge em `main` e em `develop`.

## Commits

Seguimos **Conventional Commits**, validados pelo commitlint no hook `commit-msg`:

```
feat(estoque): permite transferência entre locais
fix(integracao): trata timeout do CRM como erro transitório
docs: atualiza manual de inventário
```

Tipos: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
O hook `pre-commit` formata os arquivos alterados com o Prettier.

## Pull Requests e revisão de código

1. Abra o PR para `develop` preenchendo o template (descrição, como testar, checklist).
2. O CI precisa passar: lint, tipos, testes unitários e de integração, E2E com acessibilidade,
   auditoria de dependências e build das imagens.
3. Pelo menos **uma aprovação** de um responsável (CODEOWNERS). Mudanças em `prisma/`,
   `modules/estoque` ou `modules/integracao` exigem revisão do time responsável.
4. **Na revisão, verifique:**
   - regras de negócio cobertas por teste, principalmente concorrência e idempotência;
   - migrations retrocompatíveis;
   - nada de segredos ou dados pessoais em código, logs ou testes;
   - permissões aplicadas no servidor;
   - acessibilidade das telas.
5. Merge por _squash_, com mensagem no padrão Conventional Commits.

## Versionamento

Usamos SemVer, com tags `vX.Y.Z` em `main`, e o histórico fica em [CHANGELOG.md](CHANGELOG.md).

## Padrões de código

- TypeScript estrito. Domínio em português, termos técnicos no original.
- **Validação:** schemas Zod em `packages/shared`, usados na API e no frontend.
- **Estoque:** toda alteração de saldo passa pelo `MotorEstoqueService`. Nunca atualize
  `saldos_estoque` diretamente.
- **Erros:** as exceções de domínio de `common/erros.ts` geram respostas RFC 7807.
- **Frontend:** use os componentes de `components/ui` (rótulos e erros acessíveis) e rode
  `npm run test:e2e` para o axe.
