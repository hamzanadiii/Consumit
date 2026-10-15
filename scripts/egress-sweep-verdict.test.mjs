import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregate, classify, joinReports, renderMatrix, summarize } from './egress-sweep-verdict.mjs'

const measurement = (values = {}) => ({ resolveOk: null, mediaOk: null, mediaWithHeadersOk: null, mediaNoOriginOk: null, cors: null, browserOk: null, browserRun: false, codes: [], ...values })

test('aggregate prefers a measured true over false and never invents a browser result', () => {
  const provider = {
    id: 'vixsrc',
    probes: [
      { resolveOk: false, mediaOk: null, cors: null, browserOk: null, resolveCode: 'empty' },
      { resolveOk: true, mediaOk: false, cors: false, browserOk: null, resolveCode: undefined },
    ],
  }
  assert.deepEqual(aggregate(provider), {
    resolveOk: true,
    mediaOk: false,
    mediaWithHeadersOk: null,
    mediaNoOriginOk: null,
    cors: false,
    browserOk: null,
    browserRun: false,
    codes: ['empty'],
  })
})

test('media that only answers with the adapter hints is header-bound', () => {
  const result = classify({
    dev: measurement({ resolveOk: true, mediaOk: false, mediaWithHeadersOk: true, cors: false, browserOk: null }),
  }, 'dev')
  assert.equal(result.verdict, 'header-bound')
  assert.match(result.blockers[0], /not allowed to set/)
})

test('aggregate ORs the adapter-header measurement across probes', () => {
  const provider = {
    id: 'vidzen',
    probes: [
      { resolveOk: true, mediaOk: false, mediaWithHeadersOk: false, resolveCode: 'http-403' },
      { resolveOk: true, mediaOk: false, mediaWithHeadersOk: true, resolveCode: 'http-403' },
    ],
  }
  assert.equal(aggregate(provider).mediaWithHeadersOk, true)
  assert.equal(classify({ dev: aggregate(provider) }, 'dev').verdict, 'header-bound')
})

test('the Vidzen shape: adapter headers still refuse the Consumit origin', () => {
  const result = classify({
    dev: measurement({ resolveOk: true, mediaOk: false, mediaWithHeadersOk: false, mediaNoOriginOk: true, cors: true }),
  }, 'dev')
  assert.equal(result.verdict, 'origin-bound')
  assert.match(result.blockers[0], /allowlist/)
})

test('an origin refusal outranks an egress explanation', () => {
  const result = classify({
    dev: measurement({ resolveOk: true, mediaOk: false, mediaWithHeadersOk: false, mediaNoOriginOk: true }),
    ovh: measurement({ resolveOk: true, mediaOk: true, cors: true }),
  }, 'dev')
  assert.equal(result.verdict, 'origin-bound')
  assert.deepEqual(result.needsEgress, [])
})

test('a first frame from the viewer egress is direct regardless of other signals', () => {
  assert.equal(classify({ dev: measurement({ resolveOk: true, mediaOk: true, cors: true, browserOk: true }) }, 'dev').verdict, 'direct')
})

test('lookup that only works elsewhere is lookup-egress-bound and names the egress', () => {
  const result = classify({
    dev: measurement({ resolveOk: false }),
    cf: measurement({ resolveOk: true, mediaOk: true, cors: true, browserOk: false }),
  }, 'dev')
  assert.equal(result.verdict, 'lookup-egress-bound')
  assert.deepEqual(result.needsEgress, ['cf'])
})

test('the Vixsrc shape: lookup fails from every tested egress', () => {
  assert.equal(classify({ dev: measurement({ resolveOk: false }), ovh: measurement({ resolveOk: false }) }, 'dev').verdict, 'unresolved')
})

test('an anime lookup that ran without its catalog metadata is unmeasured, not unresolved', () => {
  assert.equal(classify({
    dev: measurement({ resolveOk: false, codes: ['metadata-unavailable'] }),
    ovh: measurement({ resolveOk: false, codes: ['metadata-unavailable'] }),
  }, 'dev').verdict, 'unmeasured')
})

test('a genuine empty lookup still reports unresolved', () => {
  assert.equal(classify({
    dev: measurement({ resolveOk: false, codes: ['empty'] }),
    ovh: measurement({ resolveOk: false, codes: ['empty'] }),
  }, 'dev').verdict, 'unresolved')
})

