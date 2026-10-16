'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import styles from './ad-slot.module.css'

type AdUnit = { key: string; width: number; height: number }

const AD_HOST = 'https://www.highrevenueformat.com'

const LEADERBOARD: AdUnit = { height: 90, key: '3930b97bd3841d660aa9cc7c8344216d', width: 728 }
const BANNER: AdUnit = { height: 60, key: '1f517aa3358dbd1ef55d8b2e47d06e4c', width: 468 }
const MOBILE_BANNER: AdUnit = { height: 50, key: 'ebb0ce11e95706ef527d3edb3c4df1ce', width: 320 }
const RECTANGLE: AdUnit = { height: 250, key: '0fd3e3c04a4b0bd4b92631a5b071eaf8', width: 300 }

const FILL_SETTLE_MS = 2_000
const FILL_TIMEOUT_MS = 10_000

/** The ad iframe is sandboxed without allow-same-origin, so its document gets
 *  an opaque origin: the creative can never read or write Consumit DOM,
 *  storage, or credentialed same-origin requests. Popups and forms stay
 *  enabled for click-throughs. */
const AD_FRAME_SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms'

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

export function AdSlot({ placement, position = 'middle', shape = 'banner' }: {
  placement: 'home' | 'catalog' | 'detail' | 'profile' | 'watch'
  position?: 'early' | 'middle' | 'late'
  shape?: 'banner' | 'rectangle'
}) {
  const rootRef = useRef<HTMLElement | null>(null)
  const unitRef = useRef<AdUnit | null>(null)
  const [unit, setUnit] = useState<AdUnit | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [filled, setFilled] = useState(false)

  const evaluate = useCallback(() => {
    const root = rootRef.current
    if (!root) return
    const next = slotIsLaidOut(root) ? pickUnit(shape, root.clientWidth) : null
    if (unitRef.current?.key === next?.key) return
    unitRef.current = next
    setUnit(next)
    if (next) {
      setCollapsed(false)
      setLoaded(false)
      setFilled(false)
    }
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

  // The sandboxed frame is cross-origin, so fill cannot be detected by reading
  // its document. Collapse only when the frame never finishes loading; once
  // loaded, wait a short settle window for the creative to paint, then show.
  useEffect(() => {
    if (!unit) return
    if (!loaded) {
      const giveUp = window.setTimeout(() => setCollapsed(true), FILL_TIMEOUT_MS)
      return () => window.clearTimeout(giveUp)
    }
    const settle = window.setTimeout(() => setFilled(true), FILL_SETTLE_MS)
    return () => window.clearTimeout(settle)
  }, [unit, loaded])

  if (collapsed) return null
  return (
    <aside aria-label={unit ? 'Advertisement' : undefined} className={styles.slot} data-ad-position={position} data-ad-slot={placement} ref={rootRef}>
      {unit ? (
        <>
          <p className={styles.label}>Advertisement</p>
          <div className={styles.stage} style={{ height: unit.height, visibility: filled ? 'visible' : 'hidden', width: unit.width }}>
            <iframe
              height={unit.height}
              loading="lazy"
              onLoad={() => setLoaded(true)}
              sandbox={AD_FRAME_SANDBOX}
              srcDoc={slotDocument(unit)}
              title="Advertisement"
              width={unit.width}
            />
          </div>
        </>
      ) : null}
    </aside>
  )
}
