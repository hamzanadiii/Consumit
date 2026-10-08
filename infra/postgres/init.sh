#!/bin/bash
set -euo pipefail
app_password="$(cat /run/secrets/db-app-password)"
migration_password="$(cat /run/secrets/db-migration-password)"
backup_password="$(cat /run/secrets/db-backup-password)"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=app_password="$app_password" --set=migration_password="$migration_password" --set=backup_password="$backup_password" <<'SQL'
CREATE ROLE consumit_migrate LOGIN PASSWORD :'migration_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE consumit_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE consumit_backup LOGIN PASSWORD :'backup_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER DATABASE consumit OWNER TO consumit_migrate;
REVOKE ALL ON DATABASE consumit FROM PUBLIC;
GRANT CONNECT ON DATABASE consumit TO consumit_app, consumit_backup;
ALTER SCHEMA public OWNER TO consumit_migrate;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO consumit_app, consumit_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE consumit_migrate IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO consumit_app;
ALTER DEFAULT PRIVILEGES FOR ROLE consumit_migrate IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO consumit_app;
GRANT pg_read_all_data TO consumit_backup;
SQL
