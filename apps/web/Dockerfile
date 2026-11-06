# syntax=docker/dockerfile:1.7
# Imagem do frontend (Next.js standalone).
# Construir a partir da RAIZ do repositório:
#   docker build -f apps/web/Dockerfile -t estoque-web .

FROM node:24-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 HUSKY=0

FROM base AS dependencias
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY tools/crm-test-client/package.json tools/crm-test-client/
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM dependencias AS build
# Destino interno da API para o rewrite /api/* (em produção o ALB encaminha /api/* direto à API)
ARG API_INTERNAL_URL=https://estoque-api.onrender.com
ENV API_INTERNAL_URL=$API_INTERNAL_URL
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @estoque/shared && npm run build -w @estoque/web

FROM node:24-alpine AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/login >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
