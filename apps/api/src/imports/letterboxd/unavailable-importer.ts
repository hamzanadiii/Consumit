import { LetterboxdImportError } from './errors.ts'
import type { LetterboxdImporter } from './importer.ts'

function unavailable(): never {
  throw new LetterboxdImportError('IMPORT_UNAVAILABLE', 'Letterboxd import is not configured on this server.', { retryable: true })
}

export const unavailableLetterboxdImporter: LetterboxdImporter = {
  confirm: async () => unavailable(),
  detail: async () => unavailable(),
  discard: async () => unavailable(),
  history: async () => unavailable(),
  removeImportedData: async () => unavailable(),
  retry: async () => unavailable(),
  select: async () => unavailable(),
  upload: async () => unavailable(),
}
