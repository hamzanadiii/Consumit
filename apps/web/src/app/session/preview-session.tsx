'use client'

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react'

const previewSessionKey = 'consumit.preview-session'
const previewSessionEvent = 'consumit:preview-session-change'

type PreviewSession = {
  signIn: () => void
  signOut: () => void
  signedIn: boolean
}

const PreviewSessionContext = createContext<PreviewSession | null>(null)

function subscribeToPreviewSession(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange)
  window.addEventListener(previewSessionEvent, onStoreChange)

  return () => {
    window.removeEventListener('storage', onStoreChange)
    window.removeEventListener(previewSessionEvent, onStoreChange)
  }
}

function getPreviewSessionSnapshot() {
  return window.localStorage.getItem(previewSessionKey) === 'signed-in'
}

function getPreviewSessionServerSnapshot() {
  return false
}

export function PreviewSessionProvider({ children }: { children: ReactNode }) {
  const signedIn = useSyncExternalStore(
    subscribeToPreviewSession,
    getPreviewSessionSnapshot,
    getPreviewSessionServerSnapshot,
  )

  const updateSession = useCallback((nextSignedIn: boolean) => {
    if (nextSignedIn) {
      window.localStorage.setItem(previewSessionKey, 'signed-in')
    } else {
      window.localStorage.removeItem(previewSessionKey)
    }
    window.dispatchEvent(new Event(previewSessionEvent))
  }, [])

  const value = useMemo<PreviewSession>(
    () => ({
      signIn: () => updateSession(true),
      signOut: () => updateSession(false),
      signedIn,
    }),
    [signedIn, updateSession],
  )

  return (
    <PreviewSessionContext.Provider value={value}>
      {children}
    </PreviewSessionContext.Provider>
  )
}

export function usePreviewSession() {
  const session = useContext(PreviewSessionContext)

  if (!session) {
    throw new Error('usePreviewSession must be used inside PreviewSessionProvider.')
  }

  return session
}
