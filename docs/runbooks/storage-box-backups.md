# PostgreSQL backups to Hetzner Storage Box

Historical alternative, superseded by the owner's OVH + AWS plan on 2026-10-08.
The current production Compose uses S3, private-CA PostgreSQL 17, pgBackRest WAL
and Restic logical backups. Follow [the current deployment runbook](./ovh-aws-production.md).
The remaining text records the earlier SFTP setup and synthetic drill context;
its configuration does not describe the active production overlay.

The production Compose profile (`compose.production.yaml`) uses encrypted Restic snapshots over SFTP. The database remains the primary store; the Storage Box is the offsite recovery copy. The base/development Compose backup service writes local custom-format dumps into a Docker volume only. Those local dumps are a convenience and do not satisfy this runbook's encryption or separate-failure-domain requirements.

## Setup

Run `node scripts/production.mjs prepare` from `/opt/consumit` first. It generates the ignored Restic password and production template; repeating it preserves existing secrets. The VPS requires Node 24 for the backup service. Keep the recovery password off the VPS and never commit `infra/secrets`.

1. Create a restricted Storage Box sub-account and SSH key dedicated to backups. Keep its credentials separate from the database host.
2. Pin the host key in `known_hosts` after comparing its fingerprint with Hetzner's published fingerprint. Put `known_hosts`, the private key, and an SSH config alias named `storage-box` in `/opt/consumit/infra/secrets/ssh`; mount that directory read-only. The alias must set `HostName`, `User`, `IdentityFile`, `IdentitiesOnly yes`, `StrictHostKeyChecking yes`, and `ServerAliveInterval 60`. SFTP on port 22 expects the RFC4716 key format; using Hetzner's `install-ssh-key` procedure over port 23 installs both supported formats. Port 23 requires SSH Support to be enabled; external connections also require External Reachability. See [Hetzner SFTP access](https://docs.hetzner.com/storage/storage-box/access/access-sftp-scp/) and [SSH key setup](https://docs.hetzner.com/storage/storage-box/ssh-keys/add-ssh-keys/).
3. Put a high-entropy Restic password in `/opt/consumit/infra/secrets/restic-password` with root-only permissions. Keep a recovery copy outside the server; without this password, encrypted snapshots cannot be opened. Restic's [SFTP repository setup](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html#sftp) requires non-interactive SSH-key access.
4. Set `RESTIC_REPOSITORY=sftp:storage-box:/backups/consumit`, `RESTIC_PASSWORD_FILE`, and `STORAGE_BOX_SSH_DIR` in the ignored `.env.production`. Run `node scripts/production.mjs check` to reject missing files or a weak database URI before any backup process starts. The backup selects the API's `DATABASE_URL`; ensure its URI uses `sslmode=verify-full`, or omits that parameter so `PGSSLMODE=verify-full` applies. The image includes PostgreSQL 18 tools and system certificate authorities, with `PGSSLROOTCERT=system`; a weaker explicit mode fails closed under [libpq's system-root policy](https://www.postgresql.org/docs/18/libpq-connect.html#LIBPQ-CONNECT-SSLROOTCERT). Use a database certificate trusted by those authorities. Initialize the empty repository once, then run `bun run backup:run` and `bun run backup:check` before enabling the timer.
5. Install the supplied systemd service and timer from `infra/backup`, enable the timer, run it once manually, and verify `systemctl status consumit-backup.timer`.

Retention is fourteen daily, four weekly, and six monthly snapshots. Every run creates a custom-format `pg_dump`, uploads it through Restic encryption, prunes retention, and checks a data subset. The production service builds a dedicated Consumit image, clears the development cron command and mounts, and runs once without a restart loop; the timer owns its schedule. The script and production Compose defaults enforce that policy; any failed step exits non-zero. Also verify the selected database provider's seven-day point-in-time recovery window and snapshot storage in a separate failure domain as specified by [postgres-recovery.md](./postgres-recovery.md).

## Restore drill

Restore the newest snapshot to a temporary directory, create a new isolated PostgreSQL database, and use `pg_restore --clean --if-exists --no-owner` against that isolated target. Run migration status and integrity checks from `postgres-recovery.md`. Never restore over the current production database. Perform the drill before accepting member registrations and quarterly afterward.
