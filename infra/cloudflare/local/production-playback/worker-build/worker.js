var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../../packages/media-relay/src/grants.ts
var encoder = new TextEncoder();
var decoder = new TextDecoder("utf-8", { fatal: true });
var MAX_GRANT_MS = 30 * 6e4;
function exactMediaHost(host) {
  return host.length <= 253 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(host) && !/\.(?:local|internal|localhost|test|invalid)$/.test(host) && !/^\d+(?:\.\d+){3}$/.test(host);
}
__name(exactMediaHost, "exactMediaHost");
function relayDestination(value, hosts) {
  try {
    const url = new URL(value);
    return value.length <= 1800 && url.protocol === "https:" && !url.username && !url.password && !url.hash && (!url.port || url.port === "443") && exactMediaHost(url.hostname) && hosts.includes(url.hostname);
  } catch {
    return false;
  }
}
__name(relayDestination, "relayDestination");
function encode(value) {
  const native = value;
  if (native.toBase64) return native.toBase64({ alphabet: "base64url", omitPadding: true });
  return btoa(String.fromCharCode(...value)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
__name(encode, "encode");
function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid grant.");
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (char) => char.charCodeAt(0));
}
__name(decode, "decode");
function validGrant(value, now, allowExpired = false) {
  if (!value || typeof value !== "object") return false;
  const grant = value;
  if (grant.recipe !== void 0 || grant.hosts !== void 0) {
    if (!["storm-boron-v1", "wecollege-city-v1"].includes(grant.recipe ?? "") || !Array.isArray(grant.hosts) || !grant.hosts.length || grant.hosts.length > 8 || grant.hosts.some((host) => !exactMediaHost(host)) || !relayDestination(grant.url ?? "", grant.hosts)) return false;
  }
  if (grant.version !== 1 || !/^[a-z0-9-]{1,40}$/.test(grant.provider ?? "") || typeof grant.url !== "string" || !Number.isSafeInteger(grant.expires) || !allowExpired && grant.expires <= now || grant.expires > now + MAX_GRANT_MS || !["hls", "native", "auto"].includes(grant.kind ?? "") || !Number.isInteger(grant.depth) || grant.depth < 0 || grant.depth > 5 || typeof grant.origin !== "string" || typeof grant.headerHost !== "string" || !exactMediaHost(grant.headerHost) || !grant.headers || typeof grant.headers !== "object" || Array.isArray(grant.headers)) return false;
  try {
    if (new URL(grant.origin).origin !== grant.origin) return false;
  } catch {
    return false;
  }
  return Object.entries(grant.headers).every(([name, value2]) => /^(referer|origin|accept|user-agent)$/i.test(name) && typeof value2 === "string" && value2.length <= 512 && !/[\r\n]/.test(value2));
}
__name(validGrant, "validGrant");
async function createGrantCodec(secret) {
  if (secret.length < 32) throw new Error("Relay secret requires at least 32 characters.");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  const key2 = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
  return {
    async seal(grant, now = Date.now()) {
      if (!validGrant(grant, now)) throw new Error("Invalid grant.");
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const compact = [grant.version, grant.provider, grant.url, grant.expires, grant.origin, grant.headers, grant.headerHost, grant.kind, grant.depth, ...grant.recipe ? [grant.recipe, grant.hosts] : []];
      const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode("consumit-media-v1") }, key2, encoder.encode(JSON.stringify(compact)));
      const bytes = new Uint8Array(iv.length + data.byteLength);
      bytes.set(iv);
      bytes.set(new Uint8Array(data), iv.length);
      const token = encode(bytes);
      if (token.length > 3600) throw new Error("Grant exceeds its limit.");
      return token;
    },
    async open(token, now = Date.now(), allowExpired = false) {
      if (token.length > 3600) throw new Error("Invalid grant.");
      const bytes = decode(token);
      if (bytes.length < 29) throw new Error("Invalid grant.");
      const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: encoder.encode("consumit-media-v1") }, key2, bytes.slice(12));
      const parsed = JSON.parse(decoder.decode(data));
      const value = Array.isArray(parsed) && [9, 11].includes(parsed.length) ? {
        version: parsed[0],
        provider: parsed[1],
        url: parsed[2],
        expires: parsed[3],
        origin: parsed[4],
        headers: parsed[5],
        headerHost: parsed[6],
        kind: parsed[7],
        depth: parsed[8],
        ...parsed.length === 11 ? { recipe: parsed[9], hosts: parsed[10] } : {}
      } : parsed;
      if (!validGrant(value, now, allowExpired)) throw new Error("Invalid grant.");
      return value;
    }
  };
}
__name(createGrantCodec, "createGrantCodec");
function mediaGrantUrl(origin, token) {
  return `${origin}/media/${token}`;
}
__name(mediaGrantUrl, "mediaGrantUrl");
function manifestGrantUrl(origin, token) {
  return `${origin}/v1/playback/relay-manifest?grant=${token}`;
}
__name(manifestGrantUrl, "manifestGrantUrl");

