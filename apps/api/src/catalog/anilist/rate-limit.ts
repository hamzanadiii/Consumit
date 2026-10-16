export type AnilistRateLimiter = {
  acquire(): Promise<void>
  remaining(): number
  reset(): void
}

export function createAnilistRateLimiter(requestsPerMinute = 90): AnilistRateLimiter {
  const capacity = Math.max(1, requestsPerMinute)
  const tokensPerMs = capacity / 60_000
  let tokens = capacity
  let updatedAt = Date.now()
  let queue = Promise.resolve()

  const replenish = (now: number) => {
    tokens = Math.min(capacity, tokens + (now - updatedAt) * tokensPerMs)
    updatedAt = now
  }

  const waitForToken = async () => {
    replenish(Date.now())
    if (tokens >= 1) {
      tokens -= 1
      return
    }

    const waitMs = Math.ceil((1 - tokens) / tokensPerMs)
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    replenish(Date.now())
    tokens = Math.max(0, tokens - 1)
  }

  return {
    async acquire() {
      const next = queue.then(waitForToken, waitForToken)
      queue = next.then(() => undefined, () => undefined)
      await next
    },
    remaining() {
      replenish(Date.now())
      return Math.floor(Math.max(0, tokens))
    },
    reset() {
      tokens = capacity
      updatedAt = Date.now()
      queue = Promise.resolve()
    },
  }
}
