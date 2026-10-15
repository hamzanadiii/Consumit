# Egress sweep runbook

The egress sweep answers one question per provider: **can this provider play browser-direct in production, and if not, exactly why not?** It measures the same roster once per egress and joins the reports into a matrix.

It exists because "direct providers don't work in production" hides at least four different failures — lookup refused from one egress, media bound to the issuing egress, the Consumit origin refused, and headers a browser is structurally not allowed to send. Each has a different cure, and none of them is fixed by changing the resolver.

## What one run measures

For every configured provider row, through one egress:

| Check | Meaning |
|---|---|
| `resolveOk` | did the adapter produce validated sources from this egress |
| `mediaOk` | bare fetch of the media URL with `Origin: <consumit origin>` — what a browser actually sends |
| `mediaWithHeadersOk` | same fetch plus the adapter's declared header hints — the server-side verification shape |
| `mediaNoOriginOk` | adapter hints with the `Origin` header removed — isolates origin refusals from header refusals |
| `cors` | did the response carry a usable `Access-Control-Allow-Origin` |
| `browserOk` | real Chrome first frame at the requested origin, via hls.js for HLS |

Embed rows are classified from their configured tier; the provider's own player answers to its own rules.

## Running it

```bash
# one egress (this machine), browsing at the real production origin
bun --env-file=.env scripts/egress-sweep.ts \
  --label=dev --origin=https://consumit.online

# the Cloudflare resolver egress for lookup; media and browser still run here
bun --env-file=.env scripts/egress-sweep.ts \
  --label=cf --via=worker --origin=https://consumit.online

# a specific resolver deployment (for example the Europe colo)
bun --env-file=.env scripts/egress-sweep.ts \
  --label=cf-eu --via=worker:<resolver-url> --origin=https://consumit.online
```

Useful flags: `--ids=vixsrc,lookmovie` to narrow the roster, `--config=` for a different roster file, `--limit=` for sources probed per lookup, `--browser=off` to skip Chrome and keep only the fetch probes, `--out=` to choose the report path (default `tmp/egress-sweep-<label>.json`).

**Another machine is just another label.** Copy the tree, run the same command with `--label=ovh` (or `dev-paris`, whatever distinguishes it), and bring the report back. That is how you get a genuine viewer-egress measurement: lookup and media all run from that host.

### The OVH box

The media VPS (`ubuntu@15.235.95.53`, key `consumit_vps_ed25519`, see [OVH media relay](./ovh-media-relay.md)) is the cheapest genuine second egress. It ships node but no bun, and `providers.local.json` is gitignored, so both have to be carried over:

```bash
# from the dev machine
mkdir -p tmp/sweep-copy
git ls-files -co --exclude-standard | tar -cf tmp/sweep.tar -T -
scp -i ~/.ssh/consumit_vps_ed25519 tmp/sweep.tar .env ubuntu@15.235.95.53:sweep.tar
ssh -i ~/.ssh/consumit_vps_ed25519 ubuntu@15.235.95.53 'mkdir -p ~/egress-sweep/infra/playback && tar -xf ~/sweep.tar -C ~/egress-sweep'
scp -i ~/.ssh/consumit_vps_ed25519 infra/playback/providers.local.json ubuntu@15.235.95.53:~/egress-sweep/infra/playback/

# on the box
sudo apt-get install -y unzip
curl -fsSL https://bun.sh/install | bash
cd ~/egress-sweep && ~/.bun/bin/bun install
~/.bun/bin/bun --env-file=.env scripts/egress-sweep.ts \
  --label=ovh --origin=https://consumit.online --browser=false \
  --out=tmp/egress-sweep-ovh.json
```

There is no Chrome on the box, so `--browser=false`; the media probes still run and are the point. The whole roster takes about two minutes. The copied tree holds `.env` and the provider roster — delete `~/egress-sweep` and `~/sweep.tar` when finished.

## Joining the reports

```bash
bun scripts/egress-sweep.ts \
  --join=tmp/egress-sweep-cf.json,tmp/egress-sweep-dev.json \
  --viewer=cf --out=tmp/egress-matrix.json
```

`--viewer` is the label that stands in for the end user. **Pick it to match the production lookup path**: production resolves through Cloudflare under [ADR 0009](../adr/0009-cloudflare-provider-resolution.md), so `--viewer=cf` answers "does this work as production actually runs it?" Omit it and the first report that ran a browser is used.

## Verdicts

| Verdict | What it means | Cure |
|---|---|---|
| Direct possible | first frame decoded from the viewer egress | none — ship it direct |
| CORS blocked | media fetches but the browser cannot read it | provider must send CORS; unfixable client-side |
| Needs browser-forbidden headers | only answers with the adapter's header hints | unfixable in a browser |
| Consumit origin refused | answers without `Origin`, refuses it with ours | provider allowlists the origin, or embed |
| No first frame | fetchable and CORS-readable but decode failed | codec, variant or segment chain — investigate |
| Lookup egress bound | resolves from another egress only | resolve from a compatible egress |
| Media egress bound | URL dies outside the issuing egress | relay from that egress, or embed |
| Media blocked everywhere | every tested egress refused media | embed or drop |
| Embed class | configured as `embed` | already the configured path |
| Lookup unmeasured | the catalog metadata the lookup needs was unavailable this run | not a provider verdict — bring the API up and re-run |
| Never resolves | no tested egress produced a source | adapter or catalog problem, not delivery |

