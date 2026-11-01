'use client'

import { useEffect, useRef, useState } from 'react'
import { kindLabel, tasteShareSchema } from '@consumit/contracts'
import { Share2 } from 'lucide-react'
import { browserCatalogBatch } from '@/lib/catalog-browser'
import { TasteDialog } from './primitives'
import { tasteRead, errorText } from './api'

export function PublicationShare({ kind, id }: { kind: 'list' | 'review' | 'edition'; id: string }) {
  const [open, setOpen] = useState(false)
  return <><button className="taste-button" onClick={() => setOpen(true)}><Share2 size={16} />Share</button>{open ? <SharePreview kind={kind} id={id} onClose={() => setOpen(false)} /> : null}</>
}
function SharePreview({ kind, id, onClose }: { kind: 'list' | 'review' | 'edition'; id: string; onClose: () => void }) {
  const [format, setFormat] = useState<'square' | 'story'>('square'), [error, setError] = useState(''), [ready, setReady] = useState(false), [href, setHref] = useState(''), [title, setTitle] = useState(''), [retry, setRetry] = useState(0)
  const canvas = useRef<HTMLCanvasElement>(null)
  const shareLink = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    async function draw() {
      setReady(false); setError('')
      const data = await tasteRead(`share/${kind}/${encodeURIComponent(id)}`, tasteShareSchema, controller.signal)
      if (controller.signal.aborted) return
      setHref(data.href); setTitle(data.title)
      const titles = (await browserCatalogBatch(data.refs, controller.signal)).items
      await document.fonts.ready
      if (controller.signal.aborted) return
      const element = canvas.current!, ctx = element.getContext('2d')!
      const width = 1080, height = format === 'square' ? 1080 : 1920
      element.width = width; element.height = height
      ctx.fillStyle = '#09090b'; ctx.fillRect(0, 0, width, height)
      const mark = new window.Image(); mark.src = '/assets/consumit-mark.svg'
      try { await mark.decode(); if (controller.signal.aborted) return; ctx.drawImage(mark, 65, 44, 64, 64) } catch { /* The wordmark remains readable if the mark cannot load. */ }
      ctx.fillStyle = '#ff5d38'; ctx.font = '600 26px sans-serif'; ctx.fillText('CONSUMIT', 142, 90)
      ctx.fillStyle = '#b4aea5'; ctx.font = '24px sans-serif'; ctx.fillText(`@${data.author}`, 70, 134)
      function wrap(text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
        function ellipsize(value: string) {
          const characters = Array.from(value)
          while (characters.length && ctx.measureText(`${characters.join('')}…`).width > maxWidth) characters.pop()
          return `${characters.join('')}…`
        }
        const words = text.split(/\s+/); let line = '', count = 0
        for (let index = 0; index < words.length; index++) { const word = words[index]!, candidate = line ? `${line} ${word}` : word
          if (ctx.measureText(candidate).width > maxWidth && line) { if (++count >= maxLines) { ctx.fillText(ellipsize(line), x, y); return y + lineHeight }; ctx.fillText(ctx.measureText(line).width > maxWidth ? ellipsize(line) : line, x, y); y += lineHeight; line = word } else line = candidate
        }
        if (line) { ctx.fillText(ctx.measureText(line).width > maxWidth ? ellipsize(line) : line, x, y); y += lineHeight }
        return y
      }
      ctx.fillStyle = '#f4f0e8'; ctx.font = '54px Charter, Georgia, serif'
      const top = wrap(data.title, 70, 230, 940, 62, 3) + 28
      const posters = titles.slice(0, 4), gap = 18
      // Leave room for captions, an introduction and the footer after a multiline title.
      const availablePosterHeight = Math.max(0, height - 140 - top - 115 - (data.description ? 84 : 0))
      const posterWidth = posters.length ? Math.min(280, (940 - gap * (posters.length - 1)) / posters.length, availablePosterHeight / 1.5) : 0
      const posterHeight = posterWidth * 1.5
      await Promise.all(posters.map(async (item, i) => {
        const x = 70 + i * (posterWidth + gap)
        ctx.fillStyle = '#202024'; ctx.fillRect(x, top, posterWidth, posterHeight)
        let artworkLoaded = false
        if (item.posterUrl) {
          const img = new window.Image()
          img.src = item.posterUrl.endsWith('.svg') ? item.posterUrl : `/_next/image?url=${encodeURIComponent(item.posterUrl)}&w=384&q=75`
          try {
            await img.decode()
            if (!controller.signal.aborted) { ctx.drawImage(img, x, top, posterWidth, posterHeight); artworkLoaded = true }
          } catch { /* Missing artwork receives the readable title treatment below. */ }
        }
        if (controller.signal.aborted) return
        if (!artworkLoaded) {
          ctx.fillStyle = '#f4f0e8'; ctx.font = '28px Charter, Georgia, serif'
          wrap(item.title, x + 18, top + 44, posterWidth - 36, 34, Math.max(2, Math.floor((posterHeight - 100) / 34)))
        }
        ctx.fillStyle = '#c9c4bc'; ctx.font = '20px sans-serif'
        wrap(artworkLoaded ? item.title : [kindLabel(item.kind), item.year].filter(Boolean).join(' · '), x, top + posterHeight + 30, posterWidth, 26, 2)
      }))
      if (controller.signal.aborted) return
      ctx.fillStyle = '#c9c4bc'; ctx.font = '29px Charter, Georgia, serif'
      const textTop = top + (posters.length ? posterHeight + 115 : 30)
      wrap(data.description, 70, textTop, 920, 42, Math.max(1, Math.floor((height - 140 - textTop) / 42)))
      ctx.strokeStyle = '#45423e'; ctx.beginPath(); ctx.moveTo(70, height - 100); ctx.lineTo(1010, height - 100); ctx.stroke()
      ctx.fillStyle = '#b4aea5'; ctx.font = '20px sans-serif'; wrap(`${window.location.host}${data.href}`, 70, height - 55, 940, 24, 1)
      setReady(true)
    }
    void draw().catch(cause => { if (!controller.signal.aborted) setError(`Image preview unavailable. ${errorText(cause)}`) })
    return () => controller.abort()
  }, [kind, id, format, retry])
  async function copy() {
    if (!href) return
    try {
      await navigator.clipboard.writeText(new URL(href, location.origin).href)
      setMessage('Link copied.')
    } catch {
      shareLink.current?.focus()
      shareLink.current?.select()
      setMessage('Copy could not open. The link is selected; use your device’s Copy command.')
    }
  }
  async function nativeShare() {
    if (!href) return
    try {
      if (navigator.share) await navigator.share({ title, url: new URL(href, location.origin).href })
      else await copy()
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === 'AbortError')) setMessage(errorText(cause))
    }
  }
  function download() {
    if (!ready) return
    try {
      canvas.current?.toBlob(blob => {
        if (!blob) { setMessage('The image could not be downloaded. Try again, or copy the link.'); return }
        const url = URL.createObjectURL(blob), anchor = document.createElement('a')
        anchor.href = url; anchor.download = `consumit-${kind}-${format}.png`; anchor.click(); URL.revokeObjectURL(url)
        setMessage('Image downloaded.')
      })
    } catch { setMessage('The image could not be downloaded. Try again, or copy the link.') }
  }
  return <TasteDialog className="taste-publication-share" title="A little of your world" onClose={onClose}>
    <div className="taste-form">
      <div className="taste-form">
        {href ? <label>Share link<input onFocus={event => event.currentTarget.select()} readOnly ref={shareLink} value={new URL(href, location.origin).href} /></label> : <p role="status">{error ? 'The publication could not be loaded. Retry below to recover its link and preview.' : 'Loading publication link…'}</p>}
        <div className="taste-actions">
          <button className="taste-button taste-button-primary" disabled={!href} onClick={() => void copy()} type="button">Copy link</button>
          <button className="taste-button" disabled={!href} onClick={() => void nativeShare()} type="button">Share…</button>
        </div>
        {message ? <p aria-label="Share action" role="status">{message}</p> : null}
      </div>
      <section aria-label="Share image" className="taste-form">
        <h3>Image preview</h3>
        <div className="taste-actions">
          <button className="taste-button" aria-pressed={format === 'square'} onClick={() => setFormat('square')} type="button">Square</button>
          <button className="taste-button" aria-pressed={format === 'story'} onClick={() => setFormat('story')} type="button">Story</button>
        </div>
        <canvas className="taste-share-preview" ref={canvas} aria-label={`Share preview for ${title}`} role="img" style={{ display: ready ? 'block' : 'none' }} />
        {!ready && !error ? <p role="status">Preparing your public preview…</p> : null}
        {error ? <div className="taste-form"><p role="alert">{error}</p><button className="taste-button" onClick={() => setRetry(value => value + 1)} type="button">{href ? 'Retry image preview' : 'Retry loading publication'}</button></div> : null}
        <button className="taste-button" disabled={!ready} onClick={download} type="button">Download image</button>
      </section>
    </div>
  </TasteDialog>
}
