import { createHash } from 'node:crypto'

import type { ConsumitId, MediaIdentity } from '@consumit/contracts'

/**
 * Consumit Identity Graph (first slice): the internal media id is permanent
 * and deterministic, while AniList / MAL ids remain mappings. A later slice
 * persists these rows in Postgres (unique constraints on each external id);
 * until then the same input always yields the same Consumit id without I/O.
 */
export function consumitIdForAnilist(anilistId: number): ConsumitId {
  const digest = createHash('sha256').update(`anilist:${anilistId}`).digest('hex').slice(0, 16)
  return `c_${digest}`
}

export function mediaIdentityForAnime(input: { anilistId: number; malId?: number | null }): MediaIdentity {
  const identity: MediaIdentity = { consumitId: consumitIdForAnilist(input.anilistId), anilistId: input.anilistId }
  if (input.malId && Number.isInteger(input.malId) && input.malId > 0) identity.malId = input.malId
  return identity
}
