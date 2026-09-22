/** Language name/code tables ported from the PROVE subtitle engine. Upstream
 *  subtitle sources label tracks with display names ("Brazilian Portuguese"),
 *  short codes, or site-specific aliases — all normalize to ISO-ish codes. */

const LANG_NAME: Record<string, string> = {
  en: 'English', fr: 'French', es: 'Spanish', de: 'German', it: 'Italian', pt: 'Portuguese',
  ru: 'Russian', ar: 'Arabic', hi: 'Hindi', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
  nl: 'Dutch', pl: 'Polish', tr: 'Turkish', uk: 'Ukrainian', fa: 'Persian', he: 'Hebrew',
  th: 'Thai', vi: 'Vietnamese', id: 'Indonesian', ms: 'Malay', ro: 'Romanian', el: 'Greek',
  hu: 'Hungarian', cs: 'Czech', da: 'Danish', fi: 'Finnish', no: 'Norwegian', sv: 'Swedish',
  bn: 'Bengali', bg: 'Bulgarian', hr: 'Croatian', sr: 'Serbian', bs: 'Bosnian',
  sk: 'Slovak', sl: 'Slovenian', et: 'Estonian', lv: 'Latvian', lt: 'Lithuanian',
  is: 'Icelandic', mk: 'Macedonian', ca: 'Catalan', eu: 'Basque', gl: 'Galician',
  cy: 'Welsh', ur: 'Urdu', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', pa: 'Punjabi',
  mr: 'Marathi', gu: 'Gujarati', km: 'Khmer', my: 'Burmese', tt: 'Tatar', ug: 'Uyghur',
  uz: 'Uzbek', yi: 'Yiddish', ig: 'Igbo', jv: 'Javanese', lo: 'Lao', su: 'Sundanese',
  xh: 'Xhosa', si: 'Sinhala', ka: 'Georgian', hy: 'Armenian', az: 'Azerbaijani', kk: 'Kazakh',
  ku: 'Kurdish', ps: 'Pashto', ne: 'Nepali', sw: 'Swahili', tl: 'Tagalog',
  af: 'Afrikaans', sq: 'Albanian', am: 'Amharic', ha: 'Hausa', yo: 'Yoruba', zu: 'Zulu',
  eo: 'Esperanto', la: 'Latin', mt: 'Maltese', mn: 'Mongolian', so: 'Somali',
  iw: 'Hebrew', in: 'Indonesian', ji: 'Japanese', gr: 'Greek',
}

export function langLabel(code: string): string {
  return LANG_NAME[code.toLowerCase()] || code.toUpperCase()
}

const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(LANG_NAME).map(([code, name]) => [name.toLowerCase(), code]),
)
Object.assign(NAME_TO_CODE, {
  'brazilian portuguese': 'pt', 'portuguese (br)': 'pt', 'portuguese (brazil)': 'pt',
  'chinese (simplified)': 'zh', 'chinese (traditional)': 'zh', 'chinese traditional': 'zh',
  'farsi/persian': 'fa', persian: 'fa', farsi: 'fa',
  'spanish (latin america)': 'es', 'spanish (spain)': 'es',
  filipino: 'tl',
})

/** Normalize a language NAME ("Brazilian Portuguese") to a code ("pt"). */
export function normLang(name: string): string {
  const n = name.toLowerCase().trim()
  if (/^[a-z]{2,3}$/.test(n) && LANG_NAME[n]) return n
  if (NAME_TO_CODE[n]) return NAME_TO_CODE[n]
  if (n === 'br') return 'pt'
  // Unknown 2-3 letter codes pass through untouched (never mislabel as en).
  if (/^[a-z]{2,3}$/.test(n)) return n
  return 'en'
}
