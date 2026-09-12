# PostgreSQL backups to Hetzner Storage Box

Production uses encrypted restic snapshots over SFTP. The database container remains the primary store; the Storage Box is an offsite recovery copy.

## Setup

1. Create a restricted Storage Box sub-account and SSH key dedicated to backups.
2. Put the SSH key, `known_hosts`, and a high-entropy restic password in `/opt/consumit/secrets` with root-only permissions.
3. Set `RESTIC_REPOSITORY`, `RESTIC_PASSWORD_FILE`, and `STORAGE_BOX_SSH_DIR` in the ignored production environment.
4. Install the supplied systemd service and timer from `infra/backup`, enable the timer, and run the service once manually.
5. Run `bun run backup:check` and inspect `systemctl status consumit-backup.timer`.

Retention is seven daily, four weekly, and six monthly snapshots. Every run creates a custom-format `pg_dump`, uploads it through restic encryption, prunes retention, and checks a data subset. Any failed step exits non-zero.

## Restore drill

Restore the newest snapshot to a temporary directory, create a new isolated PostgreSQL database, and use `pg_restore --clean --if-exists --no-owner` against that isolated target. Run migration status and integrity checks from `postgres-recovery.md`. Never restore over the current production database. Perform the drill before accepting member registrations and quarterly afterward.
