# Consumit Backend Engineering Plan

> **Purpose:** Build the backend **touch by touch** without turning Consumit into an over-engineered mess.
>
> **Status:** Research-backed implementation plan, 2026-09-06. Updated for streaming + ads + lean-cost launch architecture.
>
> **Primary rule:** finish the smallest coherent backend slice, prove it, then move to the next one.
>
> This plan extends the existing `PROJECT-GUIDE.md`, `ARCHITECTURE.md`, `DELIVERY.md`,
> `LIBRARIES.md`, `OPEN-QUESTIONS.md`, `PRODUCT.md`, and `PROVIDERS.md`.
> Those files remain authoritative when they define product scope or an already-made decision.
>
> **Decision update (2026-09-06):** streaming remains a core Consumit capability and ads are back in
> scope as a first-class monetization surface. This explicitly supersedes any earlier "no ads"
> assumption for backend planning. The product/architecture source docs should be synchronized with
> this decision when they are next updated so agents do not receive conflicting instructions.

---

# 0. Executive decision

The right backend architecture for Consumit is **not microservices**.

Use a **modular monolith first**:

```text
Cloudflare
   |
   v
Next.js web
   |
   v
Fastify API
   |
   +--> catalog
   +--> identity
   +--> library
   +--> social
   +--> playback
   +--> ads
   +--> personalization
   |
   +--> Postgres          durable member and product truth
   +--> process memory    bounded cache / single-flight / hot health
   +--> Valkey-auth       sessions, auth challenges, reservations, auth limits
   |
   +--> import worker     durable Letterboxd matching jobs claimed from Postgres
   |
   +--> authorized media providers/CDNs ---- media bytes ----> browser
   +--> ad network/CDN ---------------------- ad creative ----> browser
```

The API stays one deployable system until **measured load, security isolation, or operational
ownership** creates a real reason to split it.

That gives us:

- simple local development;
- cheap infrastructure;
- one codebase and one deployment story;
- transactions where they actually matter;
- strong module boundaries without network calls between our own modules;
- a clean path to extract workers/services later.

The goal is **boring architecture with sharp boundaries**, not clever architecture.

---

# 1. What we keep from the current architecture

These existing decisions are good and should stay:

1. Bun workspaces.
2. Next.js web + Fastify API.
3. Shared Zod contracts.
4. TMDB as canonical metadata identity.
5. Postgres for durable member/product data; it does not store sessions.
6. Dedicated Valkey authentication state for opaque sessions, challenges, Username reservations, and authentication rate limits.
7. Provider quirks hidden behind adapters.
8. First-party Consumit Player.
9. Streaming remains a core product path, with direct provider/CDN → browser delivery preferred.
10. Ads are a first-class monetization module, but ad failure never blocks playback.
11. Progress stored by member + title/episode, never by stream URL.
12. Server-side cookie sessions, never localStorage auth tokens.
13. Deterministic fakes and fixture-driven tests.
14. Stateless request-serving processes.
15. External output is untrusted until validated.
16. Every external request is bounded.
17. Provider failure is treated as a normal operating state.
18. Queues, ClickHouse, multiple regions, orchestration, etc. arrive only when measured need exists.

---

# 2. Research-backed refinements I would add

These are the important upgrades to the existing plan.

## 2.1 Fastify should own the HTTP boundary, not the business rules

Each module gets an interface that callers program against.

```text
route
  -> validate request
  -> authenticate
  -> authorize
  -> call module/use-case
  -> map typed result/error
  -> serialize response
```

Business logic must not live inside route handlers.

Use Fastify's plugin/encapsulation model so module-specific hooks and dependencies do not
leak globally.

### Rule

A route should mostly answer:

- what input is accepted?
- who may call this?
- which use-case is called?
- what status/response is returned?

It should **not** know:

- SQL;
- Prisma query details;
- provider scraping/parsing;
- Redis/Valkey command details;
- ranking math;
- password hashing internals;
- cache implementation.

---

## 2.2 Validate responses too, not only requests

The existing Zod boundary is good, but request-only validation is incomplete.

Every public route should have schemas for:

- params;
- query;
- body;
- success response;
- expected error responses where practical.

Why:

- prevents accidental leaking of internal fields;
- makes API drift visible in tests;
- gives frontend/backend one real contract;
- lets Fastify serialize predictable output efficiently.

Keep `@consumit/contracts` as the **public/domain contract**.

Do **not** expose Prisma models/types directly to the web package.

Database shape and HTTP shape are different contracts.

---

## 2.3 Keep authentication Valkey separate from disposable caching

The active identity design requires Valkey even with one API instance because sessions,
verification/recovery challenges, Username reservations, and authentication limits are
recoverable-but-ephemeral state with atomic operations and expiry.

For the first production topology:

```text
Postgres
  -> members
  -> credentials
  -> profiles and aliases
  -> durable progress/library/social truth

Valkey-auth
  -> opaque server sessions (hashed tokens only)
  -> verification and recovery challenges (code HMACs only)
  -> pending Username reservations
  -> authentication rate-limit state

process memory
  -> bounded LRU/read-through cache
  -> single-flight/request coalescing
  -> short-lived provider health snapshots
  -> disposable hot data
```

Do not mix disposable catalog/resolver cache into the authentication instance. Add a separate
cache reliability class only when shared catalog or playback acceleration is measured as useful.

### `Valkey-auth`

Use for:

- server sessions;
- verification and recovery challenges;
- pending Username reservations;
- authentication rate limits.

Recommended operating direction:

- `maxmemory-policy=noeviction`;
- authentication / ACLs;
- TLS when remote;
- AOF every second;
- explicit memory limit + alerts.

### `Valkey-cache` (later)

Use later for:

- resolver cache;
- negative cache;
- metadata cache;
- hot-title cache;
- learned provider score snapshots that can be rebuilt.

Recommended operating direction:

- TTLs everywhere;
- bounded memory;
- deliberate eviction policy;
- disposable/rebuildable data.

### Why split?

Cache wants eviction. Authentication state does not. Use separate instances or rigorously
isolated namespaces and memory policies. Total loss of `Valkey-auth` safely logs members out and
invalidates pending codes; it never removes durable member data.

---

## 2.4 Cost-control is part of the architecture

The cheapest high-quality system is the one that avoids becoming the bandwidth pipe.

Hard cost rules:

1. **Media bytes are direct-first.** Authorized provider/CDN → browser whenever technically and
   contractually permitted.
2. **Lease proxy is an exception.** Proxy only header-locked sources that truly require it.
3. **Ad creatives are direct.** Ad network/CDN → browser; Consumit owns policy and telemetry, not
   the creative bandwidth.
4. **One production compute box first.** Web + API + resolver + tiny worker can share one VPS while
   load is small.
5. **Managed Postgres is worth paying for.** Irreplaceable member data gets backups/PITR; cheap
   stateless compute can be replaced.
6. **Use free edge/observability/email tiers while they fit.** Do not buy enterprise tooling before
   usage requires it.
7. **Cache in layers.** Edge → bounded process memory → shared cache only when necessary → upstream.
8. **Browser automation is not a default resolver technique.** Prefer HTTP/JSON/HTML parsing;
   reserve browser pools for integrations that genuinely require execution.
9. **Telemetry is batched and meaningful.** Never create a database write for every playback tick.
10. **Scale on a measured bottleneck, not projected DAU.**

Target launch infrastructure budget: **roughly $20–30/month plus domain/tax/IP extras**, subject to
current vendor pricing and actual database usage.

The target is not the absolute cheapest bill. The target is the lowest bill that still preserves:

- durable member data;
- secure authentication;
- good playback startup;
- clean fallback behavior;
- useful observability;
- safe deploy/rollback.

---

## 2.5 Treat database migrations as production code

Never let an agent casually mutate production schema.

Every schema change must be:

1. planned;
2. generated/authored as a migration;
3. reviewed;
4. tested against a real Postgres database;
5. checked for backward compatibility;
6. applied from CI/release automation;
7. verified after application.

Use **expand → migrate/backfill → switch → contract** for risky changes.

