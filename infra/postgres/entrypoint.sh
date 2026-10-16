#!/bin/bash
set -euo pipefail
umask 077
: "${AWS_BACKUP_BUCKET:?S3 bucket required}"
mkdir -p /etc/pgbackrest /var/log/pgbackrest /var/spool/pgbackrest /var/lib/consumit/metrics
key="$(jq -er .accessKeyId /run/secrets/backup-aws.json)"
secret="$(jq -er .secretAccessKey /run/secrets/backup-aws.json)"
token="$(jq -r '.sessionToken // empty' /run/secrets/backup-aws.json)"
cat > /etc/pgbackrest/pgbackrest.conf <<EOF
[global]
repo1-type=s3
repo1-path=/pgbackrest
repo1-s3-bucket=$AWS_BACKUP_BUCKET
repo1-s3-region=ca-central-1
repo1-s3-endpoint=s3.ca-central-1.amazonaws.com
repo1-s3-key=$key
repo1-s3-key-secret=$secret
repo1-cipher-type=aes-256-cbc
repo1-cipher-pass=$(cat /run/secrets/pgbackrest-password)
repo1-retention-full-type=time
repo1-retention-full=14
archive-async=n
start-fast=y
process-max=2
log-level-console=warn

[consumit]
pg1-path=/var/lib/postgresql/data
pg1-socket-path=/var/run/postgresql
pg1-user=consumit_admin
EOF
if [ -n "$token" ]; then sed -i "/repo1-s3-key-secret=/a repo1-s3-token=$token" /etc/pgbackrest/pgbackrest.conf; fi
chown -R postgres:postgres /etc/pgbackrest /var/log/pgbackrest /var/spool/pgbackrest /var/lib/consumit/metrics
if [ "$1" != postgres ]; then
  chown postgres:postgres /var/lib/postgresql/data
  exec gosu postgres "$@"
fi
archive_mode=on
if [ "${CONSUMIT_RECOVERY_MODE:-false}" = true ]; then archive_mode=off; fi
# pgBackRest remains synchronous: no queue-size option may discard WAL.
gosu postgres /usr/local/bin/consumit-postgres-metrics &
exec docker-entrypoint.sh "$@" \
  -c ssl=on -c ssl_cert_file=/run/secrets/db-server.crt -c ssl_key_file=/run/secrets/db-server.key \
  -c hba_file=/etc/consumit/pg_hba.conf -c ident_file=/etc/consumit/pg_ident.conf \
  -c password_encryption=scram-sha-256 -c wal_level=replica -c "archive_mode=$archive_mode" \
  -c archive_timeout=60 -c 'archive_command=pgbackrest --stanza=consumit archive-push %p'
