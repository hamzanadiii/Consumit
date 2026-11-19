/** Coalesce identical overlapping writes. Lifecycle writes retain their own
 * keepalive request so a pending ordinary fetch cannot weaken exit durability. */
export function createProgressWriteCoordinator() {
  const pending = new Map<string, Promise<void>>()
  return {
    write(key: string, keepalive: boolean, operation: () => Promise<void>): Promise<void> {
      const scope = `${keepalive ? 'exit' : 'ordinary'}:${key}`
      const previous = pending.get(scope)
      if (previous) return previous
      const work = Promise.resolve().then(operation).finally(() => pending.delete(scope))
      pending.set(scope, work)
      return work
    },
  }
}
