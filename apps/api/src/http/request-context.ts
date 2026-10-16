import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { context, propagation, trace, metrics, SpanStatusCode, type Span } from '@opentelemetry/api'

import type { FastifyInstance } from 'fastify'

const CALLER_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/

const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.body.password',
  'req.body.currentPassword',
  'req.body.newPassword',
  'req.body.token',
  'req.body.code',
  'req.body.email',
  '*.password',
]

/**
 * Caller request ids are echoed for correlation only when they match a
 * strict token shape. Anything else (including header-injection attempts)
 * is replaced with a generated UUID.
 *
 * NOTE: this must stay wired through Fastify's `genReqId` option. The
 * `requestIdHeader` option looks convenient but bypasses `genReqId` and
 * trusts the raw caller header — exactly what this validation exists to
 * prevent.
 */
export function requestIdFrom(header: unknown): string {
  if (typeof header === 'string' && CALLER_REQUEST_ID.test(header)) return header
  return randomUUID()
}

export function generateRequestId(request: Pick<IncomingMessage, 'headers'>): string {
  return requestIdFrom(request.headers['x-request-id'])
}

/**
 * Echo the settled request id on every response so one id correlates
 * client, logs, and error reports. Every request — including 4xx/5xx —
 * carries it.
 */
export function registerRequestContext(app: FastifyInstance) {
  const tracer = trace.getTracer('consumit.http'), duration = metrics.getMeter('consumit.http').createHistogram('http.request.duration', { unit: 'ms' })
  const requests = new WeakMap<import('fastify').FastifyRequest, { span: Span; started: number; route: string }>()
  app.addHook('onRequest', (request, _reply, done) => {
    const route = request.routeOptions.url ?? 'unknown'
    const parent = propagation.extract(context.active(), request.headers)
    const span = tracer.startSpan('http.request', { attributes: { 'http.route': route, 'http.request.method': request.method } }, parent)
    requests.set(request, { span, route, started: performance.now() })
    context.with(trace.setSpan(parent, span), done)
  })
  app.addHook('onResponse', async (request, reply) => {
    const entry = requests.get(request)
    if (!entry) return
    const status = reply.statusCode
    duration.record(performance.now() - entry.started, { route: entry.route, method: request.method, status: `${Math.floor(status / 100)}xx` })
    entry.span.setAttribute('http.response.status_code', status)
    if (status >= 500) entry.span.setStatus({ code: SpanStatusCode.ERROR })
    entry.span.end(); requests.delete(request)
  })
  app.addHook('onSend', async (request, reply, payload) => {
    void reply.header('x-request-id', request.id)
    return payload
  })
}

export function loggerOptions() {
  return {
    redact: { paths: REDACTED_PATHS, remove: true },
    serializers: {
      err(error: unknown) {
        // Provider exceptions can contain signed media URLs or credentials.
        const names = new Set(['ApiError', 'CatalogError', 'IdentityError', 'SubtitleError', 'AnimeError', 'TypeError', 'SyntaxError', 'Error'])
        const name = error instanceof Error && names.has(error.name) ? error.name : 'Error'
        return { type: name, message: 'Exception details withheld.', stack: '' }
      },
      req(request: { id?: string; method?: string; url?: string; hostname?: string; ip?: string; socket?: { remotePort?: number | undefined } }) {
        const url = request.url ?? ''
        return { id: request.id, method: request.method ?? '',
          url: url.split('?')[0] ?? '',
          hostname: request.hostname ?? '', remoteAddress: request.ip ?? '', remotePort: request.socket?.remotePort ?? 0 }
      },
    },
  }
}
