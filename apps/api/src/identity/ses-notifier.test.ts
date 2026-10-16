import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSesNotifier, type SesTransport } from './ses-notifier.ts'

const notification = { email: 'fixture@example.test', code: '123456', idempotencyKey: 'fixture' }
const options = { from: 'auth@consumit.online', region: 'ca-central-1', configurationSet: 'consumit-auth' }
afterEach(() => vi.useRealTimers())
describe('SES authentication notifications', () => {
  it('sends the existing code and expiry without using recipient data as tags', async () => {
    const transport = vi.fn<SesTransport>().mockResolvedValue({ MessageId: 'delivered' })
    await createSesNotifier({ ...options, transport }).sendVerification(notification)
    const input = transport.mock.calls[0]![0]
    expect(input.Destination).toEqual({ ToAddresses: [notification.email] })
    expect(input.Content?.Simple?.Body?.Text?.Data).toContain('123456. It expires in 10 minutes.')
    expect(input.EmailTags).toBeUndefined()
    expect(input.ConfigurationSetName).toBe('consumit-auth')
  })
  it.each(['TooManyRequestsException', 'MessageRejected', 'BadRequestException', 'TimeoutError'])('contains %s and never retries an ambiguous send', async name => {
    const upstream = new Error('private recipient fixture@example.test code 123456')
    upstream.name = name
    const transport = vi.fn<SesTransport>().mockRejectedValue(upstream)
    const result = createSesNotifier({ ...options, transport }).sendRecovery(notification)
    await expect(result).rejects.toMatchObject({ code: 'EMAIL_DELIVERY_UNAVAILABLE', cause: undefined })
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it('bounds even a client that ignores cancellation to five seconds', async () => {
    vi.useFakeTimers()
    const transport = vi.fn<SesTransport>().mockImplementation(() => new Promise(() => {}))
    const result = createSesNotifier({ ...options, transport }).sendVerification(notification)
    const rejection = expect(result).rejects.toMatchObject({ code: 'EMAIL_DELIVERY_UNAVAILABLE' })
    await vi.advanceTimersByTimeAsync(5000)
    await rejection
    expect(transport.mock.calls[0]![1].aborted).toBe(true)
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it('rejects a response without a message ID', async () => {
    await expect(createSesNotifier({ ...options, transport: async () => ({}) }).sendRegistrationNotice(notification)).rejects.toMatchObject({ code: 'EMAIL_DELIVERY_UNAVAILABLE' })
  })
})
