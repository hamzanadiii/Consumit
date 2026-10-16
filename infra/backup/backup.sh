#!/bin/sh
set -eu
umask 077
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE is required}"
if [ -n "${AWS_CREDENTIALS_FILE:-}" ]; then
  AWS_ACCESS_KEY_ID="$(jq -er .accessKeyId "$AWS_CREDENTIALS_FILE")"
  AWS_SECRET_ACCESS_KEY="$(jq -er .secretAccessKey "$AWS_CREDENTIALS_FILE")"
  AWS_SESSION_TOKEN="$(jq -r '.sessionToken // empty' "$AWS_CREDENTIALS_FILE")"
  export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
fi

snapshot_dir="$(mktemp -d /tmp/consumit-backup.XXXXXX)"
trap 'rm -rf -- "$snapshot_dir"' EXIT HUP INT TERM
dump="$snapshot_dir/consumit.dump"

pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$dump"
# Repository initialization is explicit: interruption must not look like a new repo.
restic snapshots >/dev/null
restic backup "$snapshot_dir" /deployment/.env.production /deployment/infra/secrets /deployment/infra/playback/providers.local.json /deployment/compose.yaml /deployment/compose.playback.yaml /deployment/compose.production.yaml /deployment/infra/postgres /deployment/infra/observability --tag consumit-postgres --host "${BACKUP_HOST:-consumit-production}" --group-by host,tags
restic forget --tag consumit-postgres --host "${BACKUP_HOST:-consumit-production}" --group-by host,tags --keep-daily "${BACKUP_KEEP_DAILY:-14}" --keep-weekly "${BACKUP_KEEP_WEEKLY:-4}" --keep-monthly "${BACKUP_KEEP_MONTHLY:-6}" --prune
restic check --read-data-subset="${BACKUP_CHECK_SUBSET:-5%}"
printf 'consumit_logical_backup_timestamp_seconds %s\n' "$(date +%s)" > /metrics/logical.prom.tmp
chmod 0644 /metrics/logical.prom.tmp
mv /metrics/logical.prom.tmp /metrics/logical.prom
