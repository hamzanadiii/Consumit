import { expect, it } from 'vitest'
import { createMediaTransport } from './transport.ts'
import { createProviderHttp } from './provider-http.ts'
import { createSubtitleHttp, fetchSubtitleBytes } from '../subtitles/http.ts'

it('denies provider lookup, manifests, audio, probes, diagnostics and captions before DNS or sockets', async () => {
  const transport = createMediaTransport({ execution: 'cloudflare-only' })
  const hosts = ['provider.example.com'], url = 'https://provider.example.com/file'
  const signal = new AbortController().signal
  await expect(transport(url, hosts, {}, signal)).rejects.toThrow('VPS provider egress denied')
  await expect(createProviderHttp(hosts, transport)(url, {}, signal)).rejects.toThrow('VPS provider egress denied')
  await expect(createSubtitleHttp(hosts, transport).get(url, {}, signal)).rejects.toThrow('VPS provider egress denied')
  await expect(fetchSubtitleBytes(url, hosts, {}, signal, undefined, [], transport)).rejects.toThrow('VPS provider egress denied')
})
