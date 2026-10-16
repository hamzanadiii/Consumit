import type { ResolvePlaybackRequest } from '@consumit/contracts'
import type { ProviderRegistration, ProviderSource } from '@consumit/provider-sdk'

function language(value: string) {
  const base = value.toLowerCase().split('-')[0]
  return base === 'eng' ? 'en' : base === 'jpn' ? 'ja' : base
}

export function supportsRequestedAudio(provider: ProviderRegistration, input: ResolvePlaybackRequest) {
  return input.ref.kind !== 'anime' || !provider.adapter.audioLanguages
    || provider.adapter.audioLanguages.some(value => language(value) === language(input.audioLanguage))
}

export function matchesRequestedAudio(source: ProviderSource, input: ResolvePlaybackRequest) {
  if (input.ref.kind !== 'anime') return true
  const requested = language(input.audioLanguage)
  const actual = language(source.language)
  return actual === requested || (requested === 'ja' && actual === 'original')
}
