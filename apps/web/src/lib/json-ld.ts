const jsonLdEscapes: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
}

/** Safely serialize externally sourced structured data for an inline script. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/[<>\u2028\u2029]/g, (character) => jsonLdEscapes[character]!)
}
