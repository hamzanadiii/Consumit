'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

import { FilScreenFooter } from '../home/filscreen-footer'
import styles from './watch-surface.module.css'

const WatchTheater = createContext<{ theater: boolean; setTheater?: (value: boolean) => void }>({ theater: false })
export const useWatchTheater = () => useContext(WatchTheater)

/** Full-viewport player canvas without the discovery page chrome. */
export function WatchPlayerSurface({ children }: { children: ReactNode }) {
  return <WatchTheater.Provider value={{ theater: true }}>{children}</WatchTheater.Provider>
}

/** Page chrome only; playback, preferences and episode identity stay with their owners. */
export function WatchSurface({ backHref, children }: {
  backHref: string
  children: ReactNode
}) {
  const [theater, setTheater] = useState(false)
  return (
    <WatchTheater.Provider value={{ theater, setTheater }}><div className={`${styles.surface}${theater ? ` ${styles.theater}` : ''}`} data-watch-theater={theater}>
      <div className={styles.container}>
        <header className={styles.header}>
          <Link aria-label="Return to title" className={styles.back} href={backHref}>
            <ArrowLeft aria-hidden="true" size={20} />
          </Link>
          <Link aria-label="Consumit home" className={styles.brand} href="/">
            <Image alt="" height={28} src="/assets/consumit-mark.svg" width={28} />
            <span>CONSUMIT</span>
          </Link>
        </header>
        {children}
      </div>
      <div className={styles.footer}><FilScreenFooter /></div>
    </div></WatchTheater.Provider>
  )
}

export function WatchDetails({ children, episode, meta, overview, title }: {
  children?: ReactNode
  episode?: string | undefined
  meta?: string | undefined
  overview?: string | null | undefined
  title: string
}) {
  return (
    <section aria-label="Title details" className={styles.details}>
      <div className={styles.detailsHeading}>
        <div className={styles.identity}>
          <h1>{title}</h1>
          {episode ? <p className={styles.episodeTitle}>{episode}</p> : null}
          {meta ? <p className={styles.metadata}>{meta}</p> : null}
        </div>
        {children ? <div className={styles.detailsActions}>{children}</div> : null}
      </div>
      {overview ? <p className={styles.synopsis}>{overview}</p> : null}
    </section>
  )
}
