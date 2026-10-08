'use client'

import { Check, GalleryHorizontal, Rows3, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'

import { Toggle } from '@consumit/next-ui'
import { ATMOSPHERES } from './museum-preferences'
import { useShellState } from './shell-state'

export function AppearanceControls() {
  const { atmosphere, setAtmosphere, profileLayout, setProfileLayout, quietMotion, setQuietMotion, appearanceStored } = useShellState()
  return (
    <div className="museum-appearance">
      <fieldset className="museum-atmospheres">
        <legend>Choose your atmosphere</legend>
        <div className="museum-atmosphere-options">
          {ATMOSPHERES.map((option) => (
            <label className="museum-atmosphere-choice" data-selected={atmosphere === option.value} key={option.value}>
              <input checked={atmosphere === option.value} name="consumit-atmosphere" onChange={() => setAtmosphere(option.value)} type="radio" value={option.value} />
              <span aria-hidden="true" className="museum-swatch" data-swatch={option.value}><span /><span /><span />{atmosphere === option.value ? <Check className="size-4" /> : null}</span>
              <span className="museum-choice-label">{option.label}</span>
              <span className="museum-choice-description">{option.description}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="museum-appearance-details">
        <fieldset className="museum-layout-options">
          <legend>Your profile layout</legend>
          <div>
            <button aria-pressed={profileLayout === 'gallery'} onClick={() => setProfileLayout('gallery')} type="button"><GalleryHorizontal aria-hidden="true" className="size-4" /> Gallery</button>
            <button aria-pressed={profileLayout === 'journal'} onClick={() => setProfileLayout('journal')} type="button"><Rows3 aria-hidden="true" className="size-4" /> Journal</button>
          </div>
        </fieldset>
        <div className="museum-motion-choice"><span><strong>Quiet motion</strong><span>Keep the room still. System motion preferences always apply.</span></span><Toggle checked={quietMotion} label="Quiet motion" onCheckedChange={setQuietMotion} /></div>
      </div>
      <p aria-live="polite" className="museum-preference-status">{appearanceStored ? 'Applied immediately. Saved on this device.' : 'Applied for this visit. This browser could not save your appearance; try again when storage is available.'}</p>
    </div>
  )
}

export function CustomizeMuseum() {
  const [open, setOpen] = useState(false)
  return (
    <section className="museum-customization" aria-label="Customize your museum">
      <button aria-controls="museum-appearance-panel" aria-expanded={open} className="museum-customize-button" onClick={() => setOpen(!open)} type="button"><SlidersHorizontal aria-hidden="true" className="size-4" />{open ? 'Close customization' : 'Customize your museum'}</button>
      {open ? <div className="museum-customization-panel" id="museum-appearance-panel"><AppearanceControls /></div> : null}
    </section>
  )
}
