import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultExperiencePreferences, type ExperienceResponse } from '@consumit/contracts'
import { ExperienceProvider, useExperience } from './experience-provider'
import { experienceStorageKey, readExperience, storeExperience } from '@/lib/experience-storage'
const request = vi.hoisted(() => vi.fn())
vi.mock('@/lib/experience-browser', () => ({ experienceRequest: request }))
function Reader() {
  const experience = useExperience()
  return <><p>{experience.ready ? experience.preferences.audioLanguage : 'loading'}</p><p>{experience.error}</p><button onClick={() => void experience.patch({ audioLanguage: 'ar' }).catch(() => {})}>Arabic</button><button onClick={() => void experience.retry().catch(() => {})}>Retry sync</button></>
}
beforeEach(() => { storeExperience(null, defaultExperiencePreferences()); localStorage.clear(); request.mockReset() })
describe('member and guest preference scopes', () => {
  it('finishes bootstrap after another loading scope publishes a guide dismissal', async () => {
    let resolve!: (value: ExperienceResponse) => void
    request.mockImplementationOnce(() => new Promise<ExperienceResponse>(done => { resolve = done }))
    render(<ExperienceProvider memberId="loading-member" status="authenticated"><Reader /></ExperienceProvider>)
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    act(() => window.dispatchEvent(new CustomEvent('consumit:experience-changed', { detail: {
      owner: 'loading-member', preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed' }, ready: false, saved: false, error: null,
    } })))
    await act(async () => resolve({ preferences: { ...defaultExperiencePreferences(), audioLanguage: 'fr', guideVersion: 1, guideStatus: 'dismissed' }, saved: true }))
    await screen.findByText('fr')
  })
  it('keeps guest choices local and tolerates blocked storage', async () => {
    localStorage.setItem('consumit.player.audio-language', 'fr')
    const view = render(<ExperienceProvider memberId={null} status="anonymous"><Reader /></ExperienceProvider>)
    await screen.findByText('fr'); fireEvent.click(screen.getByText('Arabic'))
    expect(readExperience(null).audioLanguage).toBe('ar'); expect(request).not.toHaveBeenCalled()
    view.unmount()
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked') })
    render(<ExperienceProvider memberId={null} status="anonymous"><Reader /></ExperienceProvider>)
    await screen.findByText('ar'); fireEvent.click(screen.getByText('Arabic')); expect(screen.getByText('ar')).toBeInTheDocument()
    blocked.mockRestore()
  })
  it('loads account choices over guest choices and cancels another account’s late response', async () => {
    localStorage.setItem(experienceStorageKey(null), JSON.stringify({ ...defaultExperiencePreferences(), audioLanguage: 'fr' }))
    let resolveFirst!: (value: ExperienceResponse) => void
    request.mockImplementationOnce(() => new Promise<ExperienceResponse>(resolve => { resolveFirst = resolve }))
    request.mockResolvedValueOnce({ preferences: { ...defaultExperiencePreferences(), audioLanguage: 'es' }, saved: true })
    const view = render(<ExperienceProvider memberId="first" status="authenticated"><Reader /></ExperienceProvider>)
    await waitFor(() => expect(request).toHaveBeenCalled())
    view.rerender(<ExperienceProvider memberId="second" status="authenticated"><Reader /></ExperienceProvider>)
    await screen.findByText('es')
    await act(async () => resolveFirst({ preferences: { ...defaultExperiencePreferences(), audioLanguage: 'ar' }, saved: true }))
    expect(screen.getByText('es')).toBeInTheDocument()
    expect(readExperience(null).audioLanguage).toBe('fr')
    expect(readExperience('first').audioLanguage).toBe('en')
  })
  it('retains failed writes for retry and does not silently import guest choices into a new account', async () => {
    localStorage.setItem('consumit.player.audio-language', 'fr')
    request.mockResolvedValueOnce({ preferences: defaultExperiencePreferences(), saved: false })
    request.mockRejectedValueOnce(new Error('Offline'))
    request.mockResolvedValueOnce({ preferences: { ...defaultExperiencePreferences(), audioLanguage: 'ar' }, saved: true })
    render(<ExperienceProvider memberId="member" status="authenticated"><Reader /></ExperienceProvider>)
    await screen.findByText('en'); fireEvent.click(screen.getByText('Arabic'))
    await screen.findByText(/Retry to sync/); expect(readExperience('member').audioLanguage).toBe('ar')
    fireEvent.click(screen.getByText('Retry sync'))
    await waitFor(() => expect(request).toHaveBeenCalledTimes(3))
    expect(request.mock.calls[2]?.[1]).toEqual({ audioLanguage: 'ar' })
  })
  it('shares intentional changes between the guide and browsing scope without extra provider requests', async () => {
    request.mockImplementation(async (_signal: AbortSignal, patch?: { audioLanguage?: string }) => ({ preferences: { ...defaultExperiencePreferences(), ...patch }, saved: true }))
    render(<ExperienceProvider memberId="same-member" status="authenticated"><Reader /><ExperienceProvider memberId="same-member" status="authenticated"><Reader /></ExperienceProvider></ExperienceProvider>)
    await waitFor(() => expect(screen.getAllByText('en')).toHaveLength(2))
    fireEvent.click(screen.getAllByText('Arabic')[1]!)
    await waitFor(() => expect(screen.getAllByText('ar')).toHaveLength(2))
    expect(request.mock.calls.filter(call => call[1])).toHaveLength(1)
  })
})
