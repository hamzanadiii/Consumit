import { StrictMode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ANALYTICS_CHOICE_KEY, saveAnalyticsChoice, type AnalyticsWindow } from '@/lib/google-analytics'
import { AnalyticsPreferences, GoogleAnalytics } from './google-analytics'

let pathname = '/'
const id = 'G-K0BSZ9ZM48'
const browser = window as AnalyticsWindow
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
vi.mock('next/script', () => ({ default: ({ src }: { src: string }) => <span data-testid="analytics-script" data-src={src} /> }))
const events = () => (browser.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>))
const pageViews = () => events().filter((entry) => entry[0] === 'event' && entry[1] === 'page_view')

beforeEach(() => {
  vi.unstubAllEnvs()
  pathname = '/'
  localStorage.clear()
  delete browser.dataLayer
  delete browser.gtag
  delete browser[`ga-disable-${id}`]
  vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', id)
})

describe('optional GA4', () => {
  it('loads nothing before a choice, then stays off after decline', () => {
    render(<GoogleAnalytics measurementId={id} />)
    expect(screen.getByRole('region', { name: 'Optional analytics' })).toBeInTheDocument()
    expect(screen.queryByTestId('analytics-script')).not.toBeInTheDocument()
    expect(events()).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Decline analytics' }))
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    expect(events()).toEqual([])
    expect(localStorage.getItem(ANALYTICS_CHOICE_KEY)).toBe('declined')
  })

  it('loads the correct tag after allow and sends only a grouped page', () => {
    pathname = '/title/550'
    render(<GoogleAnalytics measurementId={id} />)
    fireEvent.click(screen.getByRole('button', { name: 'Allow analytics' }))
    expect(screen.getByTestId('analytics-script')).toHaveAttribute('data-src', `https://www.googletagmanager.com/gtag/js?id=${id}`)
    expect(pageViews()).toHaveLength(1)
    expect(pageViews()[0]?.[2]).toMatchObject({ page_location: `${window.location.origin}/title`, page_title: 'Consumit · Title' })
    expect(JSON.stringify(events())).not.toContain('550')
    expect(events().find((entry) => entry[0] === 'config')?.[2]).toMatchObject({ send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false })
  })

  it('deduplicates StrictMode and rerenders but counts distinct public navigation', () => {
    localStorage.setItem(ANALYTICS_CHOICE_KEY, 'accepted')
    const view = render(<StrictMode><GoogleAnalytics measurementId={id} /></StrictMode>)
    expect(pageViews()).toHaveLength(1)
    view.rerender(<StrictMode><GoogleAnalytics measurementId={id} /></StrictMode>)
    expect(pageViews()).toHaveLength(1)
    pathname = '/movies'
    view.rerender(<StrictMode><GoogleAnalytics measurementId={id} /></StrictMode>)
    expect(pageViews()).toHaveLength(2)
    pathname = '/watch/movie/550'
    view.rerender(<StrictMode><GoogleAnalytics measurementId={id} /></StrictMode>)
    expect(pageViews()).toHaveLength(2)
    expect(browser[`ga-disable-${id}`]).toBe(true)
    pathname = '/'
    view.rerender(<StrictMode><GoogleAnalytics measurementId={id} /></StrictMode>)
    expect(pageViews()).toHaveLength(3)
    expect(browser[`ga-disable-${id}`]).toBe(false)
  })

  it('lets the privacy page revoke consent immediately and clear analytics cookies only', () => {
    pathname = '/privacy'
    localStorage.setItem(ANALYTICS_CHOICE_KEY, 'accepted')
    document.cookie = '_ga=sample; Path=/'
    document.cookie = '_ga_K0BSZ9ZM48=sample; Path=/'
    document.cookie = 'theme=dark; Path=/'
    render(<><GoogleAnalytics measurementId={id} /><AnalyticsPreferences /></>)
    fireEvent.click(screen.getByRole('button', { name: 'Decline analytics' }))
    expect(browser[`ga-disable-${id}`]).toBe(true)
    expect(document.cookie).not.toContain('_ga')
    expect(document.cookie).toContain('theme=dark')
    expect(screen.getByRole('status')).toHaveTextContent('off')
    expect(pageViews()).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Allow analytics' }))
    expect(browser[`ga-disable-${id}`]).toBe(false)
    expect(pageViews()).toHaveLength(2)
  })

  it('reacts to consent changes in another tab', () => {
    localStorage.setItem(ANALYTICS_CHOICE_KEY, 'accepted')
    render(<GoogleAnalytics measurementId={id} />)
    act(() => {
      localStorage.setItem(ANALYTICS_CHOICE_KEY, 'declined')
      window.dispatchEvent(new StorageEvent('storage', { key: ANALYTICS_CHOICE_KEY }))
    })
    expect(browser[`ga-disable-${id}`]).toBe(true)
    expect(screen.queryByTestId('analytics-script')).not.toBeInTheDocument()
  })

  it('keeps a choice for the visit when storage is blocked', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked') })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked') })
    act(() => saveAnalyticsChoice('declined'))
    render(<GoogleAnalytics measurementId={id} />)
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    expect(events()).toEqual([])
    get.mockRestore()
    set.mockRestore()
  })

  it.each(['/settings', '/library', '/profile/private-name', '/watch/movie/550', '/sign-in', '/_internal/playback-check', '/private-name', '/missing'])('does not initialize on %s', (path) => {
    pathname = path
    localStorage.setItem(ANALYTICS_CHOICE_KEY, 'accepted')
    render(<GoogleAnalytics measurementId={id} />)
    expect(events()).toEqual([])
    expect(screen.queryByTestId('analytics-script')).not.toBeInTheDocument()
  })

  it.each([undefined, '', 'G-bad<script>', 'UA-123'])('fails closed for invalid configuration %s', (measurementId) => {
    localStorage.setItem(ANALYTICS_CHOICE_KEY, 'accepted')
    render(<GoogleAnalytics measurementId={measurementId} />)
    expect(events()).toEqual([])
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('hides the prompt and collects when NEXT_PUBLIC_GA_PROMPT is off', () => {
    vi.stubEnv('NEXT_PUBLIC_GA_PROMPT', 'off')
    pathname = '/movies'
    render(<GoogleAnalytics measurementId={id} />)
    expect(screen.queryByRole('region', { name: 'Optional analytics' })).not.toBeInTheDocument()
    expect(screen.getByTestId('analytics-script')).toHaveAttribute('data-src', `https://www.googletagmanager.com/gtag/js?id=${id}`)
    expect(pageViews()).toHaveLength(1)
    expect(pageViews()[0]?.[2]).toMatchObject({ page_location: `${window.location.origin}/movies`, page_title: 'Consumit · Movies' })
    expect(localStorage.getItem(ANALYTICS_CHOICE_KEY)).toBeNull()
  })

  it('honors a stored decline while the prompt is hidden', () => {
    vi.stubEnv('NEXT_PUBLIC_GA_PROMPT', 'off')
    localStorage.setItem(ANALYTICS_CHOICE_KEY, 'declined')
    render(<GoogleAnalytics measurementId={id} />)
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    expect(screen.queryByTestId('analytics-script')).not.toBeInTheDocument()
    expect(events()).toEqual([])
    expect(browser[`ga-disable-${id}`]).toBe(true)
  })

  it.each(['on', 'yes', ''])('keeps showing the prompt for NEXT_PUBLIC_GA_PROMPT=%s', (value) => {
    vi.stubEnv('NEXT_PUBLIC_GA_PROMPT', value)
    render(<GoogleAnalytics measurementId={id} />)
    expect(screen.getByRole('region', { name: 'Optional analytics' })).toBeInTheDocument()
    expect(screen.queryByTestId('analytics-script')).not.toBeInTheDocument()
  })
})
