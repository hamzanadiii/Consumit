# PostgreSQL recovery runbook

## Required recovery posture

- Keep point-in-time recovery data for at least seven days.
- Keep fourteen daily snapshots in a separate failure domain.
- Take and verify a named snapshot immediately before every production migration.
- Complete a restore drill before accepting real member registrations and every quarter afterward.

These are provider requirements, not application features. Production must not be declared ready until the selected PostgreSQL provider demonstrates all four controls.

## Restore drill

1. Record the incident or drill identifier, desired recovery timestamp, latest migration identifier, and snapshot identifier.
2. Restore to a new isolated database instance. Never restore over the current production database.
3. Apply no new migrations. Run `bun --filter @consumit/api db:migrate:status` against the restored instance and compare it with the recorded production migration.
4. Verify row counts for `Member`, `Credential`, and `Profile`; verify their one-to-one relationships and unique email/username constraints.
5. Exercise a read-only member export against a designated test member. Never expose password hashes in the result or drill notes.
6. If this is an incident, stop identity writes, update the private API `DATABASE_URL`, restart the API, and confirm readiness before reopening traffic.
7. Record recovery point loss, restore duration, integrity checks, and operator names. Remove the isolated restore after the retention agreed for the incident.

## Recorded local synthetic drill (2026-09-28)

- Drill ID: `consumit-backup-synthetic-20260928`; operator: Codex local workspace session. No production database or backup credentials were used.
- Source and restore targets: disposable PostgreSQL 17 containers with all 23 repository migrations applied. The source contained one synthetic Member, Credential, and Profile with matching foreign-key relationships.
- Backup path: the production backup image (`restic 0.18.1`) wrote a custom-format dump to an encrypted Restic repository on a loopback-only SFTP server. Snapshot `4053bda4` was the latest retained snapshot. `restic check --read-data-subset=100%` read all packs and returned no errors.
- Retention check: three same-day snapshots had changing temporary dump paths. Explicit `host,tags` grouping pruned the intermediate snapshot while preserving the expected daily/weekly/monthly representatives. A freshness check accepted the matching host and rejected an unrelated host.
- Restore checks: the latest encrypted snapshot restored into a separate disposable PostgreSQL 17 target. `prisma migrate status` reported all 23 migrations up to date; Member, Credential, and Profile row counts were 1 each and fully linked. A repository-level member export returned the synthetic identity and library without password, credential, session, or code fields.
- Measured `pg_restore` time from the named custom-format dump was 2.442 seconds. The Restic restore plus PostgreSQL restore command completed in 8.578 seconds including container startup. Neither figure is a production RTO.
- Cleanup: all named drill containers, volumes, network, image tag, and temporary dump were removed.

This validates the local encrypted backup/restore mechanics only. It does not prove access to the real Storage Box, production host-key setup, provider point-in-time recovery, separate-failure-domain retention, or production recovery time. The production readiness requirements above remain open until those are demonstrated.

Valkey is not restored as durable member data. Losing the dedicated auth instance safely logs members out and invalidates pending verification and recovery codes. It must run with `noeviction` and AOF `everysec`; catalog caching must use a separate instance or namespace.
