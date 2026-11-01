export const SUBTITLE_POLICY_VERSION = 6
export const SUBTITLE_RESERVE_LIMIT = 300

/** Regional labels are retained; only their menu group is canonicalized. */
export function primarySubtitleLanguage(language: string): string {
  const code = language.trim().toLowerCase().replace(/_/g, '-').split('-')[0] ?? 'und'
  return ({ eng: 'en', fre: 'fr', fra: 'fr', ara: 'ar', por: 'pt', spa: 'es', jpn: 'ja', chi: 'zh', zho: 'zh', ger: 'de', deu: 'de' } as Record<string, string>)[code] ?? code
}


