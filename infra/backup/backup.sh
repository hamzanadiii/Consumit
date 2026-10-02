#!/bin/sh
set -eu
umask 077
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE is required}"

snapshot_dir="$(mktemp -d /tmp/consumit-backup.XXXXXX)"
trap 'rm -rf -- "$snapshot_dir"' EXIT HUP INT TERM
dump="$snapshot_dir/consumit.dump"

pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$dump"
restic snapshots >/dev/null 2>&1 || restic init
restic backup "$dump" --tag consumit-postgres --host "${BACKUP_HOST:-consumit-production}" --group-by host,tags
restic forget --tag consumit-postgres --host "${BACKUP_HOST:-consumit-production}" --group-by host,tags --keep-daily "${BACKUP_KEEP_DAILY:-14}" --keep-weekly "${BACKUP_KEEP_WEEKLY:-4}" --keep-monthly "${BACKUP_KEEP_MONTHLY:-6}" --prune
restic check --read-data-subset="${BACKUP_CHECK_SUBSET:-5%}"