Example:

```text
BAD
rename column + deploy new app + hope

GOOD
1. add new nullable column
2. deploy code that writes old + new
3. backfill
4. switch reads to new
5. stop writing old
6. later remove old column
```

A code rollback must remain possible after a normal schema migration.

---

## 2.6 Real Postgres in integration tests

Do not use SQLite as a fake Postgres.

For persistence slices, integration tests run against an isolated Postgres database.

Why:

- constraints differ;
- locking differs;
- isolation differs;
- indexes differ;
- SQL features differ;
- migration behavior differs.

Use deterministic fixtures and reset state between tests.

Keep most tests fast and fake-driven; use the real DB only where database behavior is the
thing being tested.

---

## 2.7 Transactions stay short

Inside a database transaction:

- read/write only what must be atomic;
- never call TMDB;
- never call a provider;
- never send email;
- never wait on an HTTP service;
- never perform slow media validation.

External work happens before/after the transaction.

If a durable side effect must happen after commit, introduce a transactional outbox **only when
that requirement exists**.

Do not add event sourcing.

---

## 2.8 Idempotency must be designed, not patched later

Operations likely to be retried must be safe to repeat.

Examples:

- save title;
- favorite title;
- set rating;
- update progress;
- follow;
- provider fallback request;
- background jobs;
- import processing.

Prefer natural/database idempotency first:

```text
UNIQUE(member_id, title_kind, tmdb_id)
UNIQUE(follower_id, followed_id)
UNIQUE(member_id, title_kind, tmdb_id)   -- rating
```

Use explicit idempotency keys only for operations where uniqueness alone cannot protect the
side effect.

---

## 2.9 Observability starts small, before production debugging hurts

Three signals:

1. **structured logs**
2. **metrics**
3. **traces**

Start with structured Pino logs immediately.

Use OpenTelemetry for traces/metrics only after a compatibility smoke test with the exact
Bun + Fastify runtime. OpenTelemetry JavaScript officially documents Node.js support; do not
blindly assume every auto-instrumentation package behaves identically on Bun.

If auto-instrumentation is unstable:

- keep Bun;
- use manual spans around important operations;
- export through OTLP;
- do not block the product on tracing perfection.

Keep Pino/Loki for logs. OpenTelemetry JS logs are not as mature as traces/metrics.

---

# 3. Target backend shape

Keep the existing module style instead of creating a giant enterprise hierarchy.

```text
apps/api/src/
  app.ts
  index.ts

  config/
    env.ts

  http/
    errors.ts
    request-context.ts
    csrf.ts

  catalog/
    catalog.ts
    routes.ts
    errors.ts
    fake-catalog.ts
    tmdb-catalog.ts
    *.test.ts

  identity/
    identity.ts
    routes.ts
    errors.ts
    fake-identity.ts
    postgres-repository.ts
    password.ts
    valkey-auth-state.ts
    *.test.ts

  library/
    library.ts
    routes.ts
    errors.ts
    fake-library.ts
    postgres-library.ts
    *.test.ts

  social/
    social.ts
    routes.ts
    errors.ts
    fake-social.ts
    postgres-social.ts
    *.test.ts

  playback/
    playback.ts
    routes.ts
    errors.ts
    fake-playback.ts
    resolver.ts
    scheduler.ts
    valkey-auth-state.ts
    *.test.ts

  ads/
    ads.ts             # ad policy/interface; playback never imports an ad vendor directly
    routes.ts          # optional client ad config/events boundary
    policy.ts          # placement, frequency, eligibility, fail-open behavior
    fake-ads.ts
    <network>-ads.ts   # real VAST/ad-network adapter only when selected
    *.test.ts

  personalization/
    personalization.ts
    ...

  internal/
    health/
    provider-admin/

  workers/
    # add entry points only when a real queue exists
```

Do **not** create every directory now.

Create a directory only when its slice begins.

Do not move the existing catalog module just to make the tree prettier.

---

# 4. Dependency direction

The dependency direction should stay boring:

```text
web
 |
 v
HTTP contracts
 |
 v
module interface
 |
 v
business/use-case logic
 |
 +--> repository / storage adapter
 +--> upstream adapter
 +--> ad-network adapter when inside the ads module
 +--> queue port
 +--> telemetry port
```

Forbidden dependencies:

```text
web ----------X----> Prisma
web ----------X----> provider adapter
route --------X----> raw SQL
social -------X----> provider parser
catalog ------X----> member credentials
provider -----X----> profile/library data
worker -------X----> page code
```

A provider gets the minimum information required to resolve playback.

The ads module is equally isolated: the resolver does not know about ads, and the ad network does
not receive provider internals, member credentials, or social data. The player/controller may
coordinate an ad break, but **ad availability is never a prerequisite for media availability**.

---

# 5. Storage ownership

## Postgres = durable truth

Owns:

- members;
- credentials;
- profile settings;
- privacy settings;
- follows/circle relationships;
- saved titles;
- favorites;
- ratings;
- reviews;
- lists;
- list items;
- watch history;
- durable progress;
- stable catalog references;
- durable provider aggregates/configuration where required;
- durable playback audit/history only if product/operations need it.

Postgres does not own sessions, verification challenges, recovery challenges, Username
reservations, or authentication rate-limit state.

## Process memory = cheap disposable acceleration at launch

Owns only bounded/rebuildable state:

- catalog hot cache;
- in-process single-flight;
- short provider-health snapshots;
- tiny negative/hot caches with TTLs.

A restart may erase this state without corrupting the product.

## Valkey-auth = active recoverable authentication state

Owns:

- hashed opaque server sessions;
- verification and recovery challenges;
- pending Username reservations;
- authentication rate limits.

Run it with `noeviction`, AOF every second, and no catalog-cache mixing.

## Valkey-cache = later disposable acceleration

Owns:

- resolver discovery cache;
- temporary source cache;
- negative cache;
- hot-title cache;
- provider score snapshots;
- cache-only metadata.

## ClickHouse = later, raw high-volume analytics

Only introduce when raw playback telemetry becomes a real Postgres/operations burden.

Postgres must not become the dumping ground for every player heartbeat.

---

# 6. Database rules

## 6.1 IDs

Use opaque, non-sequential public identifiers for member-owned resources.

Do not expose simple auto-increment IDs as security boundaries.

Authorization always checks ownership/visibility independently of ID unpredictability.

## 6.2 Time

- UTC in storage.
- Convert for display at the edge/client.
- Store timezone only when the product meaning requires it.

## 6.3 Constraints

The database enforces invariants too.

Examples:

- unique normalized email;
- unique follow pair;
- unique favorite per member/title;
- unique saved title per member/title;
- unique rating per member/title;
- rating range check;
- no self-follow;
- list item belongs to its list;
- foreign keys have an explicit delete strategy.

Do not rely on TypeScript alone for data correctness.

## 6.4 Indexes

Every index should answer a real query.

Initial examples:

```text
progress(member_id, updated_at desc)
watch_history(member_id, watched_at desc)
follow(follower_id, followed_id)
follow(followed_id, follower_id)
review(member_id, created_at desc)
review(title_kind, tmdb_id, created_at desc)
list(owner_id, updated_at desc)
list_item(list_id, position)
```

Before adding a complex index:

1. capture the query;
2. inspect the plan;
3. measure;
4. add index;
5. measure again.

## 6.5 Pagination

Use cursor/keyset pagination for growing feeds:

- activity;
- reviews;
- diary/history;
- followers;
- list discovery.

Offset pagination is acceptable for small bounded/admin data.

## 6.6 Query timeouts

Production database connections should have sane guards for:

- statement execution;
- lock waits;
- idle transactions.

Do not globally choose aggressive numbers without measuring.

The rule is: **a stuck query must not be allowed to hold the backend forever**.

## 6.7 Connection pooling

Application traffic uses a pooled connection path.

Migration/admin tooling uses a direct connection path when the provider supplies both.

Never let each horizontally scaled API process open an unbounded number of Postgres
connections.

---

# 7. API rules

## 7.1 Versioning

Keep public API under `/v1`.

