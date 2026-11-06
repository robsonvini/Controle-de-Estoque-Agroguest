# syntax=docker/dockerfile:1.7
# Imagem da API e do worker do Estoque Agrogest.
# Construir a partir da RAIZ do repositório:
#   docker build -f apps/api/Dockerfile -t estoque-api .
#   docker build -f apps/api/Dockerfile --target migracao -t estoque-migracao .

FROM node:24-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 HUSKY=0

# ---------- Dependências (com cache) ----------
FROM base AS dependencias
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY tools/crm-test-client/package.json tools/crm-test-client/
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ---------- Build ----------
FROM dependencias AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @estoque/shared && npm run build -w @estoque/api

# ---------- Migrações (tarefa avulsa: prisma migrate deploy + seed de referência) ----------
FROM build AS migracao
WORKDIR /app/apps/api
USER node
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed"]

# ---------- Dependências de produção ----------
FROM base AS producao-deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY tools/crm-test-client/package.json tools/crm-test-client/
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --workspace=@estoque/api --ignore-scripts --no-audit --no-fund

# ---------- Runtime ----------
FROM node:24-alpine AS api
WORKDIR /app
ENV NODE_ENV=production PORT=3333
RUN apk add --no-cache tini
COPY --from=producao-deps /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY --from=build /app/apps/api/src/generated ./apps/api/src/generated
WORKDIR /app/apps/api
USER node
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3333/api/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
# Para o worker, sobrescreva o comando: ["node", "dist/main-worker.js"]
CMD ["node", "dist/main.js"]
