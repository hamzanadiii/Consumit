> Historical implementation proposal. Current behavior and security rules live in [PRODUCT.md](./PRODUCT.md), [ARCHITECTURE.md](./ARCHITECTURE.md), and [QUALITY-AUDIT.md](./QUALITY-AUDIT.md). The Referer/domain-whitelist and unsigned child-URL designs below are retired.

# Embeddable Streaming API — Implementation Plan

## Vision

Consumit becomes a dual-purpose platform:
1. **Self-hosted streaming app** (current) — users watch directly at consumit.online
2. **Embeddable streaming API** (new) — any site can embed a player via iframe, Consumit earns from ads

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    EMBEDDING SITES                          │
│  <iframe src="https://p.consumit.online/embed/movie/550">  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              CLOUDFLARE WORKER (Edge)                       │
│  • CORS headers (ACAO: *)                                   │
│  • HMAC token validation (signed by VPS)                    │
│  • Domain whitelist                                         │
│  • Rate limiting (per-IP)                                   │
│  • m3u8 playlist rewriting (segments through Worker)        │
│  • SRT → VTT subtitle conversion                            │
│  • Referer injection per provider                           │
│                                                             │
│  Cost: Free tier (100K req/day) → $5/mo at scale           │
│  Bandwidth: ALL video flows through here, NOT the VPS       │
└──────────────────────────┬──────────────────────────────────┘
                           │ fetch upstream
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              UPSTREAM CDNs (Provider Sources)               │
│  VixSrc, Kyren, Nagare, InsertUnit, etc.                   │
│  Worker fetches with proper User-Agent + Referer            │
│  Returns to browser with CORS headers                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              VPS (Internal API — NOT public for video)      │
│  • Provider scraping & stream resolution                    │
│  • /v1/embed/movie/{tmdb} → returns Worker proxy URLs       │
│  • /v1/embed/tv/{tmdb}/{s}/{e} → returns Worker proxy URLs  │
│  • HMAC token signing for Worker                            │
│  • Provider health scoring & caching                        │
│  • No video bandwidth — only JSON responses                 │
│                                                             │
│  Cost: $5/mo VPS (512MB RAM, shared CPU)                   │
└─────────────────────────────────────────────────────────────┘
```

## Flow

1. Embed site loads iframe: `https://p.consumit.online/embed/movie/550`
2. VPS serves the embed page (Next.js server component)
3. Embed page calls VPS API: `GET /v1/embed/movie/550`
4. VPS resolves providers → returns sources with **Worker proxy URLs** + HMAC token
5. Player fetches m3u8 from Worker → Worker validates token → fetches upstream CDN
6. Worker rewrites playlist → segments route through Worker
7. Video plays — zero bandwidth on VPS

## Security Model

| Layer | Protection |
|-------|-----------|
| **Embed endpoint** | Rejects direct access (no referer = 403) |
| **Worker token** | HMAC-SHA256 signed, 24h expiry, per-request |
| **Domain whitelist** | Only approved domains can embed (Phase 2: admin dashboard) |
| **Rate limiting** | 60 req/min per IP (VPS), 100K/day (Worker free tier) |
| **Stream URL hiding** | Raw URLs never leave the iframe |
| **CORS isolation** | Iframe prevents parent page access |
| **No API keys for embeds** | Reduces barrier to adoption |

---

## Phase 1: Provider Cleanup + Worker Port (This Session)

### 1.1 Delete Dead Provider Adapters

Remove adapter files and all references:

| Adapter | File | Reason |
|---------|------|--------|
| `modiplay` | `packages/provider-sdk/src/adapters/modiplay.ts` | Dead |
| `vidlove` | `packages/provider-sdk/src/adapters/vidlove.ts` | Dead |
| `stigstream` | `packages/provider-sdk/src/adapters/stigstream.ts` | Dead |
| `streamflix` | `packages/provider-sdk/src/adapters/streamflix.ts` | Dead |
| `vidvault` | `packages/provider-sdk/src/adapters/vidvault.ts` | Dead |

**Keep** (verified working):
- `filmu` — direct multi-extractor, works without proxy
- `vidnest` — 9-server parallel scrape with cipher, works via proxy

Also remove from:
- `configured-providers.ts` — adapter imports, switch cases, origins map, siblingHosts
- `providers.example.json` — entries
- `providers.local.json` — entries
- `configurationSchema` — adapter enum literals
- `packages/provider-sdk/src/index.ts` — re-exports

### 1.2 Port Cloudflare Worker from PROVE

Create `worker/` directory at project root:

```
worker/
├── index.ts          # Port from PROVE/worker/index.ts + harden
├── wrangler.toml     # Worker config
├── package.json      # Worker-specific deps (none needed, pure TS)
└── tsconfig.json     # Worker TS config
```

**Harden the PROVE worker with:**
- HMAC token validation (verify `?token=` parameter)
- Domain whitelist (check `Origin`/`Referer` header against allowed list)
- Per-IP rate limiting (in-memory, 100 req/min)
- Configurable via `wrangler.toml` variables (secrets)

### 1.3 Create HMAC Token System

