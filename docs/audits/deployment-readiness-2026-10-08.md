# First frontend deployment readiness — 2026-10-08

Target: the original `apps/web` frontend at `https://consumit.online`, using the existing Docker/Cloudflare deployment architecture.

**Current verdict: local release preparation is complete; public member traffic remains blocked on infrastructure and real integration verification.** The initial findings below are retained as historical evidence.

## Release remediation

- Readiness tests now inject a test environment instead of using developer configuration. The standard root `bun run test` passes: API 466, contracts 20, relay 47, next UI 199, next web 412, provider SDK 217, original UI 198, original web 414, and deployment scripts 12 — 1,985 checks. A stale second-frontend sidebar fixture now uses that frontend's storage namespace.
- All eight workspaces pass lint and type checks, and configured optimized workspace builds pass. Thirty disposable Postgres/Valkey integration checks pass, and the temporary containers are removed afterward. Production dependencies audit clean. Compose, both built Nginx configurations and Terraform formatting/init/validation pass. Alertmanager's own configuration validator accepts the private mounted configuration; its example destination still requires replacement and real delivery verification.
- Required Docker workspace manifests, Nginx includes and release support files are included in the release snapshot. The independent second frontend remains in the workspace, but production deploys the original `apps/web` target. Both trailing-blank-line findings are corrected.
- `production:prepare` creates an ignored `.env.production` with both origins set to `https://consumit.online` and fresh 256-bit authentication, local-container and Restic secrets. Preparation is idempotent. Production Compose replaces developer environment files; the wrapper discards inherited development integration and Compose settings. Private values and keys are excluded from the release.
- Production API startup rejects example peppers. Preflight rejects missing integrations, local database fallbacks and explicit database URI TLS modes weaker than `verify-full`. The backup image uses PostgreSQL 18 and system trust roots, matching that URI policy; the systemd service invokes the isolated production wrapper.
- The Cloudflare authentication rule now targets `/v1/auth/`. Private API requests bypass caching by default; only cookie-free title/anime catalog GETs are eligible. These are validated local Terraform changes; they have not been applied to Cloudflare.
- The production wrapper combines base, playback and production overlays in that order. It includes monitoring and configured playback, uses a private alert receiver file, and leaves the gateway behind the Tunnel. Render validation checks the HTTPS build/origin, service closure and absence of public service ports.

The VPS is not yet provisioned, and no offsite backup account or alert receiver has been selected. Real database/email/catalog settings, a provisioned Tunnel token, pinned backup SSH credentials and a live alert destination must be configured privately. `production:check` currently rejects those incomplete settings as intended. Existing local services, member stores and saved provider configuration are preserved.

Before accepting members, demonstrate public HTTPS smoke, real verification/recovery email, session revocation/private data checks, movie and exact series/anime playback with fallback and saved progress, alert delivery and an offsite restore. Confirm the database provider's recovery retention and keep a pre-migration snapshot. Physical Safari/casting and full-title provider canaries remain unverified. Follow [the production runbook](../runbooks/cloudflare-production.md); configuration preflight is not proof of operational readiness.

## Initial audit verification (before remediation)

| Check | Result |
| --- | --- |
| Workspace lint | All eight workspaces pass. |
| Workspace type checking | All eight workspaces pass. |
| Original app and dependency unit suites, invoked directly with Node/Vitest | API 465, contracts 20, relay 47, provider SDK 217, UI 196, web 414 pass: 1,359 checks. |
| Node deployment/backup script tests | All seven pass. |
| Disposable Postgres/Valkey integration | All 30 pass across seven files; migrations apply to the disposable database. Audit containers are removed afterward. |
| Standard `bun run test` | Fails on two API readiness tests. This is not counted as a pass. |
| Production dependency audit | No advisories returned by `bun audit --production --json`. |
| Full dependency audit | One high-severity `braces` advisory remains in the Next ESLint development dependency chain; no patched version is listed. |
| Infrastructure validation | Production/backup/playback Compose checks, both built Nginx configurations, and Terraform formatting/init/validation pass. |
| API Docker build | Passes with the frozen lockfile. |
| First frontend Docker build with the public HTTPS URL | Passes with the frozen lockfile and `NEXT_PUBLIC_SITE_URL=https://consumit.online`. Built as a separate audit image; the running app is preserved. |
| Fresh web image runtime packaging | Next 16.3.8, standalone server/static assets, and native Sharp image processing verified. Sharp is resolved through Next's dependency context; a direct app-level import is not a valid check of this transitive dependency. |
| Local HTTP smoke and API readiness | Pass; API readiness returns catalog, identity and database healthy. This is local configuration, not proof of production readiness. |
| Git whitespace check | Two trailing blank-line findings in the settings screen and playback tests. |

