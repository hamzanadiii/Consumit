import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createS3FileStore } from './s3-files'
afterEach(() => vi.restoreAllMocks())
describe('portable subtitle files', () => {
  it('preserves keys, expiry, first-party bytes, and original formats across clients', async () => {
    const client = new S3Client({ region: 'fixture', credentials: { accessKeyId: 'fixture', secretAccessKey: 'fixture' } }), objects = new Map<string, { bytes: Buffer; metadata: Record<string, string> }>()
    vi.spyOn(client, 'send').mockImplementation(async command => {
      if (command instanceof PutObjectCommand) { objects.set(command.input.Key!, { bytes: Buffer.from(command.input.Body as Buffer), metadata: command.input.Metadata! }); return {} }
      if (command instanceof GetObjectCommand) { const value = objects.get(command.input.Key!); if (!value) throw Object.assign(new Error(), { name: 'NoSuchKey' }); return { Body: Readable.from([value.bytes]), ContentLength: value.bytes.length, Metadata: value.metadata } }
      throw new Error('Unsupported operation')
    })
    let now = 0; const store = createS3FileStore(client, 'fixture', 'subtitles/v1', () => now), key = '0123456789abcdef', options = { content: 'tmdb/movie/1/en', ttlSeconds: 60 }
    await store.putVtt(key, 'WEBVTT\n\n', options); await store.putOriginal(key, { bytes: Buffer.from('original'), ext: 'srt' }, options)
    expect(await store.getVtt(key)).toBe('WEBVTT\n\n'); expect((await store.getOriginal(key))?.ext).toBe('srt')
    now = 61000; expect(await store.getVtt(key)).toBeNull(); expect(await store.getVtt('../escape')).toBeNull()
    client.destroy()
  })
})
