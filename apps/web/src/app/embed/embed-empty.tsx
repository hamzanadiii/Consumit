/** Honest no-source surface for the public embed route (FilScreen dark). */
export function EmbedEmptyState({
  detail = 'Try again in a moment.',
  title = 'No streams available',
}: {
  detail?: string
  title?: string
}) {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[#09090b] px-6 text-center"
      data-consumit-embed-empty
      role="status"
    >
      <p className="font-display text-2xl leading-tight tracking-[-0.02em] text-[#f4f0e8] sm:text-3xl">
        {title}
        <span className="text-[#ff5d38]">.</span>
      </p>
      <p className="max-w-[36ch] text-sm leading-6 text-[#85817c]">{detail}</p>
      <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#ff5d38]">
        Consumit
      </p>
    </div>
  )
}
