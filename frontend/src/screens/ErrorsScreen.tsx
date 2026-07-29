import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Exam, Target } from '@phosphor-icons/react'
import { api } from '../lib/api'
import type { ResolvedError } from '../lib/types'
import MarkdownView from '../components/MarkdownView'
import { EmptyState, ErrorState, Loading, Rise } from '../components/ui'

function formatFecha(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00`)
  return Number.isNaN(d.getTime())
    ? fecha
    : d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * The mistakes timeline: every recorded error across the project, newest
 * first, grouped by day along a vertical thread. Hovering (or focusing) an
 * entry shows the solution that was given in the pinned card on the right —
 * the correct answer for a test miss, the saved solution for a challenge.
 */
export default function ErrorsScreen() {
  const [errores, setErrores] = useState<ResolvedError[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    let alive = true
    api
      .getErrors()
      .then((list) => alive && setErrores(list))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [])

  // Consecutive same-day entries fold into one dated group (already newest-first).
  const groups = useMemo(() => {
    if (!errores) return []
    const out: { fecha: string; items: { entry: ResolvedError; index: number }[] }[] = []
    errores.forEach((entry, index) => {
      const last = out[out.length - 1]
      if (last && last.fecha === entry.fecha) last.items.push({ entry, index })
      else out.push({ fecha: entry.fecha, items: [{ entry, index }] })
    })
    return out
  }, [errores])

  return (
    <div className="flex h-dvh flex-col">
      <header className="px-8 pb-5 pt-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} weight="bold" aria-hidden />
          Back to the loom
        </Link>
        <div className="mt-3 flex flex-wrap items-baseline gap-4">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Mistakes</h1>
          {errores && errores.length > 0 && (
            <p className="font-mono text-xs text-muted">
              {errores.length} dropped {errores.length === 1 ? 'stitch' : 'stitches'}
            </p>
          )}
        </div>
        <p className="mt-1 text-sm text-muted">
          Every dropped stitch, and the thread that mended it. Hover an entry to see the solution.
        </p>
      </header>

      <main className="flex-1 overflow-y-auto border-t border-hairline">
        <div className="mx-auto max-w-6xl px-8 py-10">
          {error ? (
            <ErrorState message={error} />
          ) : !errores ? (
            <Loading />
          ) : errores.length === 0 ? (
            <EmptyState
              title="No dropped stitches yet."
              hint="Miss a test question — or have your AI log a mistake — and it will appear on this timeline."
            />
          ) : (
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
              <div className="flex flex-col gap-8">
                {groups.map((group, gi) => (
                  <Rise key={`${group.fecha}-${gi}`} index={gi}>
                    <section>
                      <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.08em] text-muted">
                        {formatFecha(group.fecha)}
                      </h2>
                      <ol className="relative ml-1 flex flex-col gap-3 border-l border-burgundy/25 pl-6">
                        {group.items.map(({ entry, index }) => {
                          const isActive = index === active
                          const FuenteIcon = entry.fuente === 'test' ? Exam : Target
                          return (
                            <li key={index} className="relative">
                              {/* The knot on the thread. */}
                              <span
                                aria-hidden
                                className={`absolute -left-[30px] top-5 h-2.5 w-2.5 rounded-full border-2 border-linen transition-colors ${
                                  isActive ? 'bg-burgundy' : 'bg-burgundy/40'
                                }`}
                              />
                              <button
                                type="button"
                                onMouseEnter={() => setActive(index)}
                                onFocus={() => setActive(index)}
                                onClick={() => setActive(index)}
                                aria-pressed={isActive}
                                aria-label={`Mistake in ${entry.conceptNombre}: ${entry.titulo}`}
                                className={`w-full rounded-lg border p-4 text-left transition-colors ${
                                  isActive
                                    ? 'border-burgundy/50 bg-burgundy/5'
                                    : 'border-hairline bg-linen-bright hover:border-burgundy/30'
                                }`}
                              >
                                <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                                  <FuenteIcon size={13} weight="bold" aria-hidden />
                                  {entry.fuente === 'test' ? 'Test' : 'Challenge'}
                                  <span aria-hidden>·</span>
                                  {entry.conceptNombre}
                                </span>
                                <span className="mt-1.5 line-clamp-2 block text-sm font-medium text-ink">
                                  {entry.titulo}
                                </span>
                                {entry.nota && (
                                  <span className="mt-1 line-clamp-1 block text-[13px] text-muted">
                                    {entry.nota}
                                  </span>
                                )}
                              </button>
                            </li>
                          )
                        })}
                      </ol>
                    </section>
                  </Rise>
                ))}
              </div>

              <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
                {errores[active] && <SolutionCard entry={errores[active]} />}
              </aside>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

/** The solution that was given for one mistake, pinned beside the timeline. */
function SolutionCard({ entry }: { entry: ResolvedError }) {
  const isTest = entry.fuente === 'test'
  return (
    <div className="rounded-xl border border-hairline bg-linen-bright p-6">
      <div className="flex items-center justify-between gap-4 border-b border-hairline pb-3">
        <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted">
          The solution given
        </h2>
        <span className="font-mono text-[11px] text-muted">{entry.fecha}</span>
      </div>

      <p className="mt-4 font-display text-lg leading-snug">{entry.titulo}</p>
      <Link
        to={`/concept/${entry.conceptId}/${isTest ? 'tests' : 'challenges'}`}
        className="mt-2.5 inline-flex items-center rounded-full border border-hairline bg-linen px-2.5 py-1 text-[12px] font-medium leading-none text-ink transition-colors hover:border-burgundy/40 hover:text-burgundy"
      >
        {entry.conceptNombre}
      </Link>

      {entry.nota && (
        <p className="mt-4 border-l-2 border-burgundy/60 bg-linen-raw px-3 py-2 text-sm text-ink">
          {entry.nota}
        </p>
      )}

      {isTest ? (
        entry.solucion !== null ? (
          <div className="mt-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-moss">
              Correct answer
            </p>
            <p className="mt-1.5 rounded-md border border-moss/40 bg-moss/10 px-3 py-2 text-sm text-ink">
              {entry.solucion}
            </p>
            {entry.explicacion && (
              <p className="mt-3 text-sm leading-relaxed text-ink">{entry.explicacion}</p>
            )}
          </div>
        ) : (
          <p className="mt-5 text-sm text-muted">
            This question is no longer part of the concept's test.
          </p>
        )
      ) : entry.solucion !== null ? (
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-moss">
            Saved solution
          </p>
          <div className="max-h-[50vh] overflow-y-auto">
            <MarkdownView markdown={entry.solucion} />
          </div>
        </div>
      ) : (
        <p className="mt-5 text-sm text-muted">
          No solution has been saved for this challenge yet.
        </p>
      )}
    </div>
  )
}
