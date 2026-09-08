#!/bin/sh
# Development entrypoint for Compose live-reload services.
# Reaffirms dependencies (a fast no-op once the image is built), regenerates
# the Prisma client when requested so the container never runs the client
# baked in from another platform, then execs the dev server command.
set -eu

cd /app

bun install --frozen-lockfile

if [ "${GENERATE_PRISMA:-0}" = "1" ]; then
  bun --filter @consumit/api db:generate
fi

exec "$@"
