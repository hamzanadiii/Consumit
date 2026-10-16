#!/bin/bash
set -euo pipefail
umask 077
cd /secrets
if [ ! -f db-ca.key ] && [ ! -f db-ca.crt ]; then
  openssl req -x509 -newkey rsa:3072 -nodes -days 3650 -subj /CN=Consumit-Private-PostgreSQL-CA -keyout db-ca.key -out db-ca.crt 2>/dev/null
fi
# Renewal is explicit; never replace a working key or CA during preparation.
if [ ! -f db-server.key ] && [ ! -f db-server.crt ]; then
  openssl req -new -newkey rsa:2048 -nodes -subj /CN=postgres -keyout db-server.key -out server.csr 2>/dev/null
  printf 'subjectAltName=DNS:postgres\nextendedKeyUsage=serverAuth\n' > server.ext
  openssl x509 -req -in server.csr -CA db-ca.crt -CAkey db-ca.key -CAcreateserial -days 365 -out db-server.crt -extfile server.ext 2>/dev/null
  rm -- server.csr server.ext
fi
openssl verify -CAfile db-ca.crt -verify_hostname postgres db-server.crt
chown postgres:postgres db-server.key db-admin-password db-app-password db-migration-password db-backup-password pgbackrest-password
chmod 0600 db-server.key db-admin-password db-app-password db-migration-password db-backup-password pgbackrest-password db-ca.key
# Public certificates must be readable by unprivileged API/migration clients.
chmod 0644 db-ca.crt db-server.crt
