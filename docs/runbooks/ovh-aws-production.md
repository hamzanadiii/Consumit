# Consumit: OVH + AWS release

Deploy the original `apps/web` frontend at `https://consumit.online` with the API,
PostgreSQL 17, separate Valkey stores and monitoring on the selected OVH VPS.
Cloudflare Free exposes the private gateway through Tunnel. AWS Canada Central
provides SES and S3. The deployment project is always `consumit-production`;
local `consumit` databases, volumes, environment files and UI work are preserved.

## Budget and owner account steps

| Component | Eligible credit available | After credit |
| --- | ---: | ---: |
| OVH VPS including VAT | 158.64 MAD/month | 158.64 MAD/month |
| Frontend, API, database, cache, monitoring | Included | Included |
| Cloudflare Free | 0 MAD | 0 MAD |
| S3, small initial volume | Credit, if eligible | Estimated 10–50 MAD/month |
| SES, 10,000 messages/month | Credit, if eligible | About 10 MAD plus data/tax |
| Total | About 159 MAD/month | About 180–220 MAD/month before foreign tax/FX |

Reserve 250 MAD. Stored backup versions, WAL, requests and restore transfers
change S3 usage. Domain renewal, licensing and paid playback relay are excluded.
These are estimates, not an account-specific quote. See [S3 pricing](https://aws.amazon.com/s3/pricing/)
and [SES pricing](https://aws.amazon.com/ses/pricing/).

From this checkout run `bun run production:prepare`, then use Git Bash, WSL or
Linux to run `bash scripts/deploy-wizard.sh`. The wizard opens the account pages,
captures secrets privately and handles manual account steps. It does not buy a
server, upgrade AWS, apply Terraform or deploy the app by itself.

Before applying infrastructure, verify actual AWS credit balance, eligibility,
expiry, Free plan deadline and access to SES/S3. Record the earlier actual credit
expiry in `AWS_CREDIT_EXPIRES_AT`; the hourly API check also considers the Free
plan's earlier expiry. Stay Free initially. The owner switches to Paid when
thirty days remain or balance falls below USD 20, and confirms completion before
suspension. [AWS account plans](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html)
and [actual plan/credit state API](https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_freetier_GetAccountPlanState.html).

## Infrastructure and private settings

Use authenticated, private provisioning profiles on the operator machine. No
access keys are created by Terraform or saved in its state. State and tfvars are
ignored and must be backed up encrypted. AWS `infra/aws` creates the private S3
bucket, IAM policies/users, SES domain/DKIM/MAIL FROM, suppression, configuration
set, private SNS/SQS feedback with DLQ, and gross-usage USD 2/USD 5 email budgets.
Supply the chosen globally unique `backup_bucket` and `budget_email` through an
ignored tfvars file, then review `terraform plan` before applying it. All storage
is S3 Standard in `ca-central-1`, using server-side AES256 plus backup-tool
encryption. No KMS, compute, paid database or load balancer is provisioned in AWS.

Cloudflare `infra/cloudflare` provisions Tunnel, DNS, cache protections, scan
blocking and exactly one authentication rate rule: ten requests per IP/colo per
ten seconds, with a ten-second block. Shared application limits remain active.
Set `hostname=consumit.online`, `public_registration_enabled=false`, and the exact
tester IPs in `launch_tester_ips`. The separate WAF rule keeps non-testers from
registering until launch gates pass. An empty tester set blocks all registration.
Store Terraform's sensitive Tunnel output in `infra/secrets/tunnel-token`, never
in chat or command arguments. DKIM CNAMEs in the AWS `dns_records` output must be
DNS-only in Cloudflare. Keep incoming-mail MX records; MAIL FROM uses the separate
`bounce.consumit.online` subdomain with the generated MX/SPF records and DMARC.

In SES Canada Central choose **à la carte**, verify the domain, DKIM, MAIL FROM
and sender `Consumit <auth@consumit.online>`, and request production access with
10,000 recipients/day and ten sends/second. Actual approval and quota are launch
gates. The SDK is HTTPS-based; no SMTP port is required. Configure the generated
`consumit-auth` configuration set and account suppression. Feedback is private
SNS-to-SQS; no public webhook is created. Invalid messages reach the DLQ after
five receipts. The worker exports only bounded event categories.

Create separate keys for the Terraform-created identities and use the wizard
to save explicit private JSON credential files:

| File | Identity and purpose |
| --- | --- |
| `ses-aws.json` | `consumit-email`: send from the verified domain/configuration set |
| `backup-aws.json` | `consumit-backup`: current repository objects only |
| `feedback-aws.json` | `consumit-feedback`: receive/delete private queue messages |
| `credit-aws.json` | `consumit-credit-monitor`: read account state and budgets |
| `recovery-aws.json` | `consumit-recovery`: read protected versions and copy as current |

Keep recovery credentials offline except during the controlled retention drill.
API and web containers never receive migration/backup credentials. Credential
files are individual read-only mounts. On Linux the secrets directory is mode
0700; files needed by unprivileged containers are readable only through those
mounts. Do not add shared mounts of the secrets directory to normal services.

`production:prepare` generates a new pepper when absent/example, distinct
database passwords and separate encryption passwords. It prepares fresh
self-hosted URLs without changing development configuration or volumes. Install
the production provider file and TMDB read token privately; provider values never
belong in Git. The existing Free playback relay is retained. Configure optional
relay settings only with the already reviewed origin and host policies.

## VPS installation and initial release

Install Docker Compose and Node 24 on the VPS, check out the reviewed complete
release at `/opt/consumit`, and use root-owned production configuration. Restrict
SSH to your operator key; the application needs outbound HTTPS and no published
HTTP, PostgreSQL, Valkey or monitoring ports. Node 24 can run the production
wrapper without installing Bun on the VPS; Bun is inside the API image.

After private account setup:

```bash
sudo node scripts/production.mjs prepare
sudo node scripts/production.mjs certificates
sudo node scripts/production.mjs check
sudo node scripts/production.mjs build
sudo node scripts/production.mjs aws-identity-check
sudo node scripts/production.mjs up
sudo node scripts/production.mjs physical-init
sudo node scripts/production.mjs physical-backup
sudo node scripts/production.mjs backup-init
sudo node scripts/production.mjs backup
sudo node scripts/production.mjs backup-check
sudo node scripts/production.mjs credit-check
```

Certificates use a private CA, a one-year server certificate with `DNS:postgres`
and certificate/hostname verification in API, migrations and logical backup
clients. Host plaintext connections are rejected. Root prepares the secrets;
the certificate helper fixes PostgreSQL ownership and key permissions. Save the
CA/encryption passwords off the VPS. Repeating certificate preparation preserves
existing keys; renewal is explicit before the thirty-day expiry alert. Run
`sudo node scripts/production.mjs renew-certificate` to sign a new server
certificate with the same CA and retain previous material, then restart
PostgreSQL in a controlled window and rerun TLS/readiness checks. A CA rotation requires
coordinating every verified client; replacing only the server CA breaks access.

The first startup initializes an empty database and applies existing migrations.
No local export, production demo seed or local volume is mounted. Subsequent
`up` runs take an annotated physical backup before migrations and stop if that
backup fails. Builds use unique Git/time image tags and retain previous images.
`up` deploys built images with `--no-build`. Keep a recorded previous image tag
and backup label for rollback; do not prune previous images before verification.

Install and enable the supplied `consumit-physical-backup`, `consumit-backup`
and `consumit-credit-monitor` service/timer pairs in `/etc/systemd/system`, then
`systemctl daemon-reload` and `systemctl enable --now` all three timers. Physical
full backups run at 02:45 UTC, logical backups at 03:15 UTC plus jitter, and credit
monitoring hourly. Check timer next-run times, successful service exits and
Prometheus textfile metrics. Failed backups never update success timestamps.

## Backups and recovery

pgBackRest encrypts full backups and WAL with AES-256-CBC before sending to S3.
Daily full backups use time-based fourteen-day retention; WAL expires only with
the oldest retained full. At least seven days of PITR remains once that history
has accumulated. `archive_timeout=60` targets less than five minutes of data loss
while archiving is healthy. Synchronous archiving has no queue-size discard
option. Never delete unarchived WAL. Archive lag over four minutes, low disk,
missing/stale backups and stopped monitoring page Telegram.

Restic keeps fourteen daily, four weekly and six monthly encrypted logical dumps
plus private deployment configuration in `restic/`. Initialization is explicit;
an S3/network error cannot cause automatic repository initialization. Both tools
expire their current repository objects. Bucket lifecycle expires noncurrent
versions after fourteen days and expired delete markers afterward; it never
age-deletes current repository objects. Backup credentials explicitly deny
version deletion and Governance bypass. Version churn temporarily increases
storage beyond the current repository size. [Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html)
and [pgBackRest retention](https://pgbackrest.org/configuration.html).

Run `node scripts/production.mjs retention-drill` with the offline recovery key
temporarily installed. It creates only an isolated `drills/` fixture, deletes its
current object, proves version deletion is denied, copies the retained version
back as current and verifies bytes. Small protected fixture versions remain
until retention/lifecycle permits cleanup. Before launch also interrupt S3 access
in an isolated replica/drill, create transactions, verify retained `.ready` WAL
and rising lag, restore access and prove backlog catch-up and PITR. Do not inject
an outage into a live member database.

Recover into independent Docker containers/volumes:

```bash
sudo node scripts/recover-production.mjs physical 2026-10-08T12:00:00Z
sudo node scripts/recover-production.mjs logical latest
```

Use your recorded real recovery target/snapshot, not the example timestamp. The
helper never mounts production data, leaves recovered objects for inspection,
disables archiving to avoid writing clone WAL into the production repository,
and checks migration completion and member relationships. Compare the restored
migration names, row counts, named marker transactions and read-only member
export with the incident/drill record. Apply no new migrations during inspection.
Promotion requires stopping member writes, recording the selected recovery point,
coordinating deployment credentials and checking readiness before reopening.

Monthly, on an independent recovery computer with a mounted offline drive,
install Docker and Node 24, check out the reviewed release, and privately supply
`RESTIC_REPOSITORY` in `.env.production` plus `backup-aws.json`, `restic-password`
and the separate `offline-restic-password` in `infra/secrets`. Review the source
snapshot and run
`node scripts/offline-recovery.mjs /absolute/offline-drive`. It copies the latest
encrypted logical/config snapshot to a differently encrypted repository and
checks all packs. It builds the reviewed backup helper on that computer, so no VPS
image store is needed. Keep passwords in an independent password manager and perform
a logical restore from that offline copy. This monthly fallback has a monthly
RPO; it does not substitute for healthy continuous WAL recovery.

## Alerts and public launch gates

Configure the private Telegram bot/chat using the wizard. Alertmanager emits
safe failure and recovery notices. Validate its generated config with `amtool`,
inject a controlled firing alert, confirm receipt, resolve it and confirm recovery.
Deploy the independent cron Worker after creating its Free KV namespace:
`node scripts/deploy-uptime.mjs --dry-run`, then `--deploy`. Telegram token/chat
are Worker secrets. It checks the public homepage and uncached `/health/ready`
every five minutes, alerts after two failures, repeats every thirty minutes and
sends recovery. A stopped-VPS test must produce both external notifications.
If using temporary whole-site Cloudflare Access, also provide a private service
token to the Worker through its `CF_ACCESS_CLIENT_ID/SECRET` secrets; otherwise
use the registration-only edge gate supplied by Terraform.

Registration remains restricted until all checks below are evidenced:

- Standard tests, lint, types, builds and `infra:validate` pass on the release.
- Controlled SES inbox receives verification, registration notice and recovery;
  original responses and ten-minute code expiry remain intact. Actual quota,
  DKIM/SPF/DMARC, suppression and bounce/complaint feedback are verified.
- Real S3 encrypted logical/physical restores preserve relationships and migration
  status; interruption/backlog, retention and protected-version drills pass.
- Telegram receives failures and recovery, including a stopped-VPS external test.
- `production:smoke` passes real HTTPS, private caching and uncached readiness;
  browser checks cover registration, verification, password reset, movie/series/
  anime playback, seeking, subtitles, fallback and saved progress after reload.
- An external generator runs `tests/load/public-launch.js`: fifty independent
  browsing sessions for ten minutes, warm page/API p95 below two seconds, fewer
  than one percent unexpected errors. Run `k6 run --summary-export launch.json
  tests/load/public-launch.js` and save results privately. If temporary Access is
  used, supply its service credentials via environment, never arguments. This is
  HTTP session load; rendering/media behavior is verified separately in browsers.
- Register and verify the owner through the normal flow, then bootstrap the first
  administrator by sending that email on stdin to the private `bootstrap-admin`
  recovery-profile service. It refuses an unverified member or another existing
  administrator; no public promotion endpoint exists.

For that final promotion, read the verified email privately and pass it on stdin:

```bash
read -r -p 'Verified owner email: ' owner_email
printf '%s' "$owner_email" | sudo docker compose -p consumit-production --env-file .env.production -f compose.yaml -f compose.playback.yaml -f compose.production.yaml --profile recovery run --rm --no-deps -T bootstrap-admin
unset owner_email
```

Then set `public_registration_enabled=true`, review/apply the Cloudflare change,
repeat HTTPS smoke and observe alerts. Do not mark live gates passed from local
synthetic evidence. Track gross usage, credit balance, expiry and the completed
Paid-plan switch in the launch record. Keep independent recovery copies current.