Prefer additive compatible changes inside a version.

Create `/v2` only for a real breaking contract.

## 7.2 Error envelope

Keep the existing shape:

```json
{
  "error": {
    "code": "SOME_STABLE_CODE",
    "message": "Human readable message",
    "retryable": false
  }
}
```

Rules:

- stable machine code;
- safe human text;
- never dump stack traces;
- never return raw upstream/provider errors;
- log internal diagnostics with trace/request ID.

## 7.3 Cache headers

Only public/safe reads get shared caching.

Never CDN-cache:

- member private data;
- session-specific responses;
- auth;
- privacy-sensitive social data.

Use stale-while-revalidate only where stale data is acceptable.

## 7.4 Request size

Keep small JSON body limits.

Uploads get explicit separate limits and handling.

A normal JSON endpoint should never accept an enormous body "just in case."

## 7.5 Authorization

The server derives member identity from the authenticated session.

Do not trust:

```json
{ "memberId": "..." }
```

from the client to define ownership.

Bad:

```text
SELECT * FROM review WHERE id = :id
then compare owner in application
```

Better:

```text
UPDATE review
SET ...
WHERE id = :id
  AND member_id = :authenticated_member
```

Ownership belongs in the data operation whenever practical.

---

# 8. Identity/security baseline

Identity is the first real persistence slice after the existing catalog.

Before implementation, resolve the existing product decisions:

- launch auth methods;
- verification behavior;
- password recovery;
- account deletion/export;
- privacy defaults.

## 8.1 Session cookie

Recommended session shape:

```text
cookie: __Host-consumit_session
Secure
HttpOnly
SameSite=Lax (or Strict if UX allows)
Path=/
no Domain attribute
```

Session value is an opaque high-entropy token.

Store a hash/HMAC-derived representation server-side rather than storing the raw bearer token
when practical.

Rotate sessions:

- after login;
- after password reset/change;
- after privilege-sensitive changes;
- after suspicious auth events.

Logout deletes server-side state.

"Logout all devices" deletes all sessions for the member.

## 8.2 CSRF

SameSite is defense-in-depth, not the entire CSRF strategy.

For cookie-authenticated mutations:

- require exact `Origin === APP_ORIGIN`; reject missing or cross-site origins;
- when present, require `Sec-Fetch-Site` to be `same-origin` or `none`;
- never mutate state through `GET`.

## 8.3 Passwords

Use Argon2id.

Current OWASP minimum guidance is at least approximately:

```text
memory: 19 MiB
iterations: 2
parallelism: 1
```

Benchmark on the production class of CPU and increase cost when practical.

Never:

- SHA-256 passwords;
- reversible encryption;
- plaintext;
- password in logs.

## 8.4 Account enumeration

Login, reset, verification, and registration flows should not reveal whether a user exists
through obvious response differences.

Rate-limit sensitive auth routes much harder than normal browsing routes.

## 8.5 Secrets

- never commit;
- never log;
- never expose to Next.js/browser bundles;
- one secret per purpose where possible;
- rotate;
- production values from environment/secret storage;
- `.env.example` contains names, never secrets.

## 8.6 Proxy trust

Because Cloudflare/reverse proxies exist, configure `trustProxy` narrowly.

Do not trust arbitrary `X-Forwarded-*` headers from the public internet.

---

# 9. Health and shutdown

Do not build one global "everything is dead" health endpoint.

Use separate concepts:

## `/health/live`

Answers:

> Is this process alive and its event loop/server functioning?

Should not fail only because TMDB, a provider, or cache is down.

## `/health/ready`

Answers:

> Can this process safely receive requests?

Use for deployment/load-balancer readiness.

Do not make every optional dependency a readiness hard-failure.

## `/internal/health/dependencies`

Reports:

- Postgres;
- Valkey-critical;
- Valkey-cache;
- TMDB;
- worker/queue;
- provider health aggregates.

Internal/admin only.

### Graceful shutdown

On SIGTERM/SIGINT:

1. stop accepting new work;
2. let Fastify drain in-flight requests;
3. stop queue consumers;
4. close DB pool;
5. close Valkey clients;
6. flush bounded telemetry;
7. exit.

Never kill a process mid-migration or halfway through an in-flight durable write if it can be
avoided.

---

# 10. Logging

Use Fastify/Pino JSON logs in production.

Every request log should make correlation easy.

Useful fields:

```text
request_id
trace_id
method
route
status_code
duration_ms
module
error_code
provider_id         when relevant
playback_session_id when relevant
```

Avoid:

- password;
- session cookie;
- auth header;
- reset/verification code;
- raw provider URL when sensitive;
- full request/response bodies;
- email unless genuinely required;
- secrets.

Use log redaction.

Generate/validate your own request IDs instead of blindly trusting arbitrary caller-provided
IDs.

---

# 11. Testing strategy

Do not chase "100% coverage."

Chase confidence at the boundaries that can break the product.

## Layer A — pure/unit tests

Fast.

Use for:

- ranking math;
- normalization;
- policy rules;
- privacy visibility;
- error mapping;
- progress calculations;
- source dedupe;
- cache TTL calculations.

## Layer B — module interface tests

Every real module and fake must satisfy the same behavior contract where possible.

Example:

```text
identity contract suite
  -> fake identity
  -> postgres identity
```

This prevents the fake from becoming fantasy behavior.

## Layer C — Fastify route tests

Use `app.inject()`.

Test:

- validation;
- status codes;
- auth;
- authorization;
- cookies;
- headers;
- error envelopes;
- response schemas;
- rate-limit behavior where important.

No bound TCP port needed.

## Layer D — Postgres integration

Real Postgres.

Test:

- constraints;
- transactions;
- concurrency;
- migrations;
- indexes for critical queries;
- authorization-in-query behavior.

## Layer E — provider contract tests

Fixture-driven, no live network in CI.

Required:

- movie;
- episode;
- special characters;
- non-ASCII;
- unknown title;
- timeout;
- malformed response;
- expired URL;
- header-locked result where legally permitted.

## Layer F — acceptance/e2e

A small number of full jobs:

```text
register -> session -> profile
save -> library
playback fake resolve -> progress -> resume
follow -> activity visibility
```

## Layer G — load/failure tests

Only for hot paths.

Scenarios:

- cached resolve;
- cold resolve;
- hot-title stampede;
- one provider slow;
- one provider dead;
- Valkey-cache down;
- Valkey-critical reconnect;
- DB latency;
- worker restart;
- deploy while requests are active.

---

# 12. CI/CD quality gates

## Pull request gate

Run:

```text
lint
typecheck
unit tests
module/interface tests
Fastify route tests
Postgres integration tests when persistence code changed
migration integrity/check when schema changed
provider contract tests when provider code changed
build
```

A PR does not merge with ignored/red checks.

## Staging gate

1. deploy reviewed migration;
2. deploy app;
3. smoke test;
4. auth flow smoke;
5. catalog smoke;
6. library/social smoke when those modules exist;
7. playback synthetic tests when authorized providers exist;
8. inspect error/latency signals.

## Production gate

Prefer:

```text
backward-compatible migration
        ->
small/canary app release
        ->
watch SLO/error signals
        ->
continue rollout
```

If app quality degrades:

- roll back application code first;
- keep backward-compatible schema;
- do not improvise destructive DB rollback under pressure.

---

# 13. The touch-by-touch implementation sequence

This is the most important section.

**Do not ask an AI agent to "build the backend."**

Give it **one touch** at a time.

Each touch must leave the repo green.

---

## PHASE 0 — Freeze the execution boundary

### Touch 0.1 — Baseline

Goal:

- confirm current root `bun run check` passes.

Do:

- no feature work;
- record current failures if any;
- fix only blockers that make later verification impossible.

Exit:

```text
install ✓
lint ✓
typecheck ✓
test ✓
build ✓
```

### Touch 0.2 — Backend decision register

Create/update one small decision table for:

- auth methods;
- privacy defaults;
- database provider;
- launch region;
- authorized provider set.

Do not silently decide unresolved product questions in code.

### Touch 0.3 — No speculative dependencies

