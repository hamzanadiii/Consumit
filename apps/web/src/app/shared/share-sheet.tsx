'use client'

import { Copy, Download, Share2, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

type ExportShape = 'square' | 'story'

export function ShareSheet({ children, className, description, title, triggerLabel = 'Share', url }: {
  className?: string
  description: string
  title: string
  triggerLabel?: string
  url: string
  children?: ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  const [open, setOpen] = useState(false)
  const [shape, setShape] = useState<ExportShape>('square')
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const absoluteUrl = () => new URL(url, window.location.origin).toString()

  async function copy() {
    setMessage(''); setFailed(false)
    try {
      await navigator.clipboard.writeText(absoluteUrl())
      setMessage('Link copied.')
    } catch {
      setFailed(true); setMessage('The link could not be copied. Copy it from the address bar.')
    }
  }

  async function share() {
    setMessage(''); setFailed(false)
    if (!navigator.share) return copy()
    try {
      await navigator.share({ title, text: description, url: absoluteUrl() })
      setMessage('Ready to share.')
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') return
      setFailed(true); setMessage('Sharing could not open. Copy the link or export an image instead.')
    }
  }

  async function exportImage(format: ExportShape) {
    setMessage(''); setFailed(false)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = format === 'square' ? 1080 : 1080
      canvas.height = format === 'square' ? 1080 : 1920
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas unavailable')
      const width = canvas.width
      const height = canvas.height
      context.fillStyle = '#0d1018'
      context.fillRect(0, 0, width, height)
      context.fillStyle = '#ed6a3a'
      context.fillRect(76, 84, 6, height - 168)
      context.fillStyle = '#f1eee8'
      context.font = '700 30px Arial, sans-serif'
      context.fillText('CONSUMIT', 112, 126)
      context.fillStyle = '#a7a8ae'
      context.font = '400 20px Arial, sans-serif'
      context.fillText('CINEMA AFTER MIDNIGHT', 112, 162)
      context.strokeStyle = '#323641'
      context.lineWidth = 2
      context.beginPath(); context.moveTo(112, 202); context.lineTo(width - 76, 202); context.stroke()

      const titleFontSize = format === 'square' ? 78 : 88
      context.fillStyle = '#f1eee8'
      context.font = `400 ${titleFontSize}px Georgia, serif`
      const maxWidth = width - 224
      const lines: string[] = []
      let line = ''
      for (const word of title.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word
        if (line && context.measureText(candidate).width > maxWidth) { lines.push(line); line = word }
        else line = candidate
      }
      if (line) lines.push(line)
      const titleStart = format === 'square' ? 390 : 620
      lines.slice(0, 5).forEach((value, index) => context.fillText(value, 112, titleStart + index * (titleFontSize + 14)))

      context.fillStyle = '#b6b4b0'
      context.font = '400 30px Arial, sans-serif'
      const descriptionLines: string[] = []
      let descriptionLine = ''
      for (const word of description.split(/\s+/)) {
        const candidate = descriptionLine ? `${descriptionLine} ${word}` : word
        if (descriptionLine && context.measureText(candidate).width > maxWidth) { descriptionLines.push(descriptionLine); descriptionLine = word }
        else descriptionLine = candidate
      }
      if (descriptionLine) descriptionLines.push(descriptionLine)
      const descriptionStart = titleStart + Math.min(lines.length, 5) * (titleFontSize + 14) + 36
      descriptionLines.slice(0, 4).forEach((value, index) => context.fillText(value, 112, descriptionStart + index * 44))
      context.fillStyle = '#ed6a3a'
      context.font = '700 24px Arial, sans-serif'
      context.fillText(absoluteUrl().replace(/^https?:\/\//, ''), 112, height - 110, width - 224)

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Image export failed')
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = `consumit-${format}.png`
      anchor.click()
      URL.revokeObjectURL(objectUrl)
      setMessage(`${format === 'square' ? 'Square' : 'Story'} image downloaded.`)
    } catch {
      setFailed(true); setMessage('The image could not be exported on this device.')
    }
  }

  return <>
    <button className={className ?? 'inline-flex min-h-11 items-center gap-2 rounded-control border border-[var(--fs-field-border)] px-4 text-sm font-bold text-[var(--fs-ink)] hover:border-[var(--fs-accent)] hover:text-[var(--fs-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'} onClick={() => { setOpen(true); setMessage(''); setFailed(false) }} type="button">{children ?? <><Share2 aria-hidden="true" className="size-4" />{triggerLabel}</>}</button>
    {open ? <dialog aria-labelledby={headingId} className="m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-xl overflow-y-auto rounded-card border border-[var(--fs-line)] bg-[var(--fs-shell)] p-0 text-[var(--fs-ink)] shadow-[0_18px_54px_rgba(0,0,0,0.42)] backdrop:bg-black/70" onCancel={event => { event.preventDefault(); setOpen(false) }} onClick={event => { if (event.target === event.currentTarget) setOpen(false) }} ref={dialogRef}>
      <header className="flex items-start justify-between gap-4 border-b border-[var(--fs-line)] px-5 py-4 sm:px-6"><div><h2 className="font-display text-2xl" id={headingId}>Share the feeling</h2><p className="mt-1 text-xs text-[var(--fs-muted)]">Pass this Consumit pick along.</p></div><button aria-label="Close share options" className="grid size-10 shrink-0 place-items-center rounded-control text-[var(--fs-muted)] hover:bg-[var(--fs-hover)] hover:text-[var(--fs-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" onClick={() => setOpen(false)} type="button"><X aria-hidden="true" className="size-5" /></button></header>
      <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_11rem] sm:p-6">
        <section aria-label="Social preview" className={`relative flex flex-col justify-between overflow-hidden border border-[var(--fs-line)] bg-[#0d1018] p-5 ${shape === 'square' ? 'aspect-square' : 'aspect-[9/16]'}`}><span className="absolute inset-y-5 left-0 w-1 bg-[#ed6a3a]" /><div className="pl-3"><p className="text-xs font-bold tracking-[0.12em] text-[#f1eee8]">CONSUMIT</p><p className="mt-1 text-[10px] tracking-[0.12em] text-[#a7a8ae]">CINEMA AFTER MIDNIGHT</p><div className="mt-4 border-t border-[#323641] pt-4"><h3 className="line-clamp-5 font-display text-2xl leading-tight text-[#f1eee8] sm:text-3xl">{title}</h3><p className="mt-3 line-clamp-4 text-xs leading-5 text-[#b6b4b0]">{description}</p></div></div><p className="break-all pl-3 text-[10px] text-[#ed6a3a]">{url}</p></section>
        <div className="flex flex-col gap-2"><div className="mb-2 flex rounded-control border border-[var(--fs-line)] p-1" role="group" aria-label="Image shape">{(['square', 'story'] as const).map(value => <button aria-pressed={shape === value} className={`min-h-10 flex-1 rounded-control px-2 text-xs font-bold ${shape === value ? 'bg-[var(--fs-accent-soft)] text-[var(--fs-accent)]' : 'text-[var(--fs-muted)] hover:text-[var(--fs-ink)]'}`} key={value} onClick={() => setShape(value)} type="button">{value === 'square' ? 'Square' : 'Story'}</button>)}</div><button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-[var(--fs-field-border)] px-3 text-sm font-bold hover:border-[var(--fs-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" onClick={() => void share()} type="button"><Share2 aria-hidden="true" className="size-4" />Share</button><button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-[var(--fs-field-border)] px-3 text-sm font-bold hover:border-[var(--fs-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" onClick={() => void copy()} type="button"><Copy aria-hidden="true" className="size-4" />Copy link</button><button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-[var(--fs-accent)] px-3 text-sm font-bold text-[var(--fs-shell)] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" onClick={() => void exportImage(shape)} type="button"><Download aria-hidden="true" className="size-4" />Download PNG</button></div>
        {message ? <p className={`text-xs ${failed ? 'text-[var(--fs-danger)]' : 'text-[var(--fs-muted)]'}`} role={failed ? 'alert' : 'status'}>{message}</p> : null}
      </div>
    </dialog> : null}
  </>
}
