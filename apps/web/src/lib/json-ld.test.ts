import { describe, expect, it } from 'vitest'

import { serializeJsonLd } from './json-ld'

describe('serializeJsonLd', () => {
  it('keeps untrusted data from closing the inline JSON-LD script', () => {
    const result = serializeJsonLd({ title: '</script><script>alert(1)</script>' })

    expect(result).not.toContain('</script>')
    expect(result).toContain('\\u003c/script\\u003e')
    expect(JSON.parse(result)).toEqual({ title: '</script><script>alert(1)</script>' })
  })
})
