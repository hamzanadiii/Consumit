import type {
  MemberExport,
  MemberProfile,
  LoginRequest,
  PasswordChangeRequest,
  RecoveryCompleteRequest,
  RecoveryConfirmRequest,
  RegisterRequest,
  SafeMember,
  UpdateProfileRequest,
  UsernameAvailabilityResponse,
  VerifyEmailRequest,
} from '@consumit/contracts'

export type AuthenticatedMember = {
  member: SafeMember
  sessionToken: string
}

export type GoogleIdentityInput = {
  email: string
  emailAuthoritative: boolean
  googleSubject: string
  name: string | null
}

export type GoogleSignupResult =
  | { authenticated: AuthenticatedMember; kind: 'complete' }
  | { kind: 'verification-required' }

/** The external identity seam. Routes never see persistence or provider details. */
export interface Identity {
  changePassword(sessionToken: string, input: PasswordChangeRequest): Promise<AuthenticatedMember>
  deleteAccount(sessionToken: string, password: string): Promise<void>
  exportMember(sessionToken: string): Promise<MemberExport>
  getOwnProfile(sessionToken: string): Promise<MemberProfile>
  getProfile(username: string, sessionToken?: string): Promise<{ canonicalUsername: string; profile: MemberProfile }>
  getSession(sessionToken: string): Promise<SafeMember | null>
  loginWithGoogle(input: GoogleIdentityInput): Promise<AuthenticatedMember | null>
  login(input: LoginRequest): Promise<AuthenticatedMember>
  logout(sessionToken: string): Promise<void>
  logoutAll(sessionToken: string): Promise<void>
  recoverPassword(input: RecoveryConfirmRequest): Promise<void>
  verifyRecoveryCode(input: VerifyEmailRequest): Promise<string>
  completePasswordRecovery(input: RecoveryCompleteRequest & { recoveryToken: string }): Promise<void>
  register(input: RegisterRequest): Promise<void>
  registerWithGoogle(input: GoogleIdentityInput & { displayName?: string | null; username: string }): Promise<GoogleSignupResult>
  requestRecovery(email: string): Promise<void>
  requestVerification(email: string): Promise<void>
  updateProfile(sessionToken: string, input: UpdateProfileRequest): Promise<MemberProfile>
  usernameAvailability(username: string): Promise<UsernameAvailabilityResponse>
  verifyEmail(input: VerifyEmailRequest): Promise<AuthenticatedMember>
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}