Review installed backend packages.

Remove nothing casually.

Add nothing until a named touch requires it.

---

# PHASE 1 — Harden the API foundation

No database business logic yet.

## Touch 1.1 — App factory remains the center

Ensure:

```text
buildApp(deps/options) -> FastifyInstance
index.ts -> listen only
```

Tests use the app factory.

No test needs a real network port for route behavior.

## Touch 1.2 — Environment validation

One Zod env schema.

Fail fast on invalid production config.

Separate:

```text
required always
required in production
optional/deferred
```

No `process.env` scattered through modules.

## Touch 1.3 — Global error translation

One error mapper.

Categories:

```text
validation
authentication
authorization
not found
conflict
rate limited
dependency unavailable
timeout
internal
```

All become the existing stable error envelope.

Unknown internal errors get a safe message + internal trace.

## Touch 1.4 — Request context + logging

Add:

- generated request ID;
- trace ID field/seam;
- Pino redaction;
- duration;
- module/error code context.

Exit:

A failing request can be found in logs from one ID without exposing secrets.

## Touch 1.5 — Security plugins

Confirm/configure:

- helmet;
- CORS disabled for the one-origin browser architecture;
- body limit;
- trusted proxy rules;
- rate-limit base plugin.

Do not define aggressive route limits globally.

Sensitive routes get their own later.

## Touch 1.6 — Health endpoints

Add:

```text
GET /health/live
GET /health/ready
```

Internal dependency detail remains separate.

## Touch 1.7 — Graceful shutdown

Add lifecycle cleanup hooks and signal handling.

Write a test around app closure where practical.

## Touch 1.8 — Response contracts

Extend one existing catalog route first.

Prove:

- Zod request schema;
- response schema;
- serialization;
- typed route.

Then repeat incrementally when touching other routes.

Do not refactor every route in one giant PR.

### Phase 1 exit gate

- current catalog still works;
- all checks green;
- secrets are redacted;
- controlled errors;
- health endpoints work;
- shutdown is clean;
- no DB added unless the identity slice begins.

---

# PHASE 2 — Persistence foundation, introduced through identity

Do not create a generic "platform database project."

The first DB exists because identity needs persistence.

## Touch 2.1 — Postgres + ORM spike

Use Postgres.

The current architecture recommends Prisma.

Keep Prisma pinned to the installed stable `7.10.x` line for this slice, matching Prisma's Bun
guidance. Track the Prisma 8 upgrade separately rather than adopting a release candidate while
identity persistence is being established.

Before committing it:

- install in a focused branch/touch;
- connect to local Postgres;
- run one query under the exact Bun API runtime;
- run tests;
- verify migration workflow;
- verify build/deploy image.

If it is clean, keep it.

If it creates runtime instability, stop and reassess before modeling the entire database.

## Touch 2.2 — Connection lifecycle

Create one DB client at process scope.

Wire close lifecycle.

No module instantiates its own pool.

Application queries use pooled DB access in production.

Migration tooling uses direct DB access where the provider offers it.

## Touch 2.3 — Migration discipline

Create the first reviewed migration.

Rules:

- checked into git;
- human-readable diff;
- no production `db push` shortcut;
- migration integrity checked in CI;
- deploy migration from release automation.

## Touch 2.4 — Real DB test harness

Add isolated Postgres integration tests.

Keep unit/route tests independent unless DB behavior is the purpose.

## Touch 2.5 — DB operational guardrails

Configure/test:

- SSL to managed Postgres;
- connection limit;
- statement timeout strategy;
- lock timeout strategy;
- idle transaction protection.

## Touch 2.6 — Backup requirement

Before real member data exists in production:

- managed backups enabled;
- PITR enabled if offered;
- retention documented;
- restore procedure written;
- restore tested at least once.

A backup that has never been restored is a theory.

---

# PHASE 3 — Identity vertical slice

This slice replaces the browser-only preview session with real server authority.

## Touch 3.1 — Resolve identity decisions

Before route implementation, explicitly decide:

- email/password: yes;
- OAuth providers: excluded from the active product;
- email verification: mandatory before account creation and session issuance;
- recovery: six-digit, ten-minute email challenge;
- sessions: Valkey-backed, 30-day idle and 90-day absolute lifetime;
- account deletion/export: supported;
- privacy defaults: private.

These are resolved product and architecture decisions, not deferred options.

## Touch 3.2 — Identity contract

Define only what web needs now.

Example interface shape:

```ts
interface Identity {
  register(...)
  login(...)
  logout(...)
  getSession(...)
  getMember(...)
}
```

Do not expose Prisma.

## Touch 3.3 — Member + credential schema

Minimal tables first.

Suggested concepts:

```text
member
credential
profile
```

Durable member, credential, and profile rows are created transactionally only after verification.

## Touch 3.4 — Password service

One password module:

```text
hash(password)
verify(hash, password)
```

Argon2id.

No hashing logic in routes.

## Touch 3.5 — Launch session persistence

Use the dedicated authentication Valkey instance.

Suggested direction:

```text
session key -> member id, created/last-seen/absolute expiry, authVersion
```

Rules:

- raw bearer token is not stored when a derived/hash representation is practical;
- expiry is indexed;
- expired/revoked cleanup is bounded;
- one member can support multiple device sessions;
- logout deletes/revokes the server-side session;
- logout-all invalidates every member session;
- keep at most 20 active sessions per member;
- enforce idle and absolute expiry atomically.

## Touch 3.6 — Session store

Implement opaque server sessions.

Session record contains only what is needed, e.g.:

```text
session hash/id
member id
created at
last seen
expires at
auth/version state
```

Never put whole profiles into session state.

## Touch 3.7 — Register

End-to-end:

```text
POST register
 -> validate
 -> throttle
 -> normalize email
 -> hash password
 -> reserve Username and store the pending challenge in Valkey
 -> send verification email through the notifier seam
 -> return the enumeration-safe generic 202 response
```

Verification atomically consumes the challenge, creates member + credential + profile in
Postgres, then issues the first session. Unverified registrations never receive sessions.

## Touch 3.8 — Login

Test:

- correct;
- wrong password;
- unknown email;
- throttling;
- generic failure text;
- cookie security.

## Touch 3.9 — Current session

Add:

```text
GET /v1/me
```

or the already-chosen equivalent.

Web removes trust in preview session.

## Touch 3.10 — Logout

Server deletes session.

Client cookie expires.

## Touch 3.11 — Session rotation

Rotate after authentication and sensitive changes.

## Touch 3.12 — Recovery/verification

Verification and recovery are required at launch. Their challenge HMACs, attempts, resend
cooldowns, and expiry live in `Valkey-auth`.

Do not store plaintext reset tokens.

### Phase 3 exit gate

One real member can:

```text
register
login
refresh page
remain signed in
load safe profile identity
logout
```

Security tests pass.

Browser preview state is no longer authoritative.

---

# PHASE 4 — Library vertical slice

Build the member value loop before social complexity.

Order:

```text
save
favorite
progress
history
resume
```

## Touch 4.1 — Library contract

Stable interface only.

## Touch 4.2 — Saved titles

Use a database uniqueness constraint.

Saving twice returns the same logical state.

## Touch 4.3 — Favorites

Separate semantic concept from save.

Do not encode them as one boolean with ambiguous meaning.

## Touch 4.4 — Progress

Canonical key:

```text
member + movie
member + series episode
```

Never provider URL.

Use idempotent upsert.

### Progress write policy

Do not write every video timeupdate event to Postgres.

Client/controller should send progress:

- periodically at a reasonable interval;
- after meaningful seek;
- pause;
- page/player exit best-effort;
- playback end.

Server coalesces/ignores meaningless tiny regressions where appropriate.

## Touch 4.5 — Resume

Read progress + catalog identity.

Source resolution remains completely independent.

## Touch 4.6 — History/diary

Create/update factual watch history from playback lifecycle.

Do not create fake history because a detail page was opened.

### Phase 4 exit gate

```text
watch fake/test title
 -> progress stored
 -> leave
 -> return
 -> resume position is correct
```

