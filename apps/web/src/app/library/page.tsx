import type { Metadata } from 'next'

import { LibraryScreen } from './library-screen'

export const metadata: Metadata = {
  title: 'My Library · Consumit',
  description: 'Your saved titles, favorites, lists, and watch history.',
}

export default function LibraryPage() {
  return <LibraryScreen />
}
