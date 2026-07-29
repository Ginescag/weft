import type { CSSProperties, ReactNode } from 'react'

export function Loading({ label = 'Threading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted" role="status">
      <span
        aria-hidden
        className="inline-block h-3 w-3 animate-spin rounded-full border border-muted border-t-burgundy motion-reduce:animate-none"
      />
      {label}
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
      <p className="font-display text-xl text-ink">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted">{hint}</p>}
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
      <p className="font-display text-xl text-ink">The thread snapped.</p>
      <p className="max-w-md text-sm text-muted">{message}</p>
    </div>
  )
}

/** Staggered rise-in wrapper; index drives the 80ms cascade. */
export function Rise({ index = 0, children, className = '' }: { index?: number; children: ReactNode; className?: string }) {
  return (
    <div className={`rise ${className}`} style={{ '--rise-index': index } as CSSProperties}>
      {children}
    </div>
  )
}
