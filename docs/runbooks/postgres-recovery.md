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

Valkey is not restored as durable member data. Losing the dedicated auth instance safely logs members out and invalidates pending verification and recovery codes. It must run with `noeviction` and AOF `everysec`; catalog caching must use a separate instance or namespace.
