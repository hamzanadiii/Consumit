import { IdentityError } from './errors.ts'
import type { Identity } from './identity.ts'

function unavailable(): never {
  throw new IdentityError('IDENTITY_NOT_CONFIGURED', 'Sign-in is not configured on this server.')
}

export const unavailableIdentity: Identity = {
  changePassword: async () => unavailable(),
  completePasswordRecovery: async () => unavailable(),
  deleteAccount: async () => unavailable(),
  exportMember: async () => unavailable(),
  getOwnProfile: async () => unavailable(),
  getProfile: async () => unavailable(),
  getSession: async () => unavailable(),
  loginWithGoogle: async () => unavailable(),
  login: async () => unavailable(),
  logout: async () => {},
  logoutAll: async () => unavailable(),
  recoverPassword: async () => unavailable(),
  register: async () => unavailable(),
  registerWithGoogle: async () => unavailable(),
  requestRecovery: async () => unavailable(),
  requestVerification: async () => unavailable(),
  updateProfile: async () => unavailable(),
  usernameAvailability: async () => unavailable(),
  verifyRecoveryCode: async () => unavailable(),
  verifyEmail: async () => unavailable(),
}
