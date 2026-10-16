#!/bin/sh
# Nightly Postgres backup (Neon) + rotation.
#
# Dumps $DATABASE_URL with pg_dump (custom format, compressed), keeps 7
# daily dumps in /backups, and snapshots the provider-overrides file
# alongside (it lives outside the database but is operator state).
# Runs from cron inside the backup sidecar; run once by hand with:
#   docker compose -f compose.yaml -f compose.dev.yaml exec backup /backup.sh
#
# Restore drill (against a scratch database, never prod):
#   1. Pick a dump: docker compose exec backup ls /backups
#   2. docker compose exec backup pg_restore -h <host> -U <role> \
#        -d <fresh-db> --clean --if-exists --no-owner \
#        /backups/<file>.dump
#      (--no-owner: dumps reference neondb_owner, which exists only on Neon.)
#   3. Verify: tables + row counts, then
#      DATABASE_URL=local bunx prisma migrate status (expect "up to date").
set -eu

STAMP=$(date -u +%F)
OUT="/backups/consumit-${STAMP}.dump"

echo "[backup] dumping database..."
# --no-owner/--no-acl: Neon objects belong to neondb_owner, which exists
# nowhere else. Without these flags every restore drowns in missing-role
# errors (proven in the drill).
pg_dump --dbname="$DATABASE_URL" --format=custom --compress=6 --file="$OUT" --no-owner --no-acl
chmod 600 "$OUT"

if [ -f /config-overrides/providers.local.overrides.json ]; then
  cp /config-overrides/providers.local.overrides.json "/backups/overrides-${STAMP}.json"
  chmod 600 "/backups/overrides-${STAMP}.json"
fi

echo "[backup] rotating (keep 7)..."
ls -1t /backups/consumit-*.dump 2>/dev/null | tail -n +8 | xargs -r rm -f
ls -1t /backups/overrides-*.json 2>/dev/null | tail -n +8 | xargs -r rm -f

echo "[backup] done: $(du -h "$OUT" | cut -f1) at $OUT"
ls -1 /backups | tail -5
