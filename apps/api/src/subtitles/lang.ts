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
  'indonesian': 'id', 'hebrew': 'he', 'japanese': 'ja', 'greek': 'el',
  'brazilian portuguese': 'pt', 'portuguese (br)': 'pt', 'portuguese (brazil)': 'pt',
  'portuguese (pt)': 'pt',
  'chinese (simplified)': 'zh', 'chinese (traditional)': 'zh', 'chinese traditional': 'zh',
  'farsi/persian': 'fa', persian: 'fa', farsi: 'fa',
  'spanish (latin america)': 'es', 'spanish (spain)': 'es',
  'spanish (la)': 'es', 'spanish (latam)': 'es',
  filipino: 'tl',
})

/** Normalize a language NAME ("Brazilian Portuguese") to a code ("pt"). */
export function normLang(name: string): string {
  const n = name.toLowerCase().trim()
  if (/^[a-z]{2,3}$/.test(n) && LANG_NAME[n]) return n
  if (NAME_TO_CODE[n]) return NAME_TO_CODE[n]
  if (n === 'br') return 'pt'
  // BCP-47 / site variants ("es-419", "pt_BR"): fall back to the base
  // subtag instead of mislabeling as English.
  const base = n.split(/[-_]/)[0]!.trim()
  if (base && base !== n) {
    if (/^[a-z]{2,3}$/.test(base) && LANG_NAME[base]) return base
    if (NAME_TO_CODE[base]) return NAME_TO_CODE[base]
  }
  // Parenthesized variants ("Spanish (LA)", "Portuguese (BR)"): retry the
  // head before the paren. Unknown heads keep falling through below.
  const paren = n.indexOf('(')
  if (paren > 0) {
    const head = n.slice(0, paren).trim()
    if (head) {
      if (/^[a-z]{2,3}$/.test(head) && LANG_NAME[head]) return head
      if (NAME_TO_CODE[head]) return NAME_TO_CODE[head]
    }
  }
  // Unknown 2-3 letter codes pass through untouched (never mislabel as en).
  if (/^[a-z]{2,3}$/.test(n)) return n
  return 'en'
}

// Order matters: kana precedes CJK (Japanese mixes kanji + kana while
// Chinese never uses kana, so any kana occurrence decides Japanese).
const SCRIPT_TO_LANG: [RegExp, string][] = [
  [/[\u0600-\u06FF]/, 'ar'],
  [/[\u0400-\u04FF]/, 'ru'],
  [/[\u3040-\u30FF]/, 'ja'],
  [/[\uAC00-\uD7AF]/, 'ko'],
  [/[\u4E00-\u9FFF]/, 'zh'],
  [/[\u0900-\u097F]/, 'hi'],
  [/[\u0E00-\u0E7F]/, 'th'],
  [/[\u0370-\u03FF]/, 'el'],
  [/[\u0590-\u05FF]/, 'he'],
]

/** Detect a language code from native-script text. Returns null when the
 *  text is Latin-only (no script signal). Used when a track label is not a
 *  parseable language name — never default blindly to English. */
export function detectScriptLang(text: string): string | null {
  for (const [pattern, code] of SCRIPT_TO_LANG) {
    if (pattern.test(text)) return code
  }
  return null
}

/** Normalize a track label to a code, falling back to script detection when
 *  the label is not a known language name (e.g. native-script labels like
 *  "اَلْعَرَبِيَّةُ - FlowCast"). Strips a trailing " - Provider" suffix. */
export function normTrackLang(label: string): string {
  const clean = label.replace(/\s*-\s*[A-Za-z]+\s*$/, '').trim()
  const nativeName = clean.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  const nativeCodes: Record<string, string> = {
    'اردو': 'ur', 'العربية': 'ar', 'فارسی': 'fa', 'francais': 'fr',
  }
  if (nativeCodes[nativeName]) return nativeCodes[nativeName]
  // Bengali vowel marks are meaningful; accept its supplied native name
  // before the general script fallback rather than stripping its spelling.
  if (clean === 'বাংলা') return 'bn'
  const code = normLang(clean)
  if (code !== 'en' || /english/i.test(clean)) return code
  return detectScriptLang(clean) ?? 'en'
}
