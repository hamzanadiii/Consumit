import { providerResultSchema, type ProviderAdapter, type ProviderInput, type ProviderResult } from '../index.ts'

/**
 * Shared adapter test entry point. It checks the public result contract and
 * rejects malformed or credential-bearing source URLs for both fixture and
 * production adapters.
 */
export async function resolveConformant(
  provider: ProviderAdapter,
  input: ProviderInput,
  signal: AbortSignal,
): Promise<ProviderResult> {
  const result = await provider.resolve(input, signal)
  const parsed = providerResultSchema.safeParse(result)
  if (!parsed.success) throw new Error(`Provider ${provider.id} returned a non-conformant result`)
  if (parsed.data.ok) {
    if (!parsed.data.sources.length) throw new Error(`Provider ${provider.id} returned an empty success`)
    for (const source of parsed.data.sources) {
      const url = new URL(source.url)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new Error(`Provider ${provider.id} returned an unsafe source URL`)
      }
    }
  }
  return parsed.data
}
