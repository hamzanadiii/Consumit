'use client'

import { useState } from 'react'
import { Button } from '@consumit/ui'
import { ArrowUpRight, X } from 'lucide-react'
import { communityLinks } from '@/lib/community'
import { useExperience } from './experience-provider'
import styles from './community-cards.module.css'

function CommunityMark({ name }: { name: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className={styles.mark}>
    {name === 'Discord' ? <path d="M20.3 4.4a19.6 19.6 0 0 0-4.9-1.5l-.6 1.2a18.1 18.1 0 0 0-5.5 0l-.6-1.2a19.4 19.4 0 0 0-4.9 1.5C.7 9 .1 13.5.4 18a19.7 19.7 0 0 0 6 3l1.2-2a12.7 12.7 0 0 1-1.9-.9l.5-.4a14 14 0 0 0 11.6 0l.5.4-1.9.9 1.2 2a19.6 19.6 0 0 0 6-3c.4-5.3-.9-9.8-3.3-13.6ZM8.2 15.2c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Zm7.6 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Z" /> : <>
      <path d="m12.5 9 1.3-5.5 4.1.9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="19.5" cy="4.5" r="2" />
      <circle cx="3.4" cy="12" r="2.4" /><circle cx="20.6" cy="12" r="2.4" />
      <ellipse cx="12" cy="14.5" rx="9" ry="6.5" />
      <g fill="var(--community-mark-surface)"><circle cx="8.2" cy="13.7" r="1.3" /><circle cx="15.8" cy="13.7" r="1.3" /></g>
      <path d="M8.3 17.3c1.7 1.5 5.7 1.5 7.4 0" fill="none" stroke="var(--community-mark-surface)" strokeWidth="1.3" strokeLinecap="round" />
    </>}
  </svg>
}

export function CommunityCards({ dismissible = false }: { dismissible?: boolean }) {
  const experience = useExperience()
  const [error, setError] = useState(false)
  if (!communityLinks.some(link => link.href) || (dismissible && (!experience.ready || experience.preferences.communityDismissed && !error))) return null
  async function dismiss() { try { await experience.patch({ communityDismissed: true }); setError(false) } catch { setError(true) } }
  return <section className={styles.community} aria-labelledby="community-heading">
    {dismissible ? <Button variant="ghost" size="sm" className={styles.dismiss} onClick={() => void dismiss()}><X aria-hidden="true" />{error ? 'Retry dismissal' : 'Hide community cards'}</Button> : null}
    <div className={styles.layout}>
      <div className={styles.intro}>
        <h2 className={styles.heading} id="community-heading">Watch. Discover.<br /><span>Talk about it.</span></h2>
        <p className={styles.description}>Come share a recommendation or tell us what would make Consumit better.</p>
        <p className={styles.optional}>Joining is optional.</p>
      </div>
      <div className={styles.cards}>{communityLinks.map(link => link.href ? <a className={`${styles.card} ${link.name === 'Reddit' ? styles.reddit : ''}`} href={link.href} key={link.name} target="_blank" rel="noopener noreferrer">
        <div className={styles.platform}><span className={styles.markFrame}><CommunityMark name={link.name} /></span><h3>{link.name}</h3></div>
        <p className={styles.cardDescription}>{link.description}</p>
        <div className={styles.cardFooter}><span className={styles.join}>Join us on {link.name}<ArrowUpRight aria-hidden="true" className={styles.arrow} /></span><span className={styles.newTab}>Opens {link.name} in a new tab</span></div>
      </a> : null)}</div>
    </div>
    {error ? <p role="alert" className="mt-3 text-sm">Your dismissal could not sync. Retry to hide these cards across devices.</p> : null}
  </section>
}