## Measured snapshot (2026-10-14)

Full roster, 50 enabled providers, three labels — `dev` (lookup from this machine), `cf` (lookup through the production Cloudflare resolver, `--via=worker`) and `ovh` (lookup and media from the media VPS, no browser). The `dev` and `cf` browser checks run here, browsing at `https://consumit.online` in headless Chrome.

Viewer `dev`, 50 rows:

| Verdict | Count |
|---|---:|
| Direct possible | 13 |
| CORS blocked | 3 |
| Needs browser-forbidden headers | 3 |
| Consumit origin refused | 3 |
| No first frame | 5 |
| Media blocked everywhere | 1 |
| Embed class | 8 |
| Never resolves | 4 |
| Lookup unmeasured | 8 |
| Partially measured | 2 |

Viewer `cf` (production-shaped lookup), 50 rows:

| Verdict | Count |
|---|---:|
| Direct possible | 10 |
| Lookup egress bound → needs `dev` | 12 |
| CORS blocked | 3 |
| Consumit origin refused | 3 |
| No first frame | 3 |
| Media egress bound | 1 |
| Media blocked everywhere | 2 |
| Embed class | 8 |
| Never resolves | 4 |
| Lookup unmeasured | 3 |
| Partially measured | 1 |

Lookups resolved per egress, same roster and moment: `dev` 37/50, `cf` 30/50, `ovh` 29/50. Media fetches that answered: `dev` 21/50, `cf` 16/50, `ovh` 14/50.

The 12 lookup-egress-bound rows split in two, which is the whole point of the third label:

| Needs | Providers | Reading |
|---|---|---|
| `ovh, dev` (8) | `lookmovie`, `filmu`, `vaplayer`, `viduki`, `stormboron`, `aphrodite`, `wecollege-boise`, `wecollege-miami` | fail only from Cloudflare. A normal datacenter IP resolves them, so the cause is Cloudflare's runtime or its IP ranges, not datacenter addresses in general |
| `dev` only (4) | `vixsrc`, `kisskh`, `vidrift`, `stigstream` | fail from Cloudflare *and* OVH. Only the developer line gets through — these upstreams filter or distrust datacenter addresses |

What this settles:

1. **Direct delivery works in production conditions for 10 of 50 configured providers today**, and for 13 from the developer line. The direct path is not hypothetical.
2. **Moving lookup off Cloudflare and onto OVH recovers 8 of the 12 blocked providers** without touching a single adapter: `lookmovie`, `filmu`, `vaplayer`, `viduki`, `stormboron`, `aphrodite`, `wecollege-boise`, `wecollege-miami`. That takes the production-shaped direct set from 10 to 18. Because OVH already serves the media relay, lookup and media then share one egress family — the split this sweep was built to justify.
3. **4 providers are residential-only** — `vixsrc`, `kisskh`, `vidrift`, `stigstream` resolve from the developer line and from nowhere else. No hosted architecture reaches them, so they belong on relay or embed, and no resolver change will alter that.
4. **22 of 50 are direct-capable under production-shaped lookup** (10 already direct + 12 lookup-egress-bound). Of the other 11 non-embed, non-unknown rows, none is fixable by the player: three refuse CORS, three refuse the Consumit origin, two refuse media from every tested egress, and three produce media that never reaches a first frame.
5. **Vixsrc is not dead, but it is not reachable from a server either.** It decodes a real first frame from the developer line; Cloudflare and OVH both fail its lookup. Earlier runs recorded it as `media-error` because hls.js was injected into a probe page the browser check never saw — the browser probe now injects hls.js into the check page itself, and the `video.src = <m3u8>` fallback is refused so a missing hls.js can never masquerade as a decode failure again.
6. **LookMovie is egress-coupled, not dead**: it decodes from the egress that issued the URL, and OVH is such an egress.

Counts here are one machine at one moment. Provider upstreams are flaky: `evion`, `castletv` and `cinejoylisbon` flipped verdicts between consecutive runs, so treat single-run verdicts as measurements, not guarantees.

## Limitations

- The bare probe omits `Referer`, matching Watch's deliberate no-referrer policy. A provider that needs its own `Referer` is reported as header-bound, which is correct for this product and would differ for a browser with a normal referrer policy.
- Fetch probes do not emulate cookies or a provider session; a `cookieBound` provider will read as media-blocked.
- `browserOk: null` means Chrome did not run (browser off, or the origin was unreachable), not that playback failed. The verdict stays `Partially measured`.
- CORS results are only authoritative when `--origin` is the real production origin.
- Lookup, media and browser all leave from the machine running the sweep, except lookup under `--via=worker`. There is no way to model a media egress from here: an OVH label means running the sweep from OVH.
- Anime adapters resolve through the catalog API on `:3001`. When it is not running those rows report `Lookup unmeasured` instead of a verdict; the sweep prints a warning at start.

## Failure behaviour

- Missing resolver secret with `--via=worker`: the lookup fails as `unavailable`, which is reported honestly rather than silently falling back to a local resolve.
- Unreachable `--origin`: reachability is retried three times over 30s each, then fetch probes still run and browser checks are recorded as `null`, which prints as `Partially measured` plus a warning line.
- An anime provider with no local API on `:3001` reports `metadata-unavailable` for that provider only; the sweep continues.
- Duplicate labels in `--join` are rejected rather than silently overwriting a report.