Provider/source identity can change without losing progress.

---

# PHASE 5 — Social vertical slice

Do not start until privacy defaults are explicitly resolved.

## Touch 5.1 — Privacy policy as code

Define visibility rules centrally.

Example dimensions:

```text
profile
diary/history
ratings
reviews
lists
follows/activity
```

Test every visibility rule as pure logic first.

## Touch 5.2 — Follow

One-way relationship.

DB constraints:

- unique pair;
- no self-follow.

No friend-request system.

## Touch 5.3 — Ratings

One member/title rating.

Idempotent update.

DB check for valid range.

## Touch 5.4 — Reviews

Review ownership and visibility enforced server-side.

Spoiler is explicit metadata, not inferred.

## Touch 5.5 — Lists

Start simple:

```text
list
list_item
position
```

Use an atomic transaction for reorder.

Do not implement CRDTs/collaborative real-time editing.

## Touch 5.6 — Activity

At first, store/query a small durable activity representation only for shipped actions.

Do not create Kafka.

If feed construction becomes expensive, then introduce an outbox/worker strategy.

## Touch 5.7 — Feed pagination

Cursor pagination.

Privacy filtering happens before returning data.

### Phase 5 exit gate

A member can:

```text
follow
rate/review
create/view list
see permitted activity
```

Private data never appears through another member's route.

---

# PHASE 6 — Playback contract before real providers

Streaming remains a core Consumit product capability.

Playback remains blocked by the authorized provider decision.

Cost/reliability invariant for every later playback implementation:

```text
Consumit resolves / validates / ranks / tracks
                |
                +---- control-plane KBs ----> browser

Authorized provider/CDN --------------------> browser
                     media bytes direct-first
```

Consumit must not become the default video bandwidth pipe.

## Touch 6.1 — Provider contract

Create only:

```text
input contract
result contract
failure codes
fake provider
contract test suite
```

No real provider.

## Touch 6.2 — Playback module with fake resolver

Prove the application flow:

```text
watch
 -> resolve fake source
 -> create playback session
 -> return source
 -> send player events
 -> save progress
 -> request fake fallback
```

This lets us test the product without tying architecture to a provider.

## Touch 6.3 — Playback telemetry vocabulary

Standardize events now:

```text
RESOLVE_STARTED
PROVIDER_STARTED
PROVIDER_SUCCESS
PROVIDER_FAILED
MANIFEST_LOADED
PLAYBACK_STARTED
BUFFER_STARTED
BUFFER_ENDED
PLAYER_ERROR
SOURCE_SWITCHED
PLAYBACK_ENDED
```

Validate client event schemas.

Never trust arbitrary player event payloads.

### Phase 6 exit gate

The full Watch UX works against deterministic fake media behavior.

---

# PHASE 7 — Authorized provider pilot

Only after rights/region/delivery permissions are explicit.

Use `PROVIDERS.md` sequencing.

## Touch 7.1 — Triage

Classify authorized candidates:

```text
direct
header-locked
embed-only
```

Product rule remains:

- direct preferred;
- header-locked only through audited lease proxy when allowed;
- embed-only excluded.

## Touch 7.2 — One provider adapter

Port only extraction logic.

Replace surrounding research-app assumptions.

Every result Zod-validates at the seam.

Full fixture contract suite before merge.

## Touch 7.3 — Second provider

Now the resolver has a real fallback choice.

Do not add 20 providers immediately.

## Touch 7.4 — Third provider

Only after first two prove the seam.

Then measure.

### Phase 7 exit gate

2–3 authorized providers pass the same contract suite and produce stable normalized sources.

---

# PHASE 8 — Resolver and playback hardening

This is where Consumit becomes meaningfully stronger than a naive streaming resolver.

## Touch 8.1 — Candidate scheduler

Per provider:

- hard timeout;
- concurrency ceiling;
- RPS limit;
- burst limit;
- bounded queue.

One bad provider cannot exhaust the API.

## Touch 8.2 — Hedged execution

Start best candidate.

Start backup only when unresolved after measured delay.

Do not race every provider on every cache miss.

Initial values may use the architecture's rough offsets, but production values come from
telemetry.

## Touch 8.3 — Validation + dedupe

Normalize/dedupe equivalent sources.

Expired/malformed sources never enter ranking.

## Touch 8.4 — Circuit breaker

Per provider:

```text
CLOSED
 -> repeated failure
OPEN
 -> cooldown
HALF_OPEN
 -> probes
CLOSED
```

Do not use one global provider-health boolean.

## Touch 8.5 — Learned ranking

Begin with a transparent score.

Store rolling/recent aggregates.

Do not train an ML model.

Suggested inputs already defined by the architecture:

- success rate;
- time to first frame;
- resolver latency;
- buffering;
- fatal error rate;
- quality;
- subtitle availability;
- recent health.

## Touch 8.6 — Single-flight

Concurrent miss for the same resolution key produces one refresh.

Everyone else awaits/reuses it.

## Touch 8.7 — Shared resolver cache

Now introduce `Valkey-cache` if multiple processes/shared resolver state justify it.

Separate:

```text
discovery record
temporary access/source record
negative record
```

Never cache an expiring source beyond its safe lifetime.

## Touch 8.8 — Playback sessions

Short-lived operational session:

```text
member
title/episode
provider
source
position
fallback history
errors
region/quality where needed
```

Durable progress remains Postgres.

## Touch 8.9 — Fallback

When source fails:

1. record structured failure;
2. exclude failed source/provider as appropriate;
3. resolve next valid source;
4. update playback session;
5. seek to retained position;
6. resume;
7. emit `SOURCE_SWITCHED`.

## Touch 8.10 — Synthetic health probes

Use known authorized test titles.

Probes feed health.

Synthetic traffic is marked separately from member traffic.

## Touch 8.11 — Media-cost telemetry

Track the economics of the playback path explicitly:

```text
direct_playback_sessions
proxied_playback_sessions
direct_playback_ratio
proxy_bytes
proxy_minutes
proxy_cost_per_watch_hour
resolver_requests_per_watch
provider_calls_per_cold_resolve
```

Target direction: **well above 90% direct delivery**, and ideally materially higher, subject to
what the authorized provider set technically supports.

A new provider that forces broad video proxying must justify the bandwidth/reliability cost before
becoming a primary source.

---

# PHASE 9 — Ads & monetization vertical slice

Ads are part of the new Consumit product, but they are **not part of the resolver** and they never
own media availability.

Core architecture:

```text
PlaybackController
      |
      +--> MediaController ----> authorized media provider/CDN ----> browser
      |
      +--> AdController -------> ad network/CDN -------------------> browser
```

The backend owns ad **policy**, eligibility, coarse frequency rules, consent state where required,
and safe telemetry. The selected ad platform should serve the creative directly whenever possible.

### Non-negotiable invariant — fail open

```text
ad request
   |
   +--> success -> play eligible ad -> continue media
   |
   +--> timeout / empty / malformed / blocked / vendor outage
                       |
                       +--> continue media
```

**Ad failure must never make a movie or episode unavailable.**

## Touch 9.1 — Ads contract + fake

Create an injectable `Ads` interface and deterministic fake before connecting a network.

The contract should answer product questions such as:

- is an ad break eligible now?;
- what placement type is requested?;
- what network request/config is safe to return?;
- what timeout applies?;
- what client events are accepted?;
- why was the ad skipped/suppressed?

Do not expose network-specific response shapes to the rest of the product.

## Touch 9.2 — Ad policy

Start conservative.

First practical policy:

```text
pre-roll first
mid-roll later only after retention/UX measurements
display/native placements later and independently
```

Policy owns:

- signed-in/signed-out eligibility if different;
- placement rules;
- session-level frequency;
- minimum spacing between breaks;
- content/runtime eligibility;
- consent/privacy requirements;
- explicit fail-open timeout.

Do not make the provider resolver decide whether an ad should play.

## Touch 9.3 — AdController integration

Keep the visual/player integration separate from the media engine.

State may include:

