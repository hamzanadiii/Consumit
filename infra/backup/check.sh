#!/bin/sh
set -eu
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE is required}"
max_age_seconds="$(( ${BACKUP_MAX_AGE_HOURS:-30} * 3600 ))"
restic snapshots --tag consumit-postgres --latest 1 --json | jq -e --argjson max "$max_age_seconds" 'length == 1 and ((now - (.[0].time | fromdateiso8601)) <= $max)'
restic check --read-data-subset="${BACKUP_CHECK_SUBSET:-5%}"