// ../../packages/media-relay/src/bingebang.ts
var key = Uint8Array.from([86, 82, 132, 178, 234, 93, 156, 216, 222, 68, 110, 37, 115, 52, 99, 18, 159, 22, 49, 115, 77, 91, 187, 73, 74, 71, 15, 77, 48, 204, 58, 69], (byte, index) => byte ^ index * 37 + 11 & 255);
function isBingeManifest(provider, url) {
  return provider === "bingebangymovies" && new URL(url).hostname === "os.bingebangstream.online";
}
__name(isBingeManifest, "isBingeManifest");
function bingeFetchUrl(provider, value, manifest) {
  const url = new URL(value);
  if (manifest && isBingeManifest(provider, value)) url.pathname = url.pathname.replace(/\.m3u8$/i, ".jpg");
  return url.href;
}
__name(bingeFetchUrl, "bingeFetchUrl");
function decodeRelayManifest(bytes, provider, url) {
  if (isBingeManifest(provider, url) && !(bytes[0] === 35 && bytes[1] === 69 && bytes[2] === 88)) {
    bytes = Uint8Array.from(bytes, (byte, index) => byte ^ key[index % key.length]);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
__name(decodeRelayManifest, "decodeRelayManifest");

// ../../packages/media-relay/src/provider-headers.ts
function mediaHeaders(provider, host, headerHost, hints, recipe) {
  if (host === headerHost) return hints;
  if (provider === "zoko" && headerHost === "hls.dramahot.top" && host === "hls1.drama1.cfd") {
    return { referer: "https://zokoanime.video/", origin: "https://zokoanime.video" };
  }
  if (["wecollege-miami", "wecollege-boise"].includes(provider) && headerHost === "moon.zenoak.top" && (recipe === "wecollege-city-v1" || ["ultramoss.top", "emberwave.top", "rapidmesa.top"].includes(host))) {
    return { referer: "https://movy.sx/" };
  }
  if (provider === "stormboron" && recipe === "storm-boron-v1") return { referer: "https://vidstorm.to/" };
  if (["vidnest", "vaplayer", "zeta"].includes(provider)) {
    const out = {};
    for (const [name, value] of Object.entries(hints)) {
      const key2 = name.toLowerCase();
      if (!["referer", "origin", "user-agent", "accept"].includes(key2)) continue;
      if (typeof value !== "string" || !value || value.length > 512 || /[\r\n]/.test(value)) continue;
      if (key2 === "origin") {
        try {
          out[key2] = new URL(value).origin;
        } catch {
          continue;
        }
      } else {
        out[key2] = value;
      }
    }
    return out;
  }
  return {};
}
__name(mediaHeaders, "mediaHeaders");

// ../../packages/media-relay/src/public-host.ts
function publicIp(address) {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(address)) {
    const parts = address.split(".").map(Number);
    if (parts.some((part) => part > 255)) return false;
    const [a, b, c] = parts;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 && c === 0 || b === 0 && c === 2) || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113);
  }
  if (!/^[0-9a-f:]+$/i.test(address) || address.split("::").length > 2 || /^:[^:]|[^:]:$/.test(address)) return false;
  const halves = address.toLowerCase().split("::"), left = halves[0]?.split(":").filter(Boolean) ?? [], right = halves[1]?.split(":").filter(Boolean) ?? [];
  if ([...left, ...right].some((part) => part.length > 4) || (halves.length === 1 ? left.length !== 8 : left.length + right.length >= 8)) return false;
  const words = [...left, ...Array(halves.length === 2 ? 8 - left.length - right.length : 0).fill("0"), ...right].map((part) => Number.parseInt(part, 16));
  return (words[0] & 57344) === 8192 && !(words[0] === 8193 && (words[1] === 0 || words[1] === 3512)) && words[0] !== 8194;
}
__name(publicIp, "publicIp");
function createPublicHostCheck(dnsFetch = fetch) {
  const cache = /* @__PURE__ */ new Map();
  return async (host, signal) => {
    if ((cache.get(host) ?? 0) > Date.now()) return;
    const answers = await Promise.all(["A", "AAAA"].map(async (type) => {
      const r = await dnsFetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, { headers: { accept: "application/dns-json" }, signal: AbortSignal.any([signal, AbortSignal.timeout(3e3)]) });
      if (!r.ok) throw new Error("Media DNS unavailable.");
      const text = await r.text();
      if (text.length > 16384) throw new Error("Invalid DNS response.");
      const data = JSON.parse(text);
      if (data.Status !== 0 || !Array.isArray(data.Answer ?? []) || (data.Answer?.length ?? 0) > 32) throw new Error("Invalid DNS response.");
      return (data.Answer ?? []).filter((answer) => answer.type === 1 || answer.type === 28).map((answer) => answer.data);
    }));
    const addresses = answers.flat();
    if (!addresses.length || addresses.some((address) => !publicIp(address))) throw new Error("Blocked discovered media address.");
    if (cache.size >= 128) cache.delete(cache.keys().next().value);
    cache.set(host, Date.now() + 6e4);
  };
}
__name(createPublicHostCheck, "createPublicHostCheck");

