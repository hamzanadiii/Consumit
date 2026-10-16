/** Independent of OVH: failure and recovery notifications survive a VPS outage. */
export async function probe(origin, fetcher = fetch, accessHeaders = {}) {
  for (const path of ['/', '/health/ready']) {
    const response = await fetcher(new URL(path, origin), { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10000), headers: { 'cache-control': 'no-cache', ...accessHeaders } })
    const valid = response.status === 200 && (path !== '/health/ready' || (/no-store/.test(response.headers.get('cache-control') ?? '') && !/^(HIT|STALE|UPDATING|REVALIDATED)$/i.test(response.headers.get('cf-cache-status') ?? '') && !response.headers.has('age')))
    // Cancel bodies rather than retaining website/member data.
    await response.body?.cancel()
    if (!valid) return false
  }
  return true
}

export async function check(env, fetcher = fetch, now = Date.now()) {
  const previous = await env.STATE.get('consumit-uptime', 'json') ?? { failures: 0, alerted: false, lastAlert: 0 }
  let healthy = false
  const accessHeaders = env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET ? { 'CF-Access-Client-Id': env.CF_ACCESS_CLIENT_ID, 'CF-Access-Client-Secret': env.CF_ACCESS_CLIENT_SECRET } : {}
  try { healthy = await probe('https://consumit.online', fetcher, accessHeaders) } catch { /* Safe aggregate outcome only. */ }
  const failures = healthy ? 0 : previous.failures + 1
  const failureAlert = failures >= 2 && (!previous.alerted || now - previous.lastAlert >= 1800000)
  const recoveryAlert = healthy && previous.alerted
  let alerted = previous.alerted
  let lastAlert = previous.lastAlert
  if (failureAlert || recoveryAlert) {
    try {
      const response = await fetcher(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(5000),
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: recoveryAlert ? 'Consumit recovered: public HTTPS and API readiness are healthy.' : 'Consumit is unavailable: public HTTPS or API readiness failed twice. Check OVH, Tunnel and Cloudflare.' }),
      })
      const body = await response.json().catch(() => null)
      if (response.ok && body?.ok === true) { alerted = !healthy; lastAlert = now }
    } catch { /* Keep pending notification state for the next check. */ }
  }
  await env.STATE.put('consumit-uptime', JSON.stringify({ failures, alerted, lastAlert }))
  return { healthy, failures, alerted }
}

export default {
  fetch: () => new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } }),
  scheduled: (_event, env, ctx) => ctx.waitUntil(check(env)),
}
