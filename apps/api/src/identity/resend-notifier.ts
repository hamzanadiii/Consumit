import { z } from 'zod'

import { IdentityError } from './errors.ts'
import type { AuthNotification, AuthNotifier } from './notifier.ts'

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

const resendResponseSchema = z.object({ id: z.string().min(1) })
const requestBudgetMs = 5_000

function retryDelay(response: Response): number {
  const value = response.headers.get('retry-after')
  if (!value) return 250
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000)
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 250
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!)
}

export function createResendNotifier(options: {
  apiKey: string
  fetch?: FetchLike
  from: string
  sleep?: (milliseconds: number) => Promise<void>
}): AuthNotifier {
  const fetchImpl = options.fetch ?? fetch
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)))

  async function send(input: AuthNotification, subject: string, text: string) {
    const deadline = Date.now() + requestBudgetMs
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) break
      let response: Response
      try {
        response = await fetchImpl('https://api.resend.com/emails', {
          body: JSON.stringify({
            from: options.from,
            html: `<div style="font-family:system-ui,sans-serif"><p>${escapeHtml(text)}</p></div>`,
            subject,
            text,
            to: [input.email],
          }),
          headers: {
            'authorization': `Bearer ${options.apiKey}`,
            'content-type': 'application/json',
            'idempotency-key': input.idempotencyKey.slice(0, 256),
          },
          method: 'POST',
          signal: AbortSignal.timeout(remaining),
        })
      } catch (error) {
        if (attempt === 0 && deadline - Date.now() > 250) {
          await sleep(250)
          continue
        }
        throw new IdentityError('EMAIL_DELIVERY_UNAVAILABLE', 'Email delivery is temporarily unavailable.', { cause: error, retryable: true })
      }

      if (response.ok) {
        const parsed = resendResponseSchema.safeParse(await response.json().catch(() => null))
        if (parsed.success) return
        throw new IdentityError('EMAIL_DELIVERY_UNAVAILABLE', 'Email delivery returned an invalid response.', { retryable: true })
      }

      const retryable = response.status === 429 || response.status >= 500
      if (retryable && attempt === 0) {
        const delay = retryDelay(response)
        if (delay < deadline - Date.now()) {
          await sleep(delay)
          continue
        }
      }
      throw new IdentityError('EMAIL_DELIVERY_UNAVAILABLE', 'Email delivery is temporarily unavailable.', { retryable })
    }
    throw new IdentityError('EMAIL_DELIVERY_UNAVAILABLE', 'Email delivery timed out.', { retryable: true })
  }

  return {
    sendRecovery: (input) => send(input, 'Reset your Consumit password', `Your Consumit password reset code is ${input.code}. It expires in 10 minutes.`),
    sendRegistrationNotice: (input) => send(input, 'A Consumit account already uses this email', 'A create-account request used this address. If it was you, sign in or reset your password. Otherwise, you can ignore this email.'),
    sendVerification: (input) => send(input, 'Verify your Consumit email', `Your Consumit verification code is ${input.code}. It expires in 10 minutes.`),
  }
}
