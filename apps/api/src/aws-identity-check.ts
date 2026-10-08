import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import { readAwsCredentials } from './config/aws-credentials.ts'

const roles = [['ses', 'consumit-email'], ['backup', 'consumit-backup'], ['feedback', 'consumit-feedback'], ['credit', 'consumit-credit-monitor']] as const
const keys = new Set<string>()
const accounts = new Set<string>()
try {
  for (const [file, user] of roles) {
    const credentials = readAwsCredentials(`/run/secrets/${file}-aws.json`)
    if (keys.has(credentials.accessKeyId)) throw new Error('Service credentials must be separate.')
    keys.add(credentials.accessKeyId)
    const client = new STSClient({ region: 'ca-central-1', maxAttempts: 1, credentials })
    try {
      const identity = await client.send(new GetCallerIdentityCommand({}), { abortSignal: AbortSignal.timeout(5000) })
      if (!identity.Arn?.endsWith(`:user/${user}`) || !identity.Account) throw new Error('Credential identity does not match its least-privilege user.')
      accounts.add(identity.Account)
    } finally { client.destroy() }
  }
  if (accounts.size !== 1) throw new Error('The approved resources must use the verified account.')
  console.log('Separate email, backup, feedback and monitoring identities verified; account and key details withheld.')
} catch {
  console.error('AWS identity verification failed; check the private least-privilege credential mapping.')
  process.exitCode = 1
}
