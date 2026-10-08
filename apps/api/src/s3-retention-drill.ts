import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, GetObjectRetentionCommand, CopyObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'node:crypto'
import { readAwsCredentials } from './config/aws-credentials.ts'

const bucket = process.env.AWS_BACKUP_BUCKET
if (!bucket || bucket.includes('replace-')) throw new Error('Retention drill requires the configured real backup bucket.')
const backup = new S3Client({ region: 'ca-central-1', maxAttempts: 1, credentials: readAwsCredentials('/run/secrets/backup-aws.json') })
const recovery = new S3Client({ region: 'ca-central-1', maxAttempts: 1, credentials: readAwsCredentials('/run/secrets/recovery-aws.json') })
const key = `drills/${randomUUID()}/retention.txt`
const payload = 'Consumit isolated retention fixture; contains no member data.'
const signal = () => ({ abortSignal: AbortSignal.timeout(10000) })
try {
  const written = await backup.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: payload }), signal())
  if (!written.VersionId) throw new Error('Versioning is missing.')
  const retention = await recovery.send(new GetObjectRetentionCommand({ Bucket: bucket, Key: key, VersionId: written.VersionId }), signal())
  if (retention.Retention?.Mode !== 'GOVERNANCE' || (retention.Retention.RetainUntilDate?.getTime() ?? 0) < Date.now() + 14 * 86400000 - 300000) throw new Error('Fourteen-day Governance retention is missing.')
  await backup.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), signal())
  let hidden = false
  try { await backup.send(new GetObjectCommand({ Bucket: bucket, Key: key }), signal()) }
  catch (error) { hidden = error instanceof Error && error.name === 'NoSuchKey' }
  if (!hidden) throw new Error('Accidental current-version deletion was not simulated.')
  let denied = false
  try { await backup.send(new DeleteObjectCommand({ Bucket: bucket, Key: key, VersionId: written.VersionId, BypassGovernanceRetention: true }), signal()) }
  catch (error) { denied = error instanceof Error && error.name === 'AccessDenied' }
  if (!denied) throw new Error('Backup credentials must not delete protected object versions.')
  await recovery.send(new CopyObjectCommand({ Bucket: bucket, Key: key, CopySource: `${bucket}/${key}?versionId=${encodeURIComponent(written.VersionId)}` }), signal())
  const restored = await backup.send(new GetObjectCommand({ Bucket: bucket, Key: key }), signal())
  if (await restored.Body?.transformToString() !== payload) throw new Error('Protected-version restoration did not preserve content.')
  await backup.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), signal())
  console.log('S3 drill passed: locked version preserved, deletion denied, protected content restored. Only isolated fixture versions remain until retention expires.')
} catch {
  console.error('S3 retention drill failed. Inspect bucket configuration and least-privilege identities privately.')
  process.exitCode = 1
} finally { backup.destroy(); recovery.destroy() }
