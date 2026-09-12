# syntax=docker/dockerfile:1.7

FROM oven/bun:1.4.0-alpine AS dependencies
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/provider-sdk/package.json packages/provider-sdk/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN bun install --frozen-lockfile

FROM dependencies AS source
COPY . .

FROM oven/bun:1.4.0-alpine AS api-dependencies
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/provider-sdk/package.json packages/provider-sdk/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN bun install --frozen-lockfile --filter @consumit/api

FROM source AS api-build
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build bun --filter @consumit/api db:generate \
  && bun --filter @consumit/api build

FROM oven/bun:1.4.0-alpine AS api
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001
COPY --from=api-build --chown=bun:bun /app/apps/api/dist/index.js ./index.js
COPY --from=api-build --chown=bun:bun /app/apps/api/dist/import-worker.js ./worker.js
USER bun
EXPOSE 3001
CMD ["bun", "index.js"]

FROM api-dependencies AS api-migrate
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/prisma.config.ts
WORKDIR /app/apps/api
CMD ["bun", "run", "db:migrate:deploy"]

FROM source AS web-build
ARG NEXT_PUBLIC_SITE_URL=http://localhost:8080
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_TELEMETRY_DISABLED=1
RUN bun --filter @consumit/web build

FROM node:24-alpine AS web
WORKDIR /app
ENV HOSTNAME=0.0.0.0 \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
COPY --from=web-build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

FROM nginx:1.29-alpine AS gateway
COPY infra/nginx/consumit.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