**API side** (`apps/api/src/playback/embed-tokens.ts`):
```typescript
import { createHmac, randomBytes } from 'node:crypto'

const SECRET = env.EMBED_HMAC_SECRET || randomBytes(32).toString('hex')
const EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours

export function signEmbedToken(url: string, domain: string): string {
  const expires = Date.now() + EXPIRY_MS
  const payload = `${url}|${domain}|${expires}`
  const sig = createHmac('sha256', SECRET).update(payload).digest('hex')
  return `${expires}.${sig}`
}

export function verifyEmbedToken(url: string, domain: string, token: string): boolean {
  const [expiresStr, sig] = token.split('.')
  const expires = Number(expiresStr)
  if (Date.now() > expires) return false
  const payload = `${url}|${domain}|${expires}`
  const expected = createHmac('sha256', SECRET).update(payload).digest('hex')
  return sig === expected
}
```

**Worker side** — verify the token using the same HMAC secret (stored as Worker secret).

### 1.4 Create Embed API Endpoints

Add to `apps/api/src/playback/routes.ts`:

```
GET /v1/embed/movie/:tmdbId
GET /v1/embed/tv/:tmdbId/:season/:episode
```

These endpoints:
1. Validate the request (check Referer against whitelist)
2. Resolve providers (same as existing playback resolve)
3. Return sources with Worker proxy URLs + HMAC tokens
4. Rate limit: 60 req/min per IP

### 1.5 Create Embed Pages

Add to `apps/web/src/app/embed/`:

```
embed/
├── movie/
│   └── [tmdbId]/
│       └── page.tsx    # Server component, renders player
└── tv/
    └── [tmdbId]/
        └── [season]/
            └── [episode]/
                └── page.tsx
```

The embed page:
- Minimal chrome (no navigation, no sidebar)
- Just the player + server/quality selector
- Uses `WatchPlayback` with `layout="embedded"`
- Fetches from `/v1/embed/movie/{tmdb}` on mount
- Auto-plays, auto-failovers

### 1.6 Domain Whitelist (Config File)

Add `EMBED_ALLOWED_DOMAINS` env var:
```
EMBED_ALLOWED_DOMAINS=example.com,player.example.org,*.blogspot.com
```

Supports:
- Exact domains: `example.com`
- Wildcard subdomains: `*.example.com`
- Port specified: `example.com:8080`

---

## Phase 2: Revenue (Next Session)

### 2.1 Ad Controller Wiring

The `ad-controller.ts` seam already exists. Wire it:
- Define ad slots (pre-roll, mid-roll, post-roll)
- Integrate with ad network (GAM, Adsterra, or custom)
- Track ad impressions for revenue reporting

### 2.2 Admin Dashboard

- `/admin/embeds` — view/manage domain whitelist
- `/admin/stats` — embed views, ad revenue, provider health
- `/admin/providers` — enable/disable providers

---

## Phase 3: Scale (Future)

### 3.1 Worker Optimizations
- KV cache for provider health scores
- Durable Objects for rate limiting (persistent across Worker restarts)
- Smart routing (skip unhealthy providers at edge)

### 3.2 Monitoring
- Provider health dashboard
- Embed usage analytics
- Cost tracking (Worker requests, VPS load)

---

## Cost Breakdown

| Item | Cost | Notes |
|------|------|-------|
| VPS (Hetzner/DigitalOcean) | $5/mo | 512MB RAM, shared CPU |
| Domain | $10/year | `.to` or `.me` |
| Cloudflare Worker Free | $0 | 100K req/day included |
| Cloudflare Worker Paid | $5/mo | If >100K req/day |
| TMDB API | $0 | Free tier |
| **Total** | **$5-10/mo** | Scales to 1M+ users on Worker paid |

---

## File Changes Summary

### New Files
- `worker/index.ts` — Cloudflare Worker (port from PROVE + harden)
- `worker/wrangler.toml` — Worker config
- `worker/package.json` — Worker package
- `worker/tsconfig.json` — Worker TS config
- `apps/api/src/playback/embed-tokens.ts` — HMAC token system
- `apps/api/src/playback/embed-routes.ts` — Embed API endpoints
- `apps/web/src/app/embed/movie/[tmdbId]/page.tsx` — Movie embed page
- `apps/web/src/app/embed/tv/[tmdbId]/[season]/[episode]/page.tsx` — TV embed page

### Modified Files
- `apps/api/src/config/env.ts` — Add `EMBED_HMAC_SECRET`, `EMBED_ALLOWED_DOMAINS`, `WORKER_URL`
- `apps/api/src/app.ts` — Register embed routes
- `apps/api/src/playback/routes.ts` — Import embed routes
- `infra/playback/providers.example.json` — Remove dead providers
- `infra/playback/providers.local.json` — Remove dead providers
- `compose.yaml` — Add Worker build/deploy step
- `.env` / `.env.example` — Add new env vars

### Deleted Files
- `packages/provider-sdk/src/adapters/modiplay.ts`
- `packages/provider-sdk/src/adapters/vidlove.ts`
- `packages/provider-sdk/src/adapters/stigstream.ts`
- `packages/provider-sdk/src/adapters/streamflix.ts`
- `packages/provider-sdk/src/adapters/vidvault.ts`

### Modified Files (Provider Cleanup)
- `packages/provider-sdk/src/index.ts` — Remove dead adapter exports
- `packages/provider-sdk/src/adapters/index.ts` — Remove dead adapter registrations
- `apps/api/src/playback/configured-providers.ts` — Remove dead adapter imports/switch cases
