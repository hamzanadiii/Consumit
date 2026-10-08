# syntax=docker/dockerfile:1.7

FROM oven/bun:1.4.0-alpine AS manifests
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/next-web/package.json apps/next-web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/media-relay/package.json packages/media-relay/package.json
COPY packages/provider-sdk/package.json packages/provider-sdk/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/next-ui/package.json packages/next-ui/package.json

FROM manifests AS dependencies
RUN bun install --frozen-lockfile --network-concurrency 16

FROM dependencies AS source
COPY . .

FROM manifests AS api-dependencies
RUN bun install --frozen-lockfile --filter @consumit/api --network-concurrency 16

FROM api-dependencies AS api-build
COPY . .
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build bun --filter @consumit/api db:generate \
  && bun --filter @consumit/api build

FROM oven/bun:1.4.0-alpine AS api
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001
# xz binary: the subtitles engine shells to `xz -dc` for XZ-compressed
# singles (AnimeTosho .ass.xz); without it those candidates are skipped.
RUN apk add --no-cache xz xz-libs
# First-party subtitle files live on a mounted volume. The daemon creates
# fresh named volumes root-owned, and the app runs as bun: pre-create the
# directory with app ownership so newly provisioned volumes stay writable.
# (Existing root-owned volumes need a one-time host-side chown instead;
# the image cannot repair a mounted volume's ownership.)
RUN mkdir -p /var/lib/consumit/subtitles && chown bun:bun /var/lib/consumit/subtitles
COPY --from=api-build --chown=bun:bun /app/apps/api/dist/*.js ./
USER bun
EXPOSE 3001
CMD ["bun", "index.js"]

FROM api-dependencies AS api-migrate
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/prisma.config.ts
COPY apps/api/scripts apps/api/scripts
WORKDIR /app/apps/api
CMD ["sh", "-c", "bun run db:migrate:deploy && bun scripts/migration-grants.ts"]

FROM manifests AS web-dependencies
RUN bun install --frozen-lockfile --filter @consumit/web --network-concurrency 16

FROM web-dependencies AS web-build
COPY . .
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

FROM manifests AS next-web-dependencies
RUN bun install --frozen-lockfile --filter @consumit/next-web --network-concurrency 16

FROM next-web-dependencies AS next-web-build
COPY . .
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3080
ARG CONSUMIT_API_URL=http://api:3001
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} CONSUMIT_API_URL=${CONSUMIT_API_URL} NEXT_TELEMETRY_DISABLED=1
RUN bun --filter @consumit/next-web build

FROM node:24-alpine AS next-web
WORKDIR /app
ENV HOSTNAME=0.0.0.0 NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=next-web-build --chown=node:node /app/apps/next-web/.next/standalone ./
COPY --from=next-web-build --chown=node:node /app/apps/next-web/.next/static ./apps/next-web/.next/static
COPY --from=next-web-build --chown=node:node /app/apps/next-web/public ./apps/next-web/public
USER node
EXPOSE 3000
CMD ["node", "apps/next-web/server.js"]

FROM nginx:1.29-alpine AS gateway
COPY infra/nginx/consumit.conf /etc/nginx/conf.d/default.conf
COPY infra/nginx/request-limits.conf /etc/nginx/consumit-request-limits.conf
EXPOSE 80
