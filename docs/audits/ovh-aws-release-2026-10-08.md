# OVH + AWS release preparation: 2026-10-08

Local implementation is prepared. Public launch is pending the server purchase,
authenticated accounts and the live gates in [the runbook](../runbooks/ovh-aws-production.md).
No AWS account upgrade, purchase, Terraform apply, server deployment or public
registration change was performed during this preparation.

## Implemented

- Original frontend/API on the independent production Compose project; fresh
  PostgreSQL 17, separate roles, private-CA TLS and private PostgreSQL/Valkey.
- SES notifier, five-second send deadline, one attempt, safe failure metrics,
  private SNS/SQS feedback and account suppression configuration.
- S3 Standard with public access blocked, versioning, fourteen-day Governance
  Object Lock, restricted identities and noncurrent-only lifecycle expiry.
- Encrypted pgBackRest daily full/WAL and Restic logical/config backups, timers,
  archive/disk/freshness/certificate alerts, isolated recovery and retention tools.
- Telegram routing template, independent outage/recovery Worker, uncached gateway
  readiness, Free authentication rule and default-closed registration gate.
- Gross AWS USD 2/USD 5 budgets, actual credit-state monitor, explicit identity
  check, private account wizard, administrator bootstrap and offline refresh tool.
- Fifty-session/ten-minute public HTTPS baseline script and complete live checklist.

## Verified locally

The standard root test command passed from an isolated Git release snapshot with
no private environment files: 1,983 tests across eight workspaces (including 476
API tests), plus sixteen Node script tests, for 1,999 passing checks. Prisma's
test preparation uses an explicit generation-only URL, so it does not need a
developer database or inherit self-hosted migration settings. Workspace lint,
type checks and builds passed; final changed API lint/type checks and its bundle
also passed. Frozen dependency installation succeeds. API, migration, PostgreSQL,
backup and gateway Docker images build; both Nginx configurations validate. The
original frontend and migration images were also built from the isolated Git
snapshot, and the API/operational/smoke bundles compiled there successfully.

Terraform validates Cloudflare (provider 5.26.0) and AWS (6.68.0); Compose evaluates
the production/backup/recovery services. Promtool validates fourteen production
alerts. Shell syntax checks pass for the account wizard and PostgreSQL/backup
scripts. Worker tests prove two-failure notification, recovery and pending
notification retry without using a real bot. Wrangler's credential-free dry run
bundles the external monitor successfully; deployment installs its private
Telegram secrets before enabling the schedule. No public load run was claimed.

The disposable database drill used only uniquely named new Docker objects:

- PostgreSQL rejected plaintext, wrong CA and wrong hostname connections; the
  application role could not create schema objects.
- The actual built API became ready with the correct CA and rejected incorrect
  CA/hostname database connections through degraded readiness.
- Existing release migrations ran against the empty fixture database.
- Encrypted pgBackRest full backup and logical custom dump restored into separate
  databases. Member/Credential/Profile relationships and migration completion
  survived. PITR included the intended transaction and excluded a later one.
- An isolated repository interruption retained unarchived WAL and the backlog
  recovered afterward. This used a local encrypted repository, not real S3.
- All disposable drill containers, networks and volumes were removed. Existing
  local app containers, user data and unrelated UI edits were preserved.

Private production preparation generated database/encryption secrets and a
server certificate with `DNS:postgres`; OpenSSL verification passed. Existing
secrets are preserved on rerun. Production preflight fails closed on missing real
service settings and reports field names without printing credentials.

## Remaining live gates

Verify actual AWS eligibility/balance/expiry, SES à la carte selection and
production quota; provision OVH/Cloudflare/AWS and install private credentials.
Complete real SES delivery/feedback, S3 interruption/backlog, encrypted logical
and physical offsite restores, protected-version recovery, Telegram firing and
recovery including a stopped VPS, real HTTPS authentication/private-cache/
playback/seek/subtitle/progress checks, and the external fifty-session baseline.
Bootstrap the verified owner, record an independent encrypted recovery copy and
enable timers/credit alerts before opening public registration. Owner completion
of the Paid-plan switch must be recorded before Free-account suspension.
