import type { LetterboxdMatchStatus, LetterboxdRowKind } from '@consumit/contracts'

export type LetterboxdProfileDraft = {
  bio: string | null
  displayName: string | null
  location: string | null
}

export type LetterboxdStagedPayload = {
  listDescription?: string | null
  listName?: string | null
  position?: number | null
  rating?: number | null
  review?: string | null
  rewatch?: boolean
  tags?: string[]
  watchedOn?: string | null
}

export type LetterboxdStagedRow = {
  imdbId: string | null
  kind: LetterboxdRowKind
  matchStatus: LetterboxdMatchStatus
  normalizedTitle: string | null
  payload: LetterboxdStagedPayload
  rowNumber: number
  sourceFile: string
  sourceKey: string
  title: string | null
  tmdbId: number | null
  year: number | null
}

export type LetterboxdParseResult = {
  ignoredEntries: number
  profile: LetterboxdProfileDraft
  rows: LetterboxdStagedRow[]
  skippedRows: number
}