// ../../packages/media-relay/src/manifest.ts
async function rewriteRelayManifest(text, base, grant, hosts, codec, origin, now, playlistOrigin) {
  if (!text.startsWith("#EXTM3U") || grant.depth >= 5 || /#EXT-X-(?:DEFINE|CONTENT-STEERING)\b|\{\$/.test(text)) throw new Error("Unsupported manifest.");
  const references = [];
  let nextPlaylist = false;
  const replaced = text.split(/\r?\n/).map((line) => {
    if (line.trim() && !line.startsWith("#")) {
      references.push({ uri: line.trim(), playlist: nextPlaylist });
      nextPlaylist = false;
      return `__CONSUMIT_${references.length - 1}__`;
    }
    if (line.startsWith("#EXT-X-STREAM-INF:")) nextPlaylist = true;
    return line.replace(/\bURI="([^"]*)"/g, (_match, uri) => {
      references.push({ uri, playlist: /^#EXT-X-(?:MEDIA|I-FRAME-STREAM-INF|RENDITION-REPORT):/.test(line) });
      return `URI="__CONSUMIT_${references.length - 1}__"`;
    });
  }).join("\n");
  if (references.length > 2e3 || /__CONSUMIT_/.test(text)) throw new Error("Invalid manifest.");
  const urls = references.map((ref) => new URL(ref.uri, base).href);
  if (urls.some((url) => !relayDestination(url, hosts))) throw new Error("Blocked manifest destination.");
  const tokens = await Promise.all(urls.map((url, index) => codec.seal({ ...grant, url, kind: references[index].playlist ? "hls" : "auto", depth: grant.depth + 1, ...grant.recipe && !references[index].playlist ? { hosts: [new URL(url).hostname] } : {} }, now)));
  return replaced.replace(/__CONSUMIT_(\d+)__/g, (_match, index) => playlistOrigin && references[Number(index)].playlist ? manifestGrantUrl(playlistOrigin, tokens[Number(index)]) : mediaGrantUrl(origin, tokens[Number(index)]));
}
__name(rewriteRelayManifest, "rewriteRelayManifest");

