import { createMemoryAuthState } from './memory-auth-state.ts'
import { createMemoryAuthNotifier } from './memory-notifier.ts'
import { createMemoryIdentityRepository } from './memory-repository.ts'
import { createIdentity } from './service.ts'

export function createFakeIdentity(options: { clock?: () => Date } = {}) {
  const repository = createMemoryIdentityRepository()
  const clockOptions = options.clock ? { clock: options.clock } : {}
  const state = createMemoryAuthState(clockOptions)
  const notifier = createMemoryAuthNotifier()
  const identity = createIdentity({ ...clockOptions, notifier, repository, state })
  return Object.assign(identity, { notifier, repository, state })
}
