import { experienceResponseSchema, type ExperiencePatch } from '@consumit/contracts'

export async function experienceRequest(signal: AbortSignal, patch?: ExperiencePatch) {
  const response = await fetch('/v1/me/experience-preferences', {
    method: patch ? 'PATCH' : 'GET', credentials: 'same-origin', cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(patch ? 8000 : 2000)]),
    headers: { accept: 'application/json', ...(patch ? { 'content-type': 'application/json' } : {}) },
    ...(patch ? { body: JSON.stringify(patch) } : {}),
  })
  if (!response.ok) throw new Error('Your preferences could not sync. Try again.')
  return experienceResponseSchema.parse(await response.json())
}
