import { describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import { createProviderCompute, registerProviderComputeRoutes } from './provider-compute.ts'

describe('bounded provider computation', () => {
  it('computes the existing proof vector in an isolated process, without evaluating nonce contents', async () => {
    const compute = createProviderCompute()
    try {
      expect(await compute.solve('consumit-fixture-nonce', 8, new AbortController().signal)).toBe('38')
      expect(await compute.solve('";process.stdout.write("injected");/*', 0, new AbortController().signal)).toBe('0')
    } finally { compute.close() }
  })
  it('rejects a third calculation and terminates cancelled jobs', async () => {
    const compute = createProviderCompute({ deadlineMs: 50 })
    const first = new AbortController(), second = new AbortController()
    const jobs = [compute.solve('bounded-job-one', 18, first.signal), compute.solve('bounded-job-two', 18, second.signal)]
    const settled = Promise.allSettled(jobs)
    await expect(compute.solve('third', 0, new AbortController().signal)).rejects.toThrow('capacity')
    first.abort(); second.abort()
    expect((await settled).every(result => result.status === 'rejected')).toBe(true)
    compute.close()
  })
  it('authenticates and validates computation-only input before invoking the pool', async () => {
    const app = Fastify(), compute = { solve: vi.fn(async () => '38'), close: vi.fn() }
    registerProviderComputeRoutes(app, 'test-compute-secret', compute)
    try {
      const request = { method: 'POST' as const, url: '/v1/internal/animekai-pow', payload: { nonce: 'consumit-fixture-nonce', difficulty: 8 }, headers: { authorization: 'Bearer test-compute-secret' } }
      expect((await app.inject({ ...request, headers: {} })).statusCode).toBe(403)
      expect((await app.inject({ ...request, payload: { ...request.payload, url: 'https://upstream.example' } })).statusCode).toBe(400)
      expect((await app.inject({ ...request, payload: { nonce: 'x', difficulty: 19 } })).statusCode).toBe(400)
      expect(compute.solve).not.toHaveBeenCalled()
      expect((await app.inject(request)).json()).toEqual({ solution: '38' })
      compute.solve.mockRejectedValueOnce(new Error('busy'))
      expect((await app.inject(request)).statusCode).toBe(503)
    } finally { await app.close() }
    expect(compute.close).toHaveBeenCalledOnce()
  })
})
