import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3'
import { Readable } from 'node:stream'
import type { SubtitleFileStore, OriginalFile } from '../../api/src/subtitles/storage.ts'

const MAX_BYTES = 5 * 1024 * 1024
const keyPattern = /^[a-f0-9]{16}$/
/** Portable first-party files. Bucket addresses and credentials never enter browser DTOs. */
export function createS3FileStore(client: S3Client, bucket: string, prefix = 'subtitles/v1', clock = Date.now): SubtitleFileStore {
  if (!bucket || !/^[a-z0-9/-]+$/.test(prefix) || prefix.includes('..')) throw new Error('Invalid subtitle object storage configuration.')
  async function get(key: string, suffix: string) {
    if (!keyPattern.test(key)) return null
    try {
      const signal = AbortSignal.timeout(5000)
      const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: `${prefix}/${key}.${suffix}` }), { abortSignal: signal })
      const body = object.Body
      if (!(body instanceof Readable)) throw new Error('Subtitle object returned no readable body.')
      const expiry = Number(object.Metadata?.expires)
      if (!Number.isFinite(expiry) || expiry <= clock() || expiry > clock() + 7 * 86400000 || (object.ContentLength ?? Infinity) > MAX_BYTES) { body.destroy(); return null }
      const abort = () => body.destroy(new Error('Subtitle object read timed out.'))
      signal.addEventListener('abort', abort, { once: true })
      const parts: Buffer[] = []; let total = 0
      try { signal.throwIfAborted(); for await (const chunk of body) { const bytes = Buffer.from(chunk); total += bytes.length; if (total > MAX_BYTES) throw new Error('Subtitle object exceeded its limit.'); parts.push(bytes) } }
      finally { signal.removeEventListener('abort', abort); body.destroy() }
      return { bytes: Buffer.concat(parts), ext: object.Metadata?.ext }
    } catch (error) { if (error instanceof Error && ['NoSuchKey', 'NotFound'].includes(error.name)) return null; throw new Error('Subtitle object storage is temporarily unavailable.') }
  }
  async function put(key: string, suffix: string, bytes: Buffer, ttlSeconds: number, ext?: string) {
    if (!keyPattern.test(key) || bytes.length > MAX_BYTES || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0) throw new Error('Invalid subtitle object.')
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: `${prefix}/${key}.${suffix}`, Body: bytes, ContentType: suffix === 'vtt' ? 'text/vtt; charset=utf-8' : 'application/octet-stream', Metadata: { expires: String(clock() + Math.min(ttlSeconds, 7 * 86400) * 1000), ...(ext ? { ext } : {}) } }), { abortSignal: AbortSignal.timeout(5000) })
  }
  return {
    async getVtt(key) { const object = await get(key, 'vtt'); const text = object?.bytes.toString('utf8'); return text?.startsWith('WEBVTT') ? text : null },
    async putVtt(key, vtt, options) { if (!vtt.startsWith('WEBVTT')) throw new Error('Use validated WebVTT.'); await put(key, 'vtt', Buffer.from(vtt), options.ttlSeconds) },
    async getOriginal(key) { const object = await get(key, 'original'); if (!object || !['srt', 'vtt', 'ass', 'ssa'].includes(object.ext ?? '')) return null; return { bytes: object.bytes, ext: object.ext as OriginalFile['ext'] } },
    async putOriginal(key, file, options) { if (!['srt', 'vtt', 'ass', 'ssa'].includes(file.ext)) throw new Error('Use a supported subtitle format.'); await put(key, 'original', file.bytes, options.ttlSeconds, file.ext) },
  }
}