```text
IDLE
REQUESTING_AD
PLAYING_AD
SKIPPABLE
AD_ENDED
AD_FAILED
RETURNING_TO_MEDIA
```

The media controller retains the authoritative movie/episode playback state and resume position.

## Touch 9.4 — First ad-network adapter

Connect one approved ad network/ad server through an adapter.

Prefer standard VAST-compatible delivery when the selected provider supports it.

Rules:

- bounded request timeout;
- validate/normalize network output;
- creative/media is fetched from the ad network/CDN by the client where supported;
- no ad-network secret in browser bundles;
- network failure is localized;
- respect the network's content, traffic-quality, consent, and placement policies.

Do not build a custom ad exchange.

## Touch 9.5 — Ad telemetry

Useful events:

```text
AD_REQUESTED
AD_FILLED
AD_EMPTY
AD_STARTED
AD_FIRST_QUARTILE
AD_MIDPOINT
AD_THIRD_QUARTILE
AD_COMPLETED
AD_SKIPPED
AD_ERROR
AD_TIMEOUT
```

Batch where possible.

Do not write every ad quartile directly to primary Postgres at meaningful scale. Early telemetry
can use logs/aggregates; later it can move through the telemetry queue/analytics store.

Key business measures:

```text
ad requests / watch session
fill rate
impressions / watch session
completion rate
ad error/timeout rate
revenue per 1,000 watch sessions
revenue per DAU
playback abandonment after ad exposure
```

Revenue is useless if ad load destroys retention.

## Touch 9.6 — Frequency-cap state

At the one-instance stage, coarse Consumit-owned session caps may live in the playback/session
state or bounded process memory where reset-on-restart is acceptable. The ad network may also apply
its own advertiser/user caps.

Move cross-instance Consumit caps to `Valkey-critical` only when multiple API/player-policy
instances require shared enforcement.

## Touch 9.7 — Display/native placements

Add only after the player monetization path is stable.

Eligible surfaces can include:

- Home;
- Search/Explore;
- Title detail;
- Lists;
- selected discovery rails.

Ads must be visibly distinguishable from editorial/member recommendations and should not poison
core navigation or create deceptive click targets.

### Phase 9 exit gate

- ads can monetize eligible watch sessions;
- ad creatives do not flow through Consumit by default;
- ad outage does not block playback;
- frequency/consent policy is explicit;
- player resumes correctly after ad completion/error;
- ad events are measurable;
- ad vendor can be replaced behind the module interface.

---

# 14. Lease proxy security, if a provider truly requires it

This is an escape hatch, not a general proxy.

A lease contains:

```text
allowed host/domain
allowed method
allowed headers
expiration
source/session binding
optional byte/range limits
signature / server-side lease id
```

Proxy rules:

- HTTPS/HTTP only as explicitly allowed;
- explicit domain allowlist;
- resolve DNS and reject private/loopback/link-local/metadata ranges;
- defend against DNS rebinding;
- validate every redirect target;
- no arbitrary user-supplied destination;
- header allowlist, not "forward all";
- strict connection/request timeout;
- response size/range guard where appropriate;
- no credential leakage;
- short lease TTL;
- rate limit;
- audit logs with safe/redacted URL fields;
- network egress firewall if infrastructure supports it.

Never turn it into:

```text
GET /proxy?url=<anything>
```

That becomes an SSRF machine.

---

# 15. Queue strategy

No queue before there is real non-request work.

First legitimate candidates:

- provider health probes;
- resolver refresh;
- hot-title warming;
- metadata sync;
- durable email/notification delivery;
- telemetry aggregation.

When BullMQ arrives:

## Queue instance

If Valkey has not already been introduced, the first real durable queue is a valid trigger to introduce `Valkey-critical`.

Requirements:

- `noeviction`;
- persistence appropriate to job durability;
- deterministic `jobId` for duplicate protection when possible;
- bounded retries;
- exponential backoff + jitter;
- failed-job inspection;
- queue depth monitoring.

## Producer behavior

If API cannot enqueue quickly, fail in bounded time.

Do not let an HTTP request hang forever because queue storage is unavailable.

## Worker behavior

Workers should reconnect and continue when the backend returns.

## Job rule

Every job must be retry-safe.

A job may execute more than once.

If "twice" corrupts data, the job is not production-ready.

---

# 16. Playback event ingestion

Player telemetry can become enormous.

Do not synchronously insert every event into primary Postgres.

Early stage:

```text
important events
 -> validate
 -> structured log / small telemetry path
```

Later:

```text
API
 -> bounded telemetry queue
 -> telemetry worker
 -> analytics store
```

Playback must remain usable even if analytics is degraded.

Observability may lose a non-critical event.

Playback should not stop because analytics storage is slow.

---

# 17. Performance strategy

Do not optimize theoretical bottlenecks.

Order:

1. measure;
2. identify hot path;
3. remove waste;
4. cache only if needed;
5. scale only if needed.

## Hot paths worth special attention

- catalog detail/discovery;
- playback resolve;
- progress write;
- home member rails;
- activity feed;
- provider event ingestion.

## Techniques allowed when measured

- request coalescing;
- stale-while-revalidate;
- keyset pagination;
- batch reads;
- composite indexes;
- in-process tiny cache;
- shared cache;
- background warming;
- worker separation.

## Techniques not allowed "because scale"

- microservices;
- Kubernetes;
- Kafka;
- NATS;
- sharding;
- read replicas;
- service mesh;
- event sourcing;
- CQRS;
- multi-region writes.

Not until the system proves it needs them.

---

# 18. Reliability targets

Keep the architecture's SLOs as **targets**, not launch claims.

Before promising numbers:

1. instrument;
2. collect a baseline;
3. measure p50/p95/p99;
4. define error budget;
5. set realistic service-level objectives.

Track at minimum:

## API

- request count;
- error rate;
- p50/p95/p99;
- active requests;
- event-loop lag;
- memory.

## Postgres

- connection usage;
- slow queries;
- lock waits;
- transaction duration;
- storage growth;
- failed migrations.

## Valkey

- memory;
- eviction count;
- reconnects;
- latency;
- key count by class;
- queue depth;
- failed jobs.

## Playback

- resolve success;
- resolve latency;
- time to first frame;
- playback-start success;
- buffering ratio;
- fatal error rate;
- fallback rate;
- source switch success;
- provider failure rate.

---

# 18A. Lean production cost architecture

Cost is treated as an engineering metric alongside latency and reliability.

## Launch topology — target ~$20–30/month

The exact vendor bill changes over time, so verify current prices before purchasing. The target
shape is:

```text
Cloudflare Free / low-cost edge
        |
        v
One small production VPS
  - Next.js
  - Fastify API
  - resolver
  - Letterboxd import worker
        |
        +--> managed Postgres
        +--> dedicated Valkey-auth
        |
        +--> authorized provider/CDN ---- media ----> browser
        |
        +--> ad network/CDN ------------ creative --> browser

Free/low-cost tiers where sufficient:
  - transactional email
  - error monitoring
  - logs/metrics/traces
```

### Spend money here

- managed Postgres;
- backups/PITR;
- a VPS with enough CPU/RAM headroom;
- domain/security essentials;
- additional resolver/proxy capacity only when measured.

### Do not spend money here at launch

- disposable catalog/cache Valkey before measured shared-cache need;
- a second worker server before import load requires it;
- Kubernetes;
- separate API/resolver services merely for architecture aesthetics;
- ClickHouse;
- paid enterprise observability;
- media CDN bandwidth that an authorized upstream already delivers;
- self-hosting ad video creatives.

## Cost ladder / triggers

These are **engineering budget targets, not guaranteed provider quotes**:

| Real usage | Likely topology | Target monthly infra |
|---:|---|---:|
| Development | local + free services / tiny VPS | $0–15 |
| 0–1K DAU | one VPS + managed Postgres + free edge | ~$20–30 |
| 1K–10K DAU | same, possibly Valkey | ~$30–80 |
| 10K–50K DAU | larger/second compute + shared cache if measured | ~$80–250 |
| 50K–100K DAU | API/resolver workers separated where hot | ~$200–600 |
| 100K+ DAU | scale the measured bottleneck | measured |

