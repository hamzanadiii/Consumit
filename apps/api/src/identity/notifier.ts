export type AuthNotification = {
  code?: string
  email: string
  idempotencyKey: string
}

export interface AuthNotifier {
  sendRecovery(input: AuthNotification & { code: string }): Promise<void>
  sendRegistrationNotice(input: AuthNotification): Promise<void>
  sendVerification(input: AuthNotification & { code: string }): Promise<void>
}
