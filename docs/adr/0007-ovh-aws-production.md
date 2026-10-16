# ADR 0007: OVH production with AWS email and recovery

Status: Accepted, 2026-10-08. Implements the owner's approved deployment plan.

The operator needs the original frontend at consumit.online within an ongoing
250 MAD monthly reserve. The selected OVH VPS costs 158.64 MAD including VAT.
The owner has AWS promotional credit, whose actual eligibility and expiry must
be verified before provisioning. Hosting everything on AWS would use more of
the ongoing budget; this release keeps compute and data on OVH and uses AWS
Canada Central for SES and S3. Hetzner Storage Box is superseded for this release.

Production is a fresh PostgreSQL 17 database, with migration/application/backup
roles, private-CA TLS and no published database or Valkey ports. Existing local
data is never migrated or removed. Docker project names isolate environments.
The first frontend is `apps/web`; the second frontend is not deployed.

Encrypted pgBackRest daily full backups and continuous synchronous WAL archives
provide fourteen days of retention and at least seven days of PITR after that
history has accumulated. Healthy archiving targets less than five minutes of
recovery-point loss; interruption must retain WAL and alert before disk fills.
Encrypted Restic daily dumps and deployment secrets use a separate S3 prefix.
The private bucket has versioning, fourteen-day Governance Object Lock and no
independent age deletion of current repository objects. Backup identities cannot
delete versions or bypass retention. An offline recovery identity can read a
protected version and copy it back as current. Monthly encrypted logical recovery
copies outside both providers cover account suspension; their RPO is monthly.

SES preserves authentication contracts and code expiry. Explicit separate
credential files, five-second deadlines, no ambiguous-send retries, suppression
and private SNS/SQS feedback protect delivery and member privacy. Cloudflare
Free's single authentication rate rule supplements application limits. Telegram
receives local metrics alerts and an independent cron Worker detects a complete
VPS outage. Public registration stays edge-gated until the launch checks pass.

AWS stays Free initially. Gross monthly budget alerts are USD 2 and USD 5,
excluding credits. The hourly monitor requests the actual plan/credit state.
The owner switches to Paid when thirty days remain or credit falls below USD 20,
and confirms completion before suspension. No software automatically upgrades
the account. Actual credit expiry and service availability are deployment gates.

This consolidates compute failure onto one VPS and keeps recovery in another
provider and offline. It trades managed database automation for explicit backup,
certificate renewal, restore and disk monitoring duties. Playback providers,
direct media adapters, first-party controls and the Free relay remain unchanged.