The economic goal is that 10× DAU does **not** automatically create 10× infrastructure cost.
Direct media/ad delivery, caching, single-flight, provider health, and batched telemetry are what
make that possible.

## Cost SLOs to track

Once production traffic exists, add a monthly cost dashboard:

```text
infra_cost_total
infra_cost_per_1k_DAU
infra_cost_per_1k_watch_sessions
resolver_cost_per_1k_resolves
proxy_GB
proxy_cost_per_watch_hour
database_cost_per_1k_DAU
ad_revenue_per_1k_watch_sessions
net_revenue_after_infra
```

Do not optimize only for the smallest bill. Optimize **cost per successful watch session** while
preserving retention and playback quality.

---

# 19. Deployment progression

## Stage A — simple production

Use:

- Cloudflare/free edge where sufficient;
- one small VPS running web + Fastify API + resolver;
- managed Postgres with backups/PITR;
- dedicated Valkey-backed server sessions and authentication challenges;
- bounded in-process cache + single-flight;
- Docker;
- structured logs;
- free/basic error monitoring;
- direct media delivery from authorized provider/CDN;
- direct ad creative delivery from the selected ad network/CDN.

Keep the authentication Valkey isolated from any later disposable cache.

No Kubernetes.

## Stage B — measured horizontal API growth

Trigger:

- one API instance cannot comfortably meet latency/availability;
- deploys cause too much interruption;
- concurrency becomes a real limit.

Add:

- multiple stateless API instances;
- pooled Postgres connections;
- load balancing;
- Valkey/shared cache/distributed rate limits when required;
- worker separation.

## Stage C — playback/worker scale

Trigger:

- resolver/worker load behaves differently from normal API traffic.

Extract **deployment units**, not necessarily repositories:

```text
api
resolver worker
telemetry worker
metadata worker
```

Keep shared contracts/modules in the monorepo.

## Stage D — orchestration

Trigger:

- manual container lifecycle becomes an operational bottleneck;
- instance count/worker types/autoscaling justify orchestration.

Then consider Kubernetes or equivalent.

## Stage E — multi-region

Trigger:

- measured geographic latency;
- real availability requirement;
- provider-region constraints;
- revenue/users justify operational complexity.

Multi-region is one of the last moves, not a launch feature.

---

# 20. Database migration checklist

Every DB PR answers:

- [ ] What member job requires this change?
- [ ] Is this additive/backward compatible?
- [ ] What table can grow fastest?
- [ ] What query needs an index?
- [ ] What uniqueness/constraint belongs in DB?
- [ ] What happens on delete?
- [ ] Can old app code run against the new schema?
- [ ] Is a backfill required?
- [ ] Can the backfill run in bounded batches?
- [ ] Does it hold dangerous locks?
- [ ] Has the migration been tested on Postgres?
- [ ] Is rollback app-first possible?
- [ ] Is backup/PITR healthy before a risky migration?

---

# 21. Per-route checklist

Before a route is "done":

- [ ] canonical domain terminology;
- [ ] request schema;
- [ ] response schema;
- [ ] auth requirement explicit;
- [ ] authorization explicit;
- [ ] stable error codes;
- [ ] rate-limit classification;
- [ ] body size appropriate;
- [ ] idempotency considered;
- [ ] transaction boundary considered;
- [ ] no raw adapter/DB types leak;
- [ ] no secrets/PII in logs;
- [ ] route inject test;
- [ ] failure-path test;
- [ ] telemetry fields;
- [ ] cache policy explicit;
- [ ] docs updated only if a real decision changed.

---

# 22. Per-module checklist

A module is not complete because "the happy path works."

- [ ] small injectable interface;
- [ ] deterministic fake;
- [ ] real adapter only when needed;
- [ ] typed errors;
- [ ] routes only translate HTTP;
- [ ] validation at external boundary;
- [ ] dependency timeout strategy;
- [ ] persistence constraints;
- [ ] concurrency behavior;
- [ ] module interface tests;
- [ ] route tests;
- [ ] real integration tests where infrastructure behavior matters;
- [ ] graceful degraded behavior;
- [ ] observable failures;
- [ ] no speculative abstraction.

---

# 23. Per-provider checklist

- [ ] legal/contractual permission confirmed;
- [ ] region restrictions recorded;
- [ ] delivery type classified;
- [ ] only provider extraction logic ported;
- [ ] Zod seam;
- [ ] deterministic source IDs;
- [ ] timeout;
- [ ] concurrency limit;
- [ ] RPS/burst limit;
- [ ] bounded queue;
- [ ] movie fixture;
- [ ] episode fixture;
- [ ] unicode/special-title fixture;
- [ ] missing-title fixture;
- [ ] timeout fixture;
- [ ] malformed fixture;
- [ ] expiration handled;
- [ ] header requirements explicit;
- [ ] no raw provider errors;
- [ ] no member credentials;
- [ ] no arbitrary fetch/proxy behavior;
- [ ] synthetic health case.

---

# 24. Incident rules

When production breaks:

1. protect users first;
2. disable the risky feature/provider with a flag when possible;
3. stop rollout;
4. use request/trace IDs;
5. compare baseline vs current;
6. roll back app if safe;
7. avoid destructive DB action while diagnosing;
8. record incident timeline;
9. fix root cause;
10. add a regression test/monitor.

For a provider outage:

```text
breaker opens
 -> traffic stops going there
 -> backups take traffic
 -> health probes continue
 -> half-open probes test recovery
```

No global restart loop.

---

# 25. Feature flags

Use flags for operationally risky backend behavior, not as permanent architecture.

Good flag candidates:

- new provider;
- new ranking formula;
- new resolver hedging;
- automatic fallback;
- new cache path;
- new personalization algorithm.

A flag needs:

- owner;
- default;
- removal condition.

Delete stale flags.

---

# 26. What we deliberately do NOT build now

Do not add:

- microservices;
- Kubernetes;
- Kafka;
- Redpanda;
- NATS;
- GraphQL;
- event sourcing;
- generic CQRS framework;
- service mesh;
- ClickHouse before telemetry volume justifies it;
- read replicas before primary DB is a measured bottleneck;
- multi-region database;
- generic "repository framework";
- abstract base class for every module;
- hundreds of empty packages;
- `packages/db` until a real second consumer needs a shared DB package;
- separate auth service;
- separate social service;
- global state in API memory;
- open media proxy;
- default full-stream proxying;
- self-hosted ad creative delivery when the ad network/CDN can deliver it;
- custom ad exchange / bidding platform;
- ad logic inside provider resolver code;
- background queue for work that can safely remain synchronous;
- caching every endpoint.

The backend should grow because the product pulls it forward.

---

# 27. Suggested first production data model

This is a **starting recommendation**, not an instruction to create all tables now.

Create tables only with their phase.

```text
member
  id
  email_normalized
  created_at
  updated_at
  status

credential
  member_id
  password_hash
  updated_at

profile
  member_id
  username
  display_name
  bio
  visibility
  ...

saved_title
  member_id
  title_kind
  tmdb_id
  created_at

favorite
  member_id
  title_kind
  tmdb_id
  created_at

progress
  member_id
  title_kind
  tmdb_id
  season?
  episode?
  position_seconds
  duration_seconds?
  completed
  updated_at

watch_history
  id
  member_id
  title_kind
  tmdb_id
  season?
  episode?
  watched_at
  completed

follow
  follower_id
  followed_id
  created_at

rating
  member_id
  title_kind
  tmdb_id
  value
  updated_at

review
  id
  member_id
  title_kind
  tmdb_id
  body
  spoiler
  visibility
  created_at
  updated_at

list
  id
  owner_id
  name
  description
  visibility
  created_at
  updated_at

list_item
  list_id
  title_kind
  tmdb_id
  position
  note
  added_at
```

Launch sessions and authentication challenges live in `Valkey-auth`; Postgres retains only
durable member, credential, profile, alias, library, and import truth.

