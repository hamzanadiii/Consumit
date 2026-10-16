import { describeIdentityContract } from './contract-suite.ts'
import { createFakeIdentity } from './fake-identity.ts'

describeIdentityContract('memory repository', async () => {
  const identity = createFakeIdentity()
  return {
    cleanup: async () => {},
    identity,
    notifier: identity.notifier,
    repository: identity.repository,
    state: identity.state,
  }
})
