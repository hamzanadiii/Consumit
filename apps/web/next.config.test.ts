import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import config from './next.config'

describe('provider frame security policy', () => {
  it('permits reviewed external players without opening arbitrary frame origins', async () => {
    const routes = await config.headers!()
    const policy = routes[0]!.headers.find(header => header.key === 'Content-Security-Policy')!.value
    const frames = policy.split(';').find(directive => directive.trim().startsWith('frame-src'))!.trim().split(/\s+/).slice(1)
    expect(frames).toContain('https://vixsrc.to')
    expect(frames).toContain('https://megaplay.buzz')
    expect(frames).toContain('https://flixcloud.cc')
    expect(frames).toContain('https://vidrock.to')
    const rows: { deliveryMode?: string; mediaHosts: string[] }[] = JSON.parse(readFileSync(resolve(process.cwd(), '../../infra/playback/providers.example.json'), 'utf8'))
    for (const row of rows.filter(row => row.deliveryMode === 'embed')) {
      for (const host of row.mediaHosts) expect(frames).toContain(`https://${host}`)
    }
    expect(frames).not.toContain('https:')
    expect(frames).not.toContain('*')
    expect(policy).toContain("frame-ancestors 'self'")
    expect(policy).toContain("object-src 'none'")
  })
})
