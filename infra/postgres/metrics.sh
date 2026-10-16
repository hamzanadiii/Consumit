#!/bin/bash
set -euo pipefail
while true; do
  now="$(date +%s)"
  count=0
  oldest="$now"
  if [ -d /var/lib/postgresql/data/pg_wal/archive_status ]; then
    while IFS= read -r timestamp; do
      count=$((count + 1))
      timestamp="${timestamp%.*}"
      if [ "$timestamp" -lt "$oldest" ]; then oldest="$timestamp"; fi
    done < <(find /var/lib/postgresql/data/pg_wal/archive_status -name '*.ready' -printf '%T@\n')
  fi
  latest="$(pgbackrest --stanza=consumit --output=json info 2>/dev/null | jq -r '[.[].backup[]?.timestamp.stop] | max // 0' || printf 0)"
  [[ "$latest" =~ ^[0-9]+$ ]] || latest=0
  {
    printf 'consumit_archive_pending %s\n' "$count"
    printf 'consumit_archive_lag_seconds %s\n' "$((now - oldest))"
    printf 'consumit_physical_backup_timestamp_seconds %s\n' "$latest"
    printf 'consumit_backup_monitor_timestamp_seconds %s\n' "$now"
    printf 'consumit_db_certificate_expiry_seconds %s\n' "$(date -d "$(openssl x509 -in /run/secrets/db-server.crt -noout -enddate | cut -d= -f2-)" +%s)"
  } > /var/lib/consumit/metrics/postgres.prom.tmp
  chmod 0644 /var/lib/consumit/metrics/postgres.prom.tmp
  mv /var/lib/consumit/metrics/postgres.prom.tmp /var/lib/consumit/metrics/postgres.prom
  sleep 60
done
