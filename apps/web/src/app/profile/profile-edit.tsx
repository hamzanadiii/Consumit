'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import { Button } from '@consumit/ui'

type ProfileEditState = {
  bannerOpen: boolean
  setBannerOpen(open: boolean): void
}

const ProfileEditContext = createContext<ProfileEditState>({
  bannerOpen: false,
  setBannerOpen() {},
})

export function ProfileEditProvider({ children, initialBannerOpen = false }: {
  children: ReactNode
  initialBannerOpen?: boolean | undefined
}) {
  const [bannerOpen, setBannerOpen] = useState(initialBannerOpen)
  const value = useMemo(() => ({
    bannerOpen,
    setBannerOpen,
  }), [bannerOpen])
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
