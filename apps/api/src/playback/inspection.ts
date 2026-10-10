import { validatedSources, type ProviderInput, type ProviderRegistration } from '@consumit/provider-sdk'
import type { PlaybackStore } from './state.ts'
import { acquireProviderBudget } from './provider-budget.ts'

/** The common adapter boundary for isolated Admin and release checks. */
export async function inspectProviderSources(provider: ProviderRegistration, input: ProviderInput, signal: AbortSignal, store: PlaybackStore) {
  signal.throwIfAborted()
  const release = await acquireProviderBudget(provider, input.region, store)
  if (!release) throw new Error('Provider request budget is busy.')
  let aborted: (() => void) | undefined
  try {
    const result = await Promise.race([
      provider.adapter.resolve(input, signal),
      new Promise<never>((_, reject) => { aborted = () => reject(new Error('Inspection cancelled')); signal.addEventListener('abort', aborted, { once: true }); if (signal.aborted) aborted() }),
    ])
    return { result, sources: result.ok ? validatedSources(result, provider, Date.now()) : [] }
  } finally { if (aborted) signal.removeEventListener('abort', aborted); await release().catch(() => undefined) }
}
