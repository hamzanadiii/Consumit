'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import styles from './ad-slot.module.css'

type AdUnit = { key: string; width: number; height: number }

const AD_HOST = 'https://www.highrevenueformat.com'

const LEADERBOARD: AdUnit = { height: 90, key: '3930b97bd3841d660aa9cc7c8344216d', width: 728 }
const BANNER: AdUnit = { height: 60, key: '1f517aa3358dbd1ef55d8b2e47d06e4c', width: 468 }
const MOBILE_BANNER: AdUnit = { height: 50, key: 'ebb0ce11e95706ef527d3edb3c4df1ce', width: 320 }
const RECTANGLE: AdUnit = { height: 250, key: '0fd3e3c04a4b0bd4b92631a5b071eaf8', width: 300 }

const FILL_CHECK_MS = 500
const FILL_TIMEOUT_MS = 10_000

/** Largest configured unit that fits the slot's actual width. Never loads a
 *  unit and hides it: slots that cannot fit stay empty. */
function pickUnit(shape: 'banner' | 'rectangle', width: number): AdUnit | null {
  if (shape === 'rectangle') return width >= RECTANGLE.width ? RECTANGLE : null
  if (width >= LEADERBOARD.width) return LEADERBOARD
  if (width >= BANNER.width) return BANNER
  if (width >= MOBILE_BANNER.width) return MOBILE_BANNER
  return null
}

/** Adsterra's banner snippet runs inside its own document so each slot keeps
 *  an independent atOptions global and one slot can never corrupt another. */
function slotDocument(unit: AdUnit): string {
  // The provider inserts an inline iframe. Its baseline gap makes an exact
  // 90px/250px document overflow, adding vertical and horizontal scrollbars.
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent}iframe{display:block;border:0}</style></head><body><script>var atOptions={'key':'${unit.key}','format':'iframe','height':${unit.height},'width':${unit.width},'params':{}};<\/script><script src="${AD_HOST}/${unit.key}/invoke.js"><\/script></body></html>`
}

function slotIsLaidOut(element: HTMLElement): boolean {
  return element.offsetParent !== null
}

function slotIsFilled(frame: HTMLIFrameElement | null): boolean {
  try {
    const document = frame?.contentDocument
    const body = document?.body
    if (!body) return false
    // Provider scaffolding, tracking pixels and about:blank frames are not
    // creative evidence. Same-origin markup is inspectable; cross-origin
    // creative frames also require their containing document to settle.
    for (const node of body.querySelectorAll<HTMLImageElement>('img')) {
      if (node.complete && node.naturalWidth > 1 && node.naturalHeight > 1) return true
    }
    for (const node of body.querySelectorAll<HTMLIFrameElement>('iframe')) {
      const source = node.getAttribute('src')?.trim()
      if (!source) continue
      let url: URL
      try { url = new URL(source, document?.URL) } catch { continue }
      if (url.protocol !== 'https:') continue
      const creative = node.contentDocument
      if (!creative) {
        if (document?.readyState === 'complete') return true
        continue
      }
      if (creative.readyState !== 'complete' || !creative.body) continue
      const copy = creative.body.cloneNode(true) as HTMLElement
      for (const element of copy.querySelectorAll('script, style')) element.remove()
      if (copy.textContent?.trim()) return true
      if ([...creative.images].some(image => image.complete && image.naturalWidth > 1 && image.naturalHeight > 1)) return true
    }
    return false
  } catch {
    return false
  }
}

export function AdSlot({ placement, position = 'middle', shape = 'banner' }: {
  placement: 'home' | 'catalog' | 'detail' | 'profile' | 'watch'
  position?: 'early' | 'middle' | 'late'
  shape?: 'banner' | 'rectangle'
}) {
  const rootRef = useRef<HTMLElement | null>(null)
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const unitRef = useRef<AdUnit | null>(null)
  const [unit, setUnit] = useState<AdUnit | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [filled, setFilled] = useState(false)

  const evaluate = useCallback(() => {
    const root = rootRef.current
    if (!root) return
    const next = slotIsLaidOut(root) ? pickUnit(shape, root.clientWidth) : null
    if (unitRef.current?.key === next?.key) return
    unitRef.current = next
    setUnit(next)
    setFilled(false)
    if (next) setCollapsed(false)
  }, [shape])

  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) evaluate()
    }, { rootMargin: '600px' })
    observer.observe(root)
    return () => observer.disconnect()
  }, [evaluate])

  useEffect(() => {
    const onResize = () => evaluate()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [evaluate])

  useEffect(() => {
    if (!unit) return
    const check = window.setInterval(() => {
      if (slotIsFilled(frameRef.current)) {
        setFilled(true)
        window.clearInterval(check)
        window.clearTimeout(giveUp)
      }
    }, FILL_CHECK_MS)
    const giveUp = window.setTimeout(() => {
      window.clearInterval(check)
      if (!slotIsFilled(frameRef.current)) setCollapsed(true)
    }, FILL_TIMEOUT_MS)
    return () => {
      window.clearInterval(check)
      window.clearTimeout(giveUp)
    }
  }, [unit])

  if (collapsed) return null
  return (
    <aside aria-busy={unit ? !filled : undefined} aria-label={unit ? 'Advertisement' : undefined} className={styles.slot} data-ad-position={position} data-ad-slot={placement} ref={rootRef}>
      {unit ? (
        <>
          <p className={styles.label}>Advertisement</p>
          <div className={styles.stage} data-ad-state={filled ? 'filled' : 'pending'} style={{ height: unit.height, width: unit.width }}>
            <iframe aria-hidden={!filled} height={unit.height} loading="eager" ref={frameRef} srcDoc={slotDocument(unit)} title="Advertisement" width={unit.width} />
          </div>
        </>
      ) : null}
    </aside>
  )
}
