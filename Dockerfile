# syntax=docker/dockerfile:1.7

FROM oven/bun:1.4.0-alpine AS manifests
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/release-worker/package.json apps/release-worker/package.json
COPY apps/playback/package.json apps/playback/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/media-relay/package.json packages/media-relay/package.json
COPY packages/provider-sdk/package.json packages/provider-sdk/package.json
COPY packages/ui/package.json packages/ui/package.json

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

FROM node:24.21.0-alpine AS api
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001
# xz binary: the subtitles engine shells to `xz -dc` for XZ-compressed
# singles (AnimeTosho .ass.xz); without it those candidates are skipped.
RUN apk add --no-cache xz xz-libs
# First-party subtitle files live on a mounted volume. The daemon creates
# fresh named volumes root-owned, and the app runs as node: pre-create the
# directory with app ownership so newly provisioned volumes stay writable.
# (Existing root-owned volumes need a one-time host-side chown instead;
# the image cannot repair a mounted volume's ownership.)
RUN mkdir -p /var/lib/consumit/subtitles && chown node:node /var/lib/consumit/subtitles
COPY --from=api-build --chown=node:node /app/apps/api/dist/*.js ./
USER node
EXPOSE 3001
CMD ["node", "index.js"]

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
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID
ARG NEXT_PUBLIC_GA_PROMPT=on
ARG NEXT_PUBLIC_CAST_RECEIVER_ID
ARG NEXT_PUBLIC_CONSUMIT_WELCOME_ENABLED=false
ARG NEXT_PUBLIC_CONSUMIT_DISCORD_URL=https://discord.gg/p7XVyk6vs
ARG NEXT_PUBLIC_CONSUMIT_REDDIT_URL=https://www.reddit.com/r/Consumit/
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_GA_MEASUREMENT_ID=${NEXT_PUBLIC_GA_MEASUREMENT_ID} \
    NEXT_PUBLIC_GA_PROMPT=${NEXT_PUBLIC_GA_PROMPT} \
    NEXT_PUBLIC_CAST_RECEIVER_ID=${NEXT_PUBLIC_CAST_RECEIVER_ID} \
    NEXT_PUBLIC_CONSUMIT_WELCOME_ENABLED=${NEXT_PUBLIC_CONSUMIT_WELCOME_ENABLED} \
    NEXT_PUBLIC_CONSUMIT_DISCORD_URL=${NEXT_PUBLIC_CONSUMIT_DISCORD_URL} \
    NEXT_PUBLIC_CONSUMIT_REDDIT_URL=${NEXT_PUBLIC_CONSUMIT_REDDIT_URL} \
    NEXT_TELEMETRY_DISABLED=1
RUN bun --filter @consumit/web build

FROM node:24.21.0-alpine AS web
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
COPY infra/nginx/request-limits.conf /etc/nginx/consumit-request-limits.conf
EXPOSE 80

FROM source AS release-worker-build
RUN bun --filter @consumit/release-worker build

# Match the production dependency exactly; install Chromium on glibc, not Alpine.
FROM node:24.21.0-bookworm-slim AS release-worker
WORKDIR /app
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/opt/consumit-browsers
RUN npm install --omit=dev --ignore-scripts playwright@1.63.0 \
  && npm pkg set type=module \
  && npx playwright install --with-deps chromium \
  && chmod -R a+rX /opt/consumit-browsers \
  && rm -rf /var/lib/apt/lists/*
COPY --from=release-worker-build --chown=node:node /app/apps/release-worker/dist/index.js ./index.js
USER node
CMD ["node", "index.js"]

FROM source AS playback-build
RUN bun --filter @consumit/playback build

FROM node:24.21.0-alpine AS playback
WORKDIR /app
ENV NODE_ENV=production PORT=3002
RUN apk add --no-cache xz xz-libs && mkdir -p /var/lib/consumit/subtitles && chown node:node /var/lib/consumit/subtitles
COPY --from=playback-build --chown=node:node /app/apps/playback/dist/index.js ./index.js
USER node
EXPOSE 3002
CMD ["node", "index.js"]

FROM source AS worker-build
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build bun --filter @consumit/api db:generate && bun --filter @consumit/worker build

FROM node:24.21.0-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production WORKER_PORT=3003
COPY --from=worker-build --chown=node:node /app/apps/worker/dist/index.js /app/apps/worker/dist/retry.js ./
USER node
EXPOSE 3003
CMD ["node", "index.js"]

FROM release-worker AS worker-browser
COPY --from=worker-build --chown=node:node /app/apps/worker/dist/browser.js ./browser.js
CMD ["node", "browser.js"]

FROM nginx:1.29-alpine AS gateway-rebuild
COPY infra/nginx/consumit-rebuild.conf.template /etc/nginx/templates/default.conf.template
COPY infra/nginx/request-limits.conf /etc/nginx/consumit-request-limits.conf
EXPOSE 80
