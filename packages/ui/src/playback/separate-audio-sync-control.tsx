import { PlayerAdjustment } from './player-panel'

export function SeparateAudioSyncControl({ offset, warning, onChange, onReset }: {
  offset: number
  warning?: string | null
  onChange: (value: number) => void
  onReset: () => void
}) {
  return <div className="mt-3 border-t border-white/10 pt-3">
    <p className="mb-2 text-xs leading-5 text-muted" role="status">{warning ?? 'Different recordings may need a sync adjustment.'}</p>
    <PlayerAdjustment label="Audio sync" valueLabel={`${offset > 0 ? '+' : ''}${offset.toFixed(1)}s`} value={offset} min={-30} max={30} step={0.1} ticks={[]} onChange={onChange} />
    <button className="mt-2 inline-flex min-h-11 items-center justify-center rounded-control px-3 text-sm text-copy outline-none transition-colors hover:bg-white/10 hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" onClick={onReset} type="button">Reset audio sync</button>
  </div>
}
