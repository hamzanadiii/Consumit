#!/bin/bash
set -euo pipefail
umask 077
cd /secrets
test -s db-ca.key && test -s db-ca.crt
suffix="$(date -u +%Y%m%dT%H%M%SZ)"
# Keep previous material for rollback; the CA is not rotated.
cp -- db-server.key "db-server.key.$suffix"
cp -- db-server.crt "db-server.crt.$suffix"
openssl req -new -newkey rsa:2048 -nodes -subj /CN=postgres -keyout db-server.key.new -out server.csr 2>/dev/null
printf 'subjectAltName=DNS:postgres\nextendedKeyUsage=serverAuth\n' > server.ext
openssl x509 -req -in server.csr -CA db-ca.crt -CAkey db-ca.key -CAcreateserial -days 365 -out db-server.crt.new -extfile server.ext 2>/dev/null
openssl verify -CAfile db-ca.crt -verify_hostname postgres db-server.crt.new
chown postgres:postgres db-server.key.new
chmod 0600 db-server.key.new
chmod 0644 db-server.crt.new
mv -- db-server.key.new db-server.key
mv -- db-server.crt.new db-server.crt
rm -- server.csr server.ext
printf 'Renewed the server certificate with the existing CA. Restart PostgreSQL and rerun TLS/readiness checks in the maintenance window.\n'