// ../../packages/media-relay/src/worker.ts
var MAX_MANIFEST_BYTES = 512 * 1024;
function policies(raw) {
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid relay policy.");
  const entries = Object.entries(value);
  if (entries.length > 64 || entries.some(([id, hosts]) => !/^[a-z0-9-]{1,40}$/.test(id) || !Array.isArray(hosts) || !hosts.length || hosts.length > 100 || hosts.some((host) => typeof host !== "string" || !exactMediaHost(host)))) throw new Error("Invalid relay policy.");
  return Object.fromEntries(entries);
}
__name(policies, "policies");
async function boundedManifest(response, limit = MAX_MANIFEST_BYTES) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing manifest.");
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) throw new Error("Manifest exceeds limit.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => void 0);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
__name(boundedManifest, "boundedManifest");
async function verifiedTsPrefix(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing media.");
  const chunks = [];
  let length = 0;
  try {
    while (length < 377) {
      const chunk = await reader.read();
      if (chunk.done) break;
      chunks.push(chunk.value);
      length += chunk.value.length;
    }
    const prefix = new Uint8Array(377);
    let offset = 0;
    for (const chunk of chunks) {
      const part = chunk.subarray(0, 377 - offset);
      prefix.set(part, offset);
      offset += part.length;
    }
    if (length < 377 || prefix[0] !== 71 || prefix[188] !== 71 || prefix[376] !== 71) throw new Error("Invalid TS media.");
  } catch (error) {
    await reader.cancel().catch(() => void 0);
    throw error;
  }
  reader.releaseLock();
  return chunks;
}
__name(verifiedTsPrefix, "verifiedTsPrefix");
function createRelayWorker(deps = {}) {
  const upstreamFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const verifyPublicHost = deps.verifyPublicHost ?? createPublicHostCheck();
  let cached;
  return {
    async fetch(request, env) {
      const headers = new Headers({ "cache-control": "no-store", "x-content-type-options": "nosniff", vary: "Origin" });
      const fail = /* @__PURE__ */ __name((status2) => new Response("Media unavailable.", { status: status2, headers }), "fail");
      if (env.RELAY_ENABLED !== "true") return fail(503);
      if (request.headers.get("origin") && request.headers.get("origin") !== env.APP_ORIGIN) return fail(403);
      headers.set("access-control-allow-origin", env.APP_ORIGIN);
      headers.set("access-control-allow-methods", "GET, HEAD, OPTIONS");
      headers.set("access-control-allow-headers", "Range");
      headers.set("access-control-expose-headers", "Content-Length, Content-Range, Accept-Ranges");
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
      if (!["GET", "HEAD"].includes(request.method)) return fail(405);
      const path = new URL(request.url);
      if (!path.pathname.startsWith("/media/") || path.search) return fail(404);
      let grant, hosts, staticHosts, codec;
      try {
        if (!cached || cached.secret !== env.RELAY_SECRET) cached = { secret: env.RELAY_SECRET, codec: createGrantCodec(env.RELAY_SECRET) };
        codec = await cached.codec;
        grant = await codec.open(path.pathname.slice(7), now());
        staticHosts = policies(env.RELAY_PROVIDERS)[grant.provider] ?? [];
        hosts = staticHosts;
        if (grant.recipe) {
          const discovery = JSON.parse(env.RELAY_DISCOVERY_PROVIDERS ?? "{}");
          const reviewed = grant.provider === "stormboron" && grant.recipe === "storm-boron-v1" || ["wecollege-miami", "wecollege-boise"].includes(grant.provider) && grant.recipe === "wecollege-city-v1";
          if (!staticHosts.length || !reviewed || discovery[grant.provider] !== grant.recipe || !grant.hosts?.length) return fail(403);
          hosts = grant.hosts;
        }
        if (grant.origin !== env.APP_ORIGIN || !relayDestination(grant.url, hosts)) return fail(403);
      } catch {
        return fail(403);
      }
      const range = request.headers.get("range");
      if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) return fail(416);
      const abort = new AbortController();
      const signal = AbortSignal.any([request.signal, abort.signal]);
      let timer = setTimeout(() => abort.abort(), 1e4);
      const started = now();
      let bytes = 0, status = 502, kind = "media";
      let bytesKnown = true;
      const report = /* @__PURE__ */ __name(() => {
        try {
          deps.report?.({ provider: grant.provider, kind, status, bytes, bytesKnown, durationMs: Math.max(0, now() - started) });
        } catch {
        }
      }, "report");
      try {
        let url = bingeFetchUrl(grant.provider, grant.url, grant.kind === "hls");
        let response;
        for (let redirects = 0; redirects <= 3; redirects++) {
          if (!relayDestination(url, hosts)) throw new Error("Blocked redirect.");
          if (grant.recipe && !staticHosts.includes(new URL(url).hostname)) await verifyPublicHost(new URL(url).hostname, signal);
          const outgoing = new Headers(mediaHeaders(grant.provider, new URL(url).hostname, grant.headerHost, grant.headers, grant.recipe));
          outgoing.set("accept-encoding", "identity");
          if (!outgoing.has("user-agent")) outgoing.set("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
          if (range) outgoing.set("range", range);
          response = await upstreamFetch(url, { method: request.method, headers: outgoing, redirect: "manual", signal, cache: "no-store" });
          if (![301, 302, 303, 307, 308].includes(response.status)) break;
          await response.body?.cancel();
          const location = response.headers.get("location");
          if (!location || redirects === 3) throw new Error("Invalid redirect.");
          url = new URL(location, url).href;
        }
        status = response.status;
        if (![200, 206, 416].includes(status)) {
          await response.body?.cancel();
          clearTimeout(timer);
          report();
          return fail(status === 403 ? 403 : 502);
        }
        const mislabelledTs = grant.kind !== "hls" && /text\/html/i.test(response.headers.get("content-type") ?? "") && (grant.provider === "stormboron" && (grant.recipe === "storm-boron-v1" || ["celestialdreamer.lol", "moonfirekeeper.lol", "emberwindkeeper.lol"].includes(new URL(url).hostname)) || ["zeta", "vidnest", "vaplayer"].includes(grant.provider) && new URL(url).hostname === "remoteconsultinggroup.site");
        const prefix = mislabelledTs ? await verifiedTsPrefix(response) : [];
        const contentType = mislabelledTs ? "video/mp2t" : response.headers.get("content-type") ?? "";
        if (/text\/html|application\/(?:json|javascript)/i.test(contentType)) throw new Error("Invalid media.");
        const manifest = grant.kind === "hls" || grant.kind === "auto" && (/mpegurl/i.test(contentType) || new URL(url).pathname.endsWith(".m3u8"));
        kind = manifest ? "manifest" : "media";
        if (manifest && range) {
          await response.body?.cancel();
          clearTimeout(timer);
          status = 416;
          report();
          return fail(416);
        }
        if (manifest && request.method !== "HEAD" && status === 200) {
          const text = decodeRelayManifest(await boundedManifest(response, grant.provider === "bingebangymovies" ? 1024 * 1024 : MAX_MANIFEST_BYTES), grant.provider, url);
          const rewritten = await rewriteRelayManifest(text, url, grant, hosts, codec, path.origin, now());
          clearTimeout(timer);
          headers.set("content-type", "application/vnd.apple.mpegurl");
          bytes = new TextEncoder().encode(rewritten).length;
          report();
          return new Response(rewritten, { status: 200, headers });
        }
        for (const name of ["content-length", "content-range", "accept-ranges"]) {
          if (name === "content-length" && response.headers.get("content-encoding") && response.headers.get("content-encoding") !== "identity") continue;
          const value = response.headers.get(name);
          if (value) headers.set(name, value);
        }
        headers.set("content-type", /^(?:video|audio)\//i.test(contentType) ? contentType : "application/octet-stream");
        clearTimeout(timer);
        if (request.method === "HEAD" || !response.body || status === 416) {
          await response.body?.cancel();
          report();
          return new Response(null, { status, headers });
        }
        const NativeIdentity = globalThis.IdentityTransformStream;
        if (grant.kind === "auto" && NativeIdentity) {
          const lengthHeader = headers.get("content-length");
          const length = lengthHeader === null ? void 0 : Number(lengthHeader);
          const NativeFixed = globalThis.FixedLengthStream;
          const knownLength = length !== void 0 && Number.isSafeInteger(length) && length >= 0 ? length : void 0;
          const fixed = knownLength !== void 0 && NativeFixed;
          const pipe = fixed ? new NativeFixed(knownLength) : new NativeIdentity();
          bytesKnown = false;
          timer = setTimeout(() => abort.abort(new Error("Media transfer deadline exceeded.")), 6e4);
          const transfer = /* @__PURE__ */ __name(async () => {
            if (prefix.length) {
              const writer = pipe.writable.getWriter();
              try {
                for (const chunk of prefix) {
                  signal.throwIfAborted();
                  await writer.write(chunk);
                }
              } finally {
                writer.releaseLock();
              }
            }
            await response.body.pipeTo(pipe.writable, { signal });
          }, "transfer");
          void transfer().then(() => {
            if (fixed) {
              bytes = knownLength;
              bytesKnown = true;
            }
          }, async (error) => {
            status = request.signal.aborted ? 499 : 504;
            await response.body?.cancel(error).catch(() => void 0);
            await pipe.writable.abort(error).catch(() => void 0);
          }).finally(() => {
            clearTimeout(timer);
            report();
          });
          return new Response(pipe.readable, { status, headers });
        }
        const reader = response.body.getReader();
        let finished = false;
        const finish = /* @__PURE__ */ __name(() => {
          if (!finished) {
            finished = true;
            clearTimeout(timer);
            report();
          }
        }, "finish");
        const body = new ReadableStream({
          async pull(controller) {
            try {
              const chunk = await Promise.race([
                prefix.length ? Promise.resolve({ value: prefix.shift(), done: false }) : reader.read(),
                new Promise((_resolve, reject) => {
                  timer = setTimeout(() => {
                    abort.abort();
                    reject(new Error("Media transfer stalled."));
                  }, 15e3);
                })
              ]);
              clearTimeout(timer);
              if (chunk.done) {
                controller.close();
                finish();
              } else {
                bytes += chunk.value.length;
                controller.enqueue(chunk.value);
              }
            } catch {
              void reader.cancel().catch(() => void 0);
              status = 504;
              controller.error(new Error("Media transfer failed."));
              finish();
            }
          },
          async cancel(reason) {
            abort.abort();
            await reader.cancel(reason).catch(() => void 0);
            finish();
          }
        });
        return new Response(body, { status, headers });
      } catch {
        abort.abort();
        clearTimeout(timer);
        status = 502;
        report();
        return fail(502);
      }
    }
  };
}
__name(createRelayWorker, "createRelayWorker");
var worker_default = createRelayWorker({ report: /* @__PURE__ */ __name((entry) => console.log(JSON.stringify({ event: "relay.request", ...entry })), "report") });
export {
  createRelayWorker,
  worker_default as default
};
//# sourceMappingURL=worker.js.map