test('the LookMovie shape: resolves locally but media dies from the viewer egress', () => {
  const result = classify({
    ovh: measurement({ resolveOk: true, mediaOk: true, cors: true, browserOk: true }),
    dev: measurement({ resolveOk: true, mediaOk: false, cors: false, browserOk: false }),
  }, 'dev')
  assert.equal(result.verdict, 'media-egress-bound')
  assert.deepEqual(result.needsEgress, ['ovh'])
  assert.match(result.blockers[0], /bound to another egress/)
})

test('fetchable media that the browser origin cannot read is cors-blocked', () => {
  const result = classify({ dev: measurement({ resolveOk: true, mediaOk: true, cors: false, browserOk: false }) }, 'dev')
  assert.equal(result.verdict, 'cors-blocked')
})

test('CORS-readable media with no first frame is decode-blocked, not cors-blocked', () => {
  assert.equal(classify({ dev: measurement({ resolveOk: true, mediaOk: true, cors: true, browserOk: false }) }, 'dev').verdict, 'decode-blocked')
})

test('media failing on every tested egress is media-blocked', () => {
  assert.equal(classify({
    dev: measurement({ resolveOk: true, mediaOk: false }),
    ovh: measurement({ resolveOk: true, mediaOk: false }),
  }, 'dev').verdict, 'media-blocked')
})

test('a browser that never ran reports partial rather than failure', () => {
  const result = classify({ dev: measurement({ resolveOk: true, mediaOk: true, cors: true, browserOk: null }) }, 'dev')
  assert.equal(result.verdict, 'partial')
})

test('an untested viewer egress is viewer-untested', () => {
  assert.equal(classify({ ovh: measurement({ resolveOk: true }) }, 'dev').verdict, 'viewer-untested')
})

test('joinReports picks the browser-reporting label as viewer when none is named', () => {
  const rows = joinReports([
    { label: 'ovh', providers: [{ id: 'purstream', delivery: 'direct', probes: [{ resolveOk: true, mediaOk: true, cors: true, browserOk: true }] }] },
    { label: 'dev', providers: [{ id: 'purstream', delivery: 'direct', probes: [{ resolveOk: true, mediaOk: true, cors: true, browserOk: false }] }] },
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].viewer, 'ovh')
  assert.equal(rows[0].verdict, 'direct')
})

test('joinReports rejects duplicate labels and honours an explicit viewer', () => {
  assert.throws(() => joinReports([
    { label: 'dev', providers: [] },
    { label: 'dev', providers: [] },
  ]), /Duplicate sweep label/)

  const rows = joinReports([
    { label: 'ovh', providers: [{ id: 'lookmovie', delivery: 'direct', probes: [{ resolveOk: true, mediaOk: true, cors: true, browserOk: true }] }] },
    { label: 'dev', providers: [{ id: 'lookmovie', delivery: 'direct', probes: [{ resolveOk: true, mediaOk: false, cors: false, browserOk: false }] }] },
  ], 'dev')
  assert.equal(rows[0].viewer, 'dev')
  assert.equal(rows[0].verdict, 'media-egress-bound')
})

test('embed rows stay embed-class and never claim a direct verdict', () => {
  const rows = joinReports([
    { label: 'dev', providers: [{ id: 'vixsrcframe', delivery: 'embed', probes: [] }] },
  ])
  assert.equal(rows[0].verdict, 'embed-class')
})

test('summaries count direct, fixable and egress-bound providers', () => {
  const rows = joinReports([
    { label: 'dev', providers: [
      { id: 'purstream', delivery: 'direct', probes: [{ resolveOk: true, mediaOk: true, cors: true, browserOk: true }] },
      { id: 'vixsrc', delivery: 'direct', probes: [{ resolveOk: false }] },
      { id: 'lookmovie', delivery: 'direct', probes: [{ resolveOk: true, mediaOk: true, cors: false, browserOk: false }] },
      { id: 'vixsrcframe', delivery: 'embed', probes: [] },
    ] },
  ])
  const summary = summarize(rows)
  assert.equal(summary.providers, 4)
  assert.equal(summary.directPossible, 1)
  assert.equal(summary.counts['cors-blocked'], 1)
  assert.equal(summary.counts['embed-class'], 1)
  assert.equal(summary.counts['unresolved'], 1)
})

test('the matrix renders one escaped row per provider', () => {
  const rows = joinReports([
    { label: 'dev', providers: [{ id: 'a|b', delivery: 'direct', probes: [{ resolveOk: false }] }] },
  ])
  const table = renderMatrix(rows)
  assert.equal(table.split('\n')[0], '| Provider | Configured tier | Verdict | Needs egress | Blocker | Evidence |')
  assert.match(table, /a\\|b/)
  assert.equal(table.trim().split('\n').length, 3)
})
