import { spawn, type ChildProcess } from 'node:child_process'
import { timingSafeEqual } from 'node:crypto'
import { animeKaiPowProgram } from '../../../../packages/provider-sdk/src/adapters/animekai.ts'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

const inputSchema = z.strictObject({ nonce: z.string().max(512), difficulty: z.number().int().min(0).max(18) })

/** Two isolated pure calculations at most. Children have no inherited credentials or provider I/O. */
export function createProviderCompute(options: { deadlineMs?: number } = {}) {
  const jobs = new Set<ChildProcess>()
  let closed = false
  return {
    solve(nonce: string, difficulty: number, signal: AbortSignal): Promise<string | null> {
      inputSchema.parse({ nonce, difficulty })
      signal.throwIfAborted()
      if (closed || jobs.size >= 2) return Promise.reject(new Error('Provider computation is at capacity.'))
      const deadlineMs = options.deadlineMs ?? 8000
      return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--eval', animeKaiPowProgram(nonce, difficulty, deadlineMs)], { env: {}, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
        jobs.add(child)
        let output = '', settled = false
        const finish = (error?: Error, value?: string | null) => {
          if (settled) return
          settled = true
          clearTimeout(timer); signal.removeEventListener('abort', cancel)
          if (error) { child.kill('SIGKILL'); reject(error) } else resolve(value ?? null)
        }
        const cancel = () => finish(new Error('Provider computation cancelled.'))
        const timer = setTimeout(() => finish(new Error('Provider computation timed out.')), deadlineMs)
        signal.addEventListener('abort', cancel, { once: true })
        child.stdout!.on('data', chunk => {
          output += String(chunk)
          if (output.length > 128) finish(new Error('Invalid computation response.'))
        })
        child.on('error', () => { jobs.delete(child); finish(new Error('Provider computation unavailable.')) })
        child.on('close', code => {
          jobs.delete(child)
          if (code !== 0) { finish(new Error('Provider computation unavailable.')); return }
          try {
            const value = JSON.parse(output) as { solution?: unknown }
            if (value.solution !== null && (typeof value.solution !== 'string' || !/^\d{1,12}$/.test(value.solution))) throw new Error('Invalid solution.')
            finish(undefined, value.solution as string | null)
          } catch { finish(new Error('Invalid computation response.')) }
        })
        if (signal.aborted) cancel()
      })
    },
    close() { closed = true; for (const child of jobs) child.kill('SIGKILL') },
  }
}

export function registerProviderComputeRoutes(app: FastifyInstance, secret: string, compute = createProviderCompute()) {
  app.addHook('onClose', async () => compute.close())
  app.post('/v1/internal/animekai-pow', { bodyLimit: 4096, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    reply.header('cache-control', 'no-store')
    const actual = Buffer.from(String(request.headers.authorization ?? '')), expected = Buffer.from(`Bearer ${secret}`)
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return reply.code(403).send({ solution: null })
    const parsed = inputSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ solution: null })
    const controller = new AbortController()
    const cancel = () => controller.abort()
    request.raw.once('aborted', cancel)
    const close = () => { if (!reply.raw.writableFinished) cancel() }
    reply.raw.once('close', close)
    try { return { solution: await compute.solve(parsed.data.nonce, parsed.data.difficulty, controller.signal) } }
    catch { return reply.code(503).send({ solution: null }) }
    finally { request.raw.removeListener('aborted', cancel); reply.raw.removeListener('close', close) }
  })
}