Do not create a heavy ad-event schema in primary Postgres. Persist only ad policy/consent/configuration that the product truly owns; high-volume ad telemetry belongs in logs/queues/analytics as scale requires.

Do not add taste vectors, recommendations, provider score history, notifications, or analytics
tables before their slices. Letterboxd import tables exist because the import slice is active.

---

# 28. AI-agent execution protocol

This is how I would actually use Codex/Claude/another coding agent with this plan.

Never give:

> "Build the backend."

Give:

> "Implement Touch 1.4 only."

Use this template:

```text
Read:
- PROJECT-GUIDE.md
- docs/ARCHITECTURE.md
- docs/DELIVERY.md
- docs/OPEN-QUESTIONS.md
- BACKEND-PLAN.md

Task:
Implement Touch <X> only.

Rules:
- preserve current architecture and terminology
- no speculative dependencies
- no unrelated refactors
- no new package unless this touch explicitly requires it
- maintain the existing public contract unless this touch changes it
- keep business rules outside Fastify route handlers
- external data is untrusted
- add deterministic tests
- handle meaningful failure states
- update docs only for a real decision change

Before finishing:
1. list files changed
2. explain the interface/boundary created
3. list failure states covered
4. run the relevant tests
5. run `bun run check`
6. stop; do not start the next touch
```

If a touch becomes large, split it again.

The agent should never "helpfully" implement Phase N+1.

---

# 29. Recommended execution order from the current repo

Based on the current docs, I would execute:

```text
0.1 baseline
1.2 env validation audit
1.3 error boundary audit
1.4 logging + request context
1.5 security boundary audit
1.6 health
1.7 graceful shutdown
1.8 response schema proof on one catalog route

2.1 Postgres/Prisma spike
2.2 connection lifecycle
2.3 first migration workflow
2.4 Postgres test harness
2.5 DB guardrails

3.x identity vertical slice

4.x library
5.x social

6.x fake playback contract

STOP if authorized provider decision is still unresolved

7.x 2–3 authorized provider pilot
8.x resolver hardening + direct/proxy cost telemetry
9.x ads & monetization (fake/policy -> AdController -> first network -> telemetry)

10. personalization only after real member/library/social signals exist
11. scale only after measurements
```

This order keeps the work small while steadily increasing backend authority.

---

# 30. Definition of backend quality for Consumit

"High quality" does **not** mean the most technologies.

For Consumit it means:

### Correctness

- domain invariants exist in code + DB where appropriate;
- retry does not corrupt state;
- privacy is enforced server-side;
- progress survives source changes.

### Stability

- external requests are bounded;
- failure is localized;
- provider outages do not crash the system;
- ad-network outages do not block playback;
- graceful shutdown works;
- queue/cache/database failure behavior is designed.

### Security

- server-side sessions;
- CSRF defense;
- Argon2id;
- no enumeration;
- SSRF protection;
- least-privilege secrets/dependencies;
- no open proxy.

### Operability

- structured logs;
- request/trace correlation;
- useful health endpoints;
- migrations are reviewed;
- backups restore;
- deploy rollback is safe.

### Performance

- hot paths measured;
- caches bounded;
- concurrent misses coalesced;
- provider work capacity-limited;
- direct media delivery is preferred and measured;
- ad creatives are delivered by the ad network/CDN when possible;
- database writes are not spammed by player/ad ticks.

### Cost efficiency

- launch topology stays near the ~$20–30/month target while traffic is small;
- managed Postgres protects irreplaceable data;
- disposable cache and analytics infrastructure arrive only on measured triggers; the auth
  Valkey and import worker are active product requirements;
- proxy bandwidth is visible and intentionally minimized;
- cost per successful watch session is measured;
- ad revenue scales with watch sessions without making Consumit serve the ad creative bytes.

### Monetization quality

- ads are clearly separated from editorial/member content;
- ad policy is independent from provider resolution;
- ad failure always fails open to media;
- ad load is tuned against abandonment/retention, not only impression count;
- vendor-specific ad behavior remains behind an adapter.

### Maintainability

- one stable interface per module;
- small route registrars;
- fake + real adapters;
- public contracts independent of persistence models;
- no premature services/packages.

That is the backend I would trust.

---

# 31. Research notes / official references

Checked on 2026-09-06.

## Fastify

- Validation and serialization:
  https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/
- Encapsulation:
  https://fastify.dev/docs/latest/Reference/Encapsulation/
- Plugins:
  https://fastify.dev/docs/latest/Reference/Plugins/
- Logging:
  https://fastify.dev/docs/latest/Reference/Logging/
- Testing / `inject()`:
  https://fastify.dev/docs/latest/Guides/Testing/
- Server shutdown lifecycle:
  https://fastify.dev/docs/latest/Reference/Server/

Research implications used here:

- schema validation/serialization at the HTTP boundary;
- response schemas reduce accidental disclosure;
- encapsulated plugins fit modular boundaries;
- `inject()` supports network-independent HTTP tests;
- Pino is Fastify's native logging path;
- `close()` provides an explicit shutdown lifecycle.

## Prisma

- Prisma ORM:
  https://www.prisma.io/docs/orm
- Bun runtime guide:
  https://www.prisma.io/docs/guides/runtimes/bun
- Prisma 8 migration planning/apply:
  https://www.prisma.io/docs/orm/migrations/applying-a-migration
- PostgreSQL quickstart:
  https://www.prisma.io/docs/prisma-orm/quickstart/postgresql

Research implications used here:

- this slice intentionally remains on stable Prisma `7.10.x`; Prisma 8 is a separately tracked upgrade;
- Prisma publishes a Bun-specific guide;
- migrations are versioned/reviewable artifacts;
- production migrations should be a controlled deployment step.

## PostgreSQL

- Client connection/timeout configuration:
  https://www.postgresql.org/docs/current/runtime-config-client.html
- Backup and restore:
  https://www.postgresql.org/docs/current/backup.html
- WAL / PITR:
  https://www.postgresql.org/docs/current/wal-intro.html

Research implications used here:

- bound lock/statement/idle transaction behavior;
- backups are mandatory for valuable data;
- PITR/WAL is the right durability direction for higher reliability.

## OWASP

- Password Storage:
  https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- Session Management:
  https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- Authentication:
  https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- CSRF Prevention:
  https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- SSRF Prevention:
  https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html

Research implications used here:

- Argon2id;
- secure `HttpOnly` cookies;
- `__Host-` cookie direction;
- SameSite is defense-in-depth, not a complete CSRF strategy;
- generic auth errors;
- SSRF allowlisting and network protections.

## Valkey

- Persistence:
  https://valkey.io/topics/persistence/
- Eviction:
  https://valkey.io/topics/lru-cache/
- ACL:
  https://valkey.io/topics/acl/
- TLS:
  https://valkey.io/topics/encryption/

Research implications used here:

- cache eviction and durable coordination have different requirements;
- ACL/TLS matter for remote/shared deployments;
- explicit persistence choice is required.

## BullMQ

- Going to production:
  https://docs.bullmq.io/guide/going-to-production
- Connections:
  https://docs.bullmq.io/guide/connections

Research implications used here:

- queue storage requires `noeviction`;
- persistence is a deliberate production requirement;
- producers and workers need different reconnect/failure behavior;
- jobs must tolerate retries.

## OpenTelemetry

- JavaScript:
  https://opentelemetry.io/docs/languages/js/
- Instrumentation libraries:
  https://opentelemetry.io/docs/languages/js/libraries/
- Propagation:
  https://opentelemetry.io/docs/languages/js/propagation/

Research implications used here:

- traces and metrics are stable;
- logs are less mature;
- official JS runtime support is centered on Node.js, so Bun compatibility should be tested rather
  than assumed;
- trace context should propagate end-to-end.

---

# Final principle

If we follow one rule, use this one:

> **Every backend change must create one new reliable capability without creating three new
> abstractions we do not yet need.**

Consumit should become powerful because each slice is proven, not because the architecture
diagram looks expensive.

And for the economics:

> **Consumit should own the control plane, product state, playback intelligence, and ad policy —
> not unnecessarily pay to transport every movie byte or ad creative byte.**
