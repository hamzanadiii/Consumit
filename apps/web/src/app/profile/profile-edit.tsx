'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import { Button } from '@consumit/ui'

type ProfileEditState = {
  bannerOpen: boolean
  favoritesOpen: boolean
  setBannerOpen(open: boolean): void
  setFavoritesOpen(open: boolean): void
}

const ProfileEditContext = createContext<ProfileEditState>({
  bannerOpen: false,
  favoritesOpen: false,
  setBannerOpen() {},
  setFavoritesOpen() {},
})

export function ProfileEditProvider({ children, initialBannerOpen = false, initialFavoritesOpen = false }: {
  children: ReactNode
  initialBannerOpen?: boolean | undefined
  initialFavoritesOpen?: boolean | undefined
}) {
  const [bannerOpen, setBannerOpen] = useState(initialBannerOpen)
  const [favoritesOpen, setFavoritesOpen] = useState(initialFavoritesOpen)
  const value = useMemo(() => ({
    bannerOpen,
    favoritesOpen,
    setBannerOpen,
    setFavoritesOpen,
  }), [bannerOpen, favoritesOpen])
  return <ProfileEditContext.Provider value={value}>{children}</ProfileEditContext.Provider>
}

export function useProfileEdit() {
  return useContext(ProfileEditContext)
}

export function EditBannerButton() {
  const { bannerOpen, setBannerOpen } = useProfileEdit()
  const open = useCallback(() => setBannerOpen(true), [setBannerOpen])
  if (bannerOpen) return null
  return (
    <Button onClick={open} variant="secondary">
      Edit banner
    </Button>
  )
}

export function EditFavoritesButton() {
  const { favoritesOpen, setFavoritesOpen } = useProfileEdit()
  const open = useCallback(() => setFavoritesOpen(true), [setFavoritesOpen])
  if (favoritesOpen) return null
  return (
    <Button onClick={open} variant="secondary">
      Edit favorites
    </Button>
  )
}
