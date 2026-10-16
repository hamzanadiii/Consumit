import type {
  MemberExport,
  MemberProfile,
  LoginRequest,
  PasswordChangeRequest,
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

/** The external identity seam. Routes never see persistence or provider details. */
export interface Identity {
  changePassword(sessionToken: string, input: PasswordChangeRequest): Promise<AuthenticatedMember>
  deleteAccount(sessionToken: string, password: string): Promise<void>
  exportMember(sessionToken: string): Promise<MemberExport>
  getOwnProfile(sessionToken: string): Promise<MemberProfile>
  getProfile(username: string, sessionToken?: string): Promise<{ canonicalUsername: string; profile: MemberProfile }>
  getSession(sessionToken: string): Promise<SafeMember | null>
  login(input: LoginRequest): Promise<AuthenticatedMember>
  logout(sessionToken: string): Promise<void>
  logoutAll(sessionToken: string): Promise<void>
  recoverPassword(input: RecoveryConfirmRequest): Promise<void>
  register(input: RegisterRequest): Promise<void>
  requestRecovery(email: string): Promise<void>
  requestVerification(email: string): Promise<void>
  updateProfile(sessionToken: string, input: UpdateProfileRequest): Promise<MemberProfile>
  usernameAvailability(username: string): Promise<UsernameAvailabilityResponse>
  verifyEmail(input: VerifyEmailRequest): Promise<AuthenticatedMember>
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}
