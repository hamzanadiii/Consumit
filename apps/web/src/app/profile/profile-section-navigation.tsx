'use client'

import { useEffect, useState } from 'react'

const sections = ['Overview', 'Favorites', 'Diary', 'Reviews', 'Lists'] as const

export function ProfileSectionNavigation({ name }: { name: string }) {
  const [active, setActive] = useState('overview')

  useEffect(() => {
    const sync = () => setActive(window.location.hash.slice(1) || 'overview')
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  return (
    <nav aria-label={`${name} profile sections`} className="consumit-profile-sections px-5 sm:px-8 lg:px-[50px]">
      {sections.map((label) => {
        const id = label.toLowerCase()
        return <a aria-current={active === id ? 'location' : undefined} href={`#${id}`} key={id}>{label}</a>
      })}
    </nav>
  )
}
