#!/bin/sh
set -eu
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE is required}"
if [ -n "${AWS_CREDENTIALS_FILE:-}" ]; then
  AWS_ACCESS_KEY_ID="$(jq -er .accessKeyId "$AWS_CREDENTIALS_FILE")"
  AWS_SECRET_ACCESS_KEY="$(jq -er .secretAccessKey "$AWS_CREDENTIALS_FILE")"
  AWS_SESSION_TOKEN="$(jq -r '.sessionToken // empty' "$AWS_CREDENTIALS_FILE")"
  export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
fi
max_age_seconds="$(( ${BACKUP_MAX_AGE_HOURS:-30} * 3600 ))"
restic snapshots --tag consumit-postgres --host "${BACKUP_HOST:-consumit-production}" --json | jq -e --argjson max "$max_age_seconds" 'length > 0 and ((max_by(.time | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601).time | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601) as $time | $time <= now and (now - $time) <= $max)'
restic check --read-data-subset="${BACKUP_CHECK_SUBSET:-5%}"
