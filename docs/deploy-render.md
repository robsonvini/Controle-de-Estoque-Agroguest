# Publicação no Render

O arquivo [`render.yaml`](../render.yaml) descreve a publicação sem AWS:

- PostgreSQL persistente;
- API NestJS com migrations e seed no início;
- frontend Next.js com proxy interno para a API.

No plano gratuito, o worker não é criado porque o Render não permite serviços
`background worker` nesse plano. O sistema principal funciona, mas tarefas automáticas
em segundo plano ficam desativadas até o worker ser contratado.

## Configuração

1. Crie uma conta em <https://render.com> e conecte o GitHub.
2. Selecione **New → Blueprint** e escolha este repositório.
3. Confirme a criação dos serviços definidos em `render.yaml`.
4. Preencha `SEED_ADMIN_EMAIL`, `SEED_ADMIN_SENHA` e `CRM_BASE_URL` quando solicitado.
5. No serviço `estoque-worker`, informe os mesmos valores de `JWT_ACCESS_SECRET`,
   `JWT_INTEGRACAO_SECRET` e `CRYPTO_KEY` usados no serviço `estoque-api`.
6. Aguarde o deploy e abra `https://estoque-web.onrender.com`.

O plano gratuito pode suspender os serviços após um período sem acesso. A primeira requisição
depois da suspensão pode demorar alguns segundos.
