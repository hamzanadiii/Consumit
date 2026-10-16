# Consumit architecture and BingeBang research

Research date: 2026-09-27

## Recommendation

**Keep Consumit in one repository for now, with independently buildable and deployable apps.** A multi-repository setup would not make playback faster. Today, the web app, API, shared contracts, provider adapters, player, and Worker change together often enough that atomic changes are useful. Split repositories when ownership, access control, or release cadence actually separates—not because a monorepo looks less serious.

**The current stack is already a good base.** The unsolved work is product quality, direct-first source selection, social completion, and measured playback reliability. Do not rewrite the framework stack to try to fix those. I would make PostgreSQL 18 the target for a fresh production database after migration checks; preserve the existing player engines until a controlled comparison proves a replacement is better.

**BingeBang is useful as a product reference, not as an architecture blueprint.** Its public help page describes title browsing and one player over multiple external servers, with manual server switching as a normal recovery action. Its framework, database, and player implementation are not disclosed in the first-party material reviewed.

## Repository structure: one repo or several?

| Choice | What it helps | Cost for Consumit now | Recommendation |
|---|---|---|---|
| One repo, separate workspaces and deploys | Change API contracts, web, adapters, player, and Worker in one reviewed change. Keep shared code on a workspace dependency. | Needs clear package boundaries and CI that runs only affected checks as the repo grows. | **Use now.** Bun workspaces already provide package boundaries and workspace dependencies; GitHub Actions supports path-filtered workflows. [Bun workspaces](https://bun.sh/docs/pm/workspaces), [GitHub Actions path filters](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow) |
| Several repos | Independent access rights, maintainers, releases, and security boundaries. Each repo can use its own tooling and deployment schedule. | Shared contracts and provider/player packages need published versions and coordinated upgrades. A feature that changes both API and web crosses repos. | **Defer.** Adopt when a separate team or trust boundary owns a component, or another product consumes a stable published package. |

Repository layout and deployment layout are separate decisions. Keep one source repository while producing separate web, API, Worker, and background-worker deployments. That already gives operational separation without cross-repo version churn. This recommendation is an inference from Consumit's current tree and change boundaries, not a universal rule.

### When to split later

- An independent team owns and releases a component on a different schedule.
- A component needs separate contributor permissions or a stronger security boundary.
- An adapter/player SDK is intended for external consumers and needs a public versioned release.
- A service must scale or deploy independently for measured operational reasons.

Build filtering, clear workspace exports, and a small root check matrix can address growing CI cost without moving code. Splitting repositories alone does not change runtime latency, deployment count, or media delivery.

## Technology review

| Area | Recommendation | Evidence and reasoning |
|---|---|---|
| Web | Keep Next.js 16, React, and the existing TypeScript UI. Run the production web server on Node 24, as the current Docker image already does. Cache public catalog pages/assets; keep member pages private. | Next.js 16 requires Node.js 20.9 or newer and its platform guide specifies a Node.js server. Its self-hosting guide distinguishes public prerendered responses from dynamic responses that are marked private, and describes shared cache coordination for multiple instances. [Next.js 16 requirements](https://nextjs.org/docs/app/guides/upgrading/version-16), [self-hosting](https://nextjs.org/docs/app/guides/self-hosting) |
| API/runtime | Keep Fastify and TypeScript. Bun is reasonable for the current API and is documented by Prisma; Node 24 LTS is the conservative alternative if Bun-specific runtime behavior becomes a production issue. Do not rewrite to Go for hypothetical throughput. | Fastify already supplies schema validation and response serialization. Prisma publishes a Bun runtime guide. Node 24 is an LTS line, but a runtime change is not a user-visible feature and should have a measured reason. [Fastify schemas](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/), [Prisma with Bun](https://www.prisma.io/docs/guides/runtimes/bun), [Node release schedule](https://nodejs.org/en/about/previous-releases) |
| Workspace/package manager | Keep Bun workspaces and the current simple scripts. Add a monorepo build graph only if CI/build measurements show that package filtering is no longer enough. | Bun workspaces support `workspace:*` dependencies and filtering packages for scripts/install. [Bun workspaces](https://bun.sh/docs/pm/workspaces) |
| Database | Prefer PostgreSQL 18 for a new production database, with reviewed migrations and tested backups. If production data already exists on 17, treat the major-version upgrade as its own migration. Keep Prisma unless query evidence shows a specific ORM limitation. | PostgreSQL 18 is released and Prisma's supported-database table lists PostgreSQL 18. The release announcement reports workload-dependent I/O improvements of up to 3×; that is not a guarantee for Consumit's queries. PostgreSQL constraints and indexes fit member relationships, reviews, diaries, and ordered lists. [PostgreSQL 18 release](https://www.postgresql.org/about/news/postgresql-18-released-3142/), [Prisma database support](https://docs.prisma.io/docs/orm/v7/reference/supported-databases), [PostgreSQL indexes](https://www.postgresql.org/docs/current/indexes.html), [constraints](https://www.postgresql.org/docs/18/ddl-constraints.html) |
| Short-lived state | Keep Valkey for expiring auth sessions, limits, playback leases, and bounded cache. Keep durable member records in PostgreSQL. | Valkey is an open-source in-memory store with expiry, transactions, replication, and LRU; it is already integrated and avoids a service migration. [Valkey introduction](https://valkey.io/topics/introduction/) |
| Player | Keep Consumit's own controls and recovery layer. Continue with native browser playback, hls.js, and dash.js while the current supported formats and test results meet requirements. Run a measured Shaka trial behind the player seam only if consolidation, DRM, Chromecast, or another named requirement matters. | hls.js uses Media Source Extensions where available and recommends native HLS for supported Safari paths. Shaka supports both HLS and DASH, plus features such as offline playback and EME; it cannot remove the need for a working provider source or solve Consumit's resolver policy. [hls.js browser support](https://github.com/video-dev/hls.js#compatibility), [Shaka Player](https://github.com/shaka-project/shaka-player) |
| Video delivery | Keep direct delivery as the normal path. Treat Worker proxy fallback as a launch blocker until Cloudflare confirms an approved use for this traffic or the fallback uses another approved delivery provider. Do not assume the Workers Paid minimum makes video relaying acceptable. | Cloudflare says Free, Pro, and Business CDN delivery of video can be redirected or acted on; its documented options are Cloudflare Stream or Enterprise Stream Delivery. Workers Paid pricing says there is no egress charge, but that does not override the separate video-delivery policy. Stream is a hosted/encoded video product billed by minutes stored and delivered, not a transparent relay for arbitrary provider URLs. [Cloudflare video-delivery policy](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/delivering-videos-with-cloudflare/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Stream pricing](https://developers.cloudflare.com/stream/pricing/) |

The core serving delay is usually source readiness, network RTT, manifest/segment behavior, and browser decoding—not the framework answering a small JSON request. Measure resolver time, media `loadstart` to decoded frame, buffering, and recovery separately before changing runtimes or adding servers.

## What BingeBang publicly describes

The first-party [Help page](https://bingebang.st/help), [Terms](https://bingebang.st/terms), [Privacy policy](https://bingebang.st/privacy), [Home](https://bingebang.st/), and [Explore page](https://bingebang.st/explore) show this product model:

1. **Browse:** Home has Movies, Series, Calendar, Explore, and My Space. Explore combines title type, genre, official streaming-service availability, minimum rating, year range, country, and 4K filters. The site says the streaming-service filter describes where a title is officially available; it does not say that those services supply BingeBang's video.
2. **Open a title:** A title page provides metadata and a prominent Play action; TV has season/episode navigation.
3. **Find a playable copy:** BingeBang's Help page says it does not host video; it searches the internet for streams and puts discovered external servers behind one player. It documents four named server choices and a saved server-priority setting.
4. **Recover manually:** Its instructions ask people to switch servers if video will not start, buffers, looks poor, or has unsuitable audio/subtitles. The page claims more than a quarter of viewing includes at least one switch; that is BingeBang's own unverified statistic.
5. **Keep a personal space:** An account unlocks Watchlist, Favorites, Watched, playback History/Continue Watching, recommendations, TV Calendar, notifications, and achievements. The Help page says recommendations use favorites, watched/added titles, and followed people. It distinguishes “Watched” from actual playback history and resume position.
6. **Player controls:** The published guide describes quality, subtitle/audio selection, speed, episode continuation, skip segments, sleep timer, resume, Chromecast, and picture-in-picture where supported.

The underlying implementation is **unknown**. The Privacy page names Cloudflare for hosting/security, Google Analytics, and an unnamed email service; it does not name a frontend framework, database, stream-resolution implementation, or video-player library. BingeBang's own Terms ask visitors not to use bots or automated tools, scrape, copy, or bypass controls. This review is limited to its published product/policy pages; I did not follow media or download links or investigate playback endpoints.

### Useful lessons for Consumit

- Keep **Watched** (the member's diary fact) separate from **Playback History** (position and resume). BingeBang explicitly describes them as different records; Consumit already has the domain model to preserve that distinction.
- Make the title page connect metadata, social proof, Play, and the correct episode without exposing resolver details.
- Make Continue Watching, TV calendar, watchlist, favorites, and history each answer a different member job.
- Put advanced player choices in a compact settings menu, with keyboard/touch access and persistent preferences.
- Borrow its quick discovery organization and title-to-player path, not the visible manual server-switching expectation. Consumit's stated goal is to resolve, retry, and fall back behind one Play action.
- Do not copy its published source-discovery model. Consumit should only enable providers whose direct media source, host, and permission basis pass review; its signed proxy is a narrow, approved fallback.

## Recommended next decisions

1. Keep a **monorepo with separate deployables**. Add path-filtered CI and enforce workspace API boundaries before considering repo splits.
2. Lock the production runtime matrix: Node 24 for Next.js is already in Docker; keep Bun for API only while production traces/tests show no compatibility issue. Standardize the API on Node 24 only if it reduces a demonstrated runtime/support problem.
3. Set PostgreSQL 18 as the fresh-deployment target after checking Prisma migrations, extensions, backup, and restore; do not perform a major upgrade without rollback evidence.
4. Keep the first-party player and compare Shaka only with the same direct media fixtures, same devices, first-frame/buffering/recovery metrics, and bundle measurement.
5. Resolve Cloudflare video-delivery approval before enabling any proxy fallback that relays video bytes. Otherwise, use only direct provider delivery or an explicitly approved video-delivery product.
6. Rebuild the app's experience screen by screen around the member loop—discover, watch, log, review, curate, follow—rather than trying to make a repository split or framework switch stand in for product design.
