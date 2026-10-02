#!/bin/sh
set -eu
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE is required}"
max_age_seconds="$(( ${BACKUP_MAX_AGE_HOURS:-30} * 3600 ))"
restic snapshots --tag consumit-postgres --host "${BACKUP_HOST:-consumit-production}" --json | jq -e --argjson max "$max_age_seconds" 'length > 0 and ((max_by(.time | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601).time | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601) as $time | $time <= now and (now - $time) <= $max)'
restic check --read-data-subset="${BACKUP_CHECK_SUBSET:-5%}"
