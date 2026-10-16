import { SESv2Client, SendEmailCommand, type SendEmailCommandInput } from '@aws-sdk/client-sesv2'
import { metrics } from '@opentelemetry/api'
import { IdentityError } from './errors.ts'
import type { AuthNotification, AuthNotifier } from './notifier.ts'

const deliveries = metrics.getMeter('consumit-email').createCounter('consumit.email.deliveries', {
  description: 'Authentication email outcomes; no recipient or code dimensions.',
})
export type SesTransport = (input: SendEmailCommandInput, signal: AbortSignal) => Promise<{ MessageId?: string | undefined }>

/** SES has no send idempotency key. An ambiguous timeout must never retry. */
export function createSesNotifier(options: {
  from: string
  region: string
  configurationSet: string
  credentials?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string }
  transport?: SesTransport
}): AuthNotifier & { close(): void } {
  const client = options.transport ? undefined : new SESv2Client({
    region: options.region, maxAttempts: 1,
    ...(options.credentials ? { credentials: options.credentials } : {}),
  })
  const transport: SesTransport = options.transport ?? ((input, signal) => client!.send(new SendEmailCommand(input), { abortSignal: signal }))
  async function send(notification: AuthNotification, subject: string, text: string) {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let outcome = 'failed'
    try {
      const result = await Promise.race([
        transport({
          FromEmailAddress: options.from,
          Destination: { ToAddresses: [notification.email] },
          ConfigurationSetName: options.configurationSet,
          Content: { Simple: { Subject: { Data: subject, Charset: 'UTF-8' }, Body: { Text: { Data: text, Charset: 'UTF-8' } } } },
        }, controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { outcome = 'timeout'; controller.abort(); reject(new Error('deadline')) }, 5_000)
        }),
      ])
      if (!result.MessageId) throw new Error('invalid response')
      outcome = 'sent'
    } catch (error) {
      // Upstream errors can contain addresses. Keep only a bounded category.
      const name = error instanceof Error ? error.name : ''
      if (name === 'TooManyRequestsException') outcome = 'throttled'
      if (['MessageRejected', 'MessageRejectedException', 'BadRequestException'].includes(name)) outcome = 'rejected'
      throw new IdentityError('EMAIL_DELIVERY_UNAVAILABLE', 'Email delivery is temporarily unavailable.', { retryable: true })
    } finally {
      clearTimeout(timer)
      deliveries.add(1, { provider: 'ses', outcome })
    }
  }
  return {
    close: () => client?.destroy(),
    sendVerification: input => send(input, 'Verify your Consumit email', `Your Consumit verification code is ${input.code}. It expires in 10 minutes.`),
    sendRecovery: input => send(input, 'Reset your Consumit password', `Your Consumit password reset code is ${input.code}. It expires in 10 minutes.`),
    sendRegistrationNotice: input => send(input, 'A Consumit account already uses this email', 'A create-account request used this address. If it was you, sign in or reset your password. Otherwise, you can ignore this email.'),
  }
}
