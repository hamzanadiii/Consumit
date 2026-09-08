import type { AuthNotification, AuthNotifier } from './notifier.ts'

export type DeliveredAuthNotification = AuthNotification & { kind: 'recovery' | 'registration-notice' | 'verification' }

export function createMemoryAuthNotifier(): AuthNotifier & { deliveries: DeliveredAuthNotification[] } {
  const deliveries: DeliveredAuthNotification[] = []
  return {
    deliveries,
    async sendRecovery(input) {
      deliveries.push({ ...input, kind: 'recovery' })
    },
    async sendRegistrationNotice(input) {
      deliveries.push({ ...input, kind: 'registration-notice' })
    },
    async sendVerification(input) {
      deliveries.push({ ...input, kind: 'verification' })
    },
  }
}
