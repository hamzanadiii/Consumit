import { Readable } from 'node:stream'
import { createRelayWorker, type RelayEnv } from '@consumit/media-relay/worker'
import { createMediaTransport, type MediaTransport } from './transport.ts'

export type MediaBudgetState = { day: string; reserved: number }
type Limits = { active: number; bytesPerSecond: number; dailyBytes: number; deadlineMs: number }
type Dependencies = {
  transport?: MediaTransport
  now?: () => number
  state: MediaBudgetState
  save: (state: MediaBudgetState) => Promise<void>
}
const BLOCK = 1024 * 1024
const CHUNK = 32 * 1024
/** Separate media daemon, sharing capabilities and pinned sockets with the
 * control plane. It has no database, identity, or arbitrary URL endpoint. */
export function createMediaEgress(env: RelayEnv, limits: Limits, deps: Dependencies) {
  if (Object.keys(JSON.parse(env.RELAY_PROVIDERS)).some(id => id !== 'lookmovie-relay')
    || env.RELAY_DISCOVERY_PROVIDERS !== JSON.stringify({ 'lookmovie-relay': 'lookmovie-v1' })
    || !Object.values(limits).every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('Invalid media daemon policy.')
  const transport = deps.transport ?? createMediaTransport(), now = deps.now ?? Date.now
  let state = { ...deps.state }, credit = 0, active = 0, nextSend = 0
  let serial = Promise.resolve()
  let admission = 60, admissionAt = now()
  const worker = createRelayWorker({ verifyPublicHost: async () => { /* Every actual socket verifies and pins public DNS in transport. */ },
    fetch: async (input, init) => {
      const url = String(input), headers = Object.fromEntries(new Headers(init?.headers))
      const response = await transport(url, [new URL(url).hostname], headers, init?.signal ?? new AbortController().signal, init?.method === 'HEAD' ? { method: 'HEAD' } : undefined)
      if (init?.method === 'HEAD') { response.body.destroy(); return new Response(null, { status: response.status, headers: response.headers }) }
      return new Response(Readable.toWeb(response.body) as ReadableStream<Uint8Array>, { status: response.status, headers: response.headers })
    },
  })
  function consume(bytes: number) {
    const work = serial.then(async () => {
      const day = new Date(now()).toISOString().slice(0, 10)
      if (day < state.day) throw new Error('Media budget clock moved backwards.')
      if (day > state.day) { const fresh = { day, reserved: 0 }; await deps.save(fresh); state = fresh; credit = 0 }
      if (credit < bytes) {
        const reserve = Math.min(limits.dailyBytes - state.reserved, Math.max(BLOCK, bytes - credit))
        if (reserve <= 0 || credit + reserve < bytes) throw new Error('Media budget exhausted.')
        const next = { day, reserved: state.reserved + reserve }
        // Persist a conservative reservation before releasing any bytes.
        // A restart loses unused credit rather than resetting the quota.
        await deps.save(next); state = next; credit += reserve
      }
      credit -= bytes
    })
    serial = work.catch(() => undefined)
    return work
  }
  async function pace(bytes: number, signal: AbortSignal) {
    signal.throwIfAborted()
    const time = now(), sendAt = Math.max(time, nextSend)
    nextSend = sendAt + bytes * 1000 / limits.bytesPerSecond
    if (sendAt > time) await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new Error('Media transfer cancelled.')) }
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, sendAt - time)
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
    })
    signal.throwIfAborted()
  }
  return {
    snapshot: () => ({ active, day: state.day, reserved: state.reserved, dailyBytes: limits.dailyBytes }),
    async fetch(request: Request): Promise<Response> {
      const unavailable = (status: number) => new Response('Media unavailable.', { status, headers: { 'cache-control': 'no-store', 'access-control-allow-origin': env.APP_ORIGIN, 'retry-after': '30' } })
      const time = now()
      admission = Math.min(60, admission + Math.max(0, time - admissionAt) / 200); admissionAt = time
      if (admission < 1 || active >= limits.active) return unavailable(429)
      admission--
      active++
      const abort = new AbortController(), signal = AbortSignal.any([request.signal, abort.signal])
      const timer = setTimeout(() => abort.abort(new Error('Media transfer deadline exceeded.')), limits.deadlineMs)
      let finished = false
      const finish = () => { if (!finished) { finished = true; clearTimeout(timer); signal.removeEventListener('abort', cancelled); active-- } }
      let reader: Pick<ReadableStreamDefaultReader<Uint8Array>, 'read' | 'cancel'> | undefined
      let output: ReadableStreamDefaultController<Uint8Array> | undefined
      const cancelled = () => { void reader?.cancel().catch(() => undefined); if (!finished) output?.error(new Error('Media transfer cancelled.')); finish() }
      signal.addEventListener('abort', cancelled, { once: true })
      try {
        signal.throwIfAborted()
        const response = await worker.fetch(new Request(request, { signal }), env)
        if (signal.aborted) { await response.body?.cancel(); signal.throwIfAborted() }
        if (!response.body) { finish(); return response }
        reader = response.body.getReader()
        let pending: Uint8Array | undefined, offset = 0
        const body = new ReadableStream<Uint8Array>({
          start(controller) { output = controller },
          async pull(controller) {
            try {
              signal.throwIfAborted()
              if (!pending) { const chunk = await reader!.read(); if (chunk.done) { controller.close(); finish(); return }; pending = chunk.value; offset = 0 }
              const part = pending.subarray(offset, offset + CHUNK)
              await consume(part.length); await pace(part.length, signal)
              controller.enqueue(part); offset += part.length
              if (offset === pending.length) pending = undefined
            } catch { if (!finished) controller.error(new Error('Media transfer unavailable.')); abort.abort(); finish(); await reader!.cancel().catch(() => undefined) }
          },
          async cancel() { finish(); abort.abort(); await reader!.cancel().catch(() => undefined) },
        }, { highWaterMark: 0 })
        return new Response(body, { status: response.status, headers: response.headers })
      } catch { abort.abort(); finish(); return unavailable(503) }
    },
  }
}