Raw logs and secret-free configuration summaries are in the ignored `.cache/deployment-audit/` directory. The 1,396 passing unit/script/integration checks above were run separately from the failing root command.

## Initial audit findings (addressed above where locally possible)

1. **Capture a complete release.** At audit start, Git reports 108 changed tracked files and 24 untracked entries (some entries are directories). `Dockerfile` requires `apps/next-web/package.json`, `packages/next-ui/package.json`, and `infra/nginx/request-limits.conf`, all currently untracked. New legal/ad/error surfaces and other release support files are untracked too. A fresh checkout of the current committed revision cannot reproduce this working-tree release. Review the intended files, commit the release, then build and verify from that immutable revision. Preserve unrelated work and ignored secrets.

2. **Make the standard test gate independent of local secrets.** `bun --filter @consumit/api test -- src/http/health.test.ts` reproduces two failures from the root. Running the same six tests inside `apps/api` passes; running all 465 API checks directly with Node passes. The affected tests call `buildApp` without an explicit environment, so Bun's root environment loading introduces the locally configured database into otherwise fake readiness scenarios. Fix isolation at the test boundary and repeat the normal root gate. Do not weaken application readiness or merely change assertions to accept an unavailable database.

3. **Finish the production environment.** Private evaluation of `compose.yaml + compose.production.yaml + compose.playback.yaml` confirms both the API origin and web build URL differ from `https://consumit.online`. `AUTH_CODE_PEPPER` is still a replacement-template value. The tunnel token is missing or a placeholder, and offsite Restic configuration is incomplete. Set both public origins, generate a new high-entropy pepper, provision the tunnel, and configure backup credentials privately. Existing database/email/catalog values being present does not prove production delivery or recovery. The currently running local API is in development mode.

4. **Correct the Cloudflare credential route.** `infra/cloudflare/main.tf:81` rate-limits `/v1/identity/`, while actual account routes in `apps/api/src/identity/routes.ts:76` use `/v1/auth/`. The intended edge authentication protection therefore misses registration/login/recovery. Application rate limits still exist and their integration tests pass. Align the edge rule and explicitly account for the active private API namespaces in its no-cache policy before applying production infrastructure.

5. **Complete backup and alert delivery.** Alertmanager still points at the documented local placeholder receiver. Configure and verify a real notification destination. The evaluated database URL contains `sslmode=require`, while production backup uses `PGSSLROOTCERT=system` and requires `verify-full`. A PostgreSQL 18 `pg_dump` probe using dummy credentials confirms this combination fails before connecting: `weak sslmode "require" may not be used with sslrootcert=system (use "verify-full")`. Configure the URI as the backup runbook specifies. Demonstrate the real offsite restore, at least seven days of database point-in-time recovery and separate-failure-domain snapshots before accepting member registrations.

6. **Verify the actual HTTPS release.** Run smoke tests at the public origin, real registration/email verification, password recovery and revocation, authenticated private reads/writes, a movie and exact series/anime episodes, playback fallback and persisted progress. Provision the reviewed provider configuration separately; the base production command alone does not enable playback. Any Worker relay must have matching approved origins, secrets and host policies. Keep a prior versioned image and a verified pre-migration snapshot available for rollback.

## Limits and release order

During the initial audit, no application sources, production secrets, member stores, saved provider settings or running app containers were changed. The subsequent local remediation is documented above. Fresh physical Safari/casting, full-episode provider soaks, live email delivery, real backup restoration, public HTTPS smoke and the browser playback matrix remain incomplete. Earlier release evidence is documented in `release-hardening-2026-10-07.md`; it does not close these production gates.

The public-domain fetch returned 403 through the browsing service; direct DNS probes also encountered resolver limitations. These results do not establish the domain's actual hosting state or a production outage.

Recommended order: repair the local test/edge-rule issues, review and commit a complete release, supply production configuration, deploy a restricted staging/canary at the domain, complete recovery and real member/playback checks, then open a small beta.

Advisory source: [GitHub's braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The development-only dependency chain was independently confirmed with `bun why braces`.
