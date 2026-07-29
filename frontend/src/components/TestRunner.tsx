import { useEffect, useMemo, useState } from 'react'
import { ArrowCounterClockwise, Check, X } from '@phosphor-icons/react'
import { api } from '../lib/api'
import type { TestsFile } from '../lib/types'
import { EmptyState, ErrorState, Loading, Rise } from './ui'

interface TestRunnerProps {
  conceptId: string
}

export default function TestRunner({ conceptId }: TestRunnerProps) {
  const [tests, setTests] = useState<TestsFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    let alive = true
    api
      .getTests(conceptId)
      .then((t) => alive && setTests(t))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [conceptId])

  const score = useMemo(() => {
    if (!tests) return 0
    return tests.preguntas.filter((q) => answers[q.id] === q.correcta).length
  }, [tests, answers])

  if (error) return <ErrorState message={error} />
  if (!tests) return <Loading />
  if (tests.preguntas.length === 0)
    return <EmptyState title="No test for this concept yet." hint="Questions will appear once they are generated." />

  const total = tests.preguntas.length
  const answered = Object.keys(answers).length
  const allAnswered = answered === total

  const reset = () => {
    setAnswers({})
    setSubmitted(false)
  }

  // Checking answers also records each miss in the concept's .errorlog — the
  // seed of the future spaced-repetition engine and the errors timeline.
  // Fire-and-forget: logging must never block seeing the results.
  const submit = () => {
    setSubmitted(true)
    for (const q of tests.preguntas) {
      const chosen = answers[q.id]
      if (chosen === undefined || chosen === q.correcta) continue
      void api
        .logError(conceptId, {
          fuente: 'test',
          itemId: q.id,
          nota: `Answered "${q.opciones[chosen]}"`,
        })
        .catch(() => {})
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 flex items-end justify-between gap-6 border-b border-hairline pb-5">
        {submitted ? (
          <div className="rise">
            <p className="font-display text-4xl font-semibold tracking-tight">
              {score} <span className="text-muted">/ {total}</span>
            </p>
            <p className="mt-1 text-sm text-muted">
              {score === total
                ? 'Every stitch in place.'
                : score >= total / 2
                  ? 'Holding together. Review the misses below.'
                  : 'The fabric needs another pass. Review and try again.'}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted">
              {total} questions · answer all of them, then check your work
            </p>
            <div className="flex items-center gap-3">
              <div aria-hidden className="h-0.5 w-24 overflow-hidden rounded-full bg-hairline">
                <div
                  className="h-full origin-left rounded-full bg-burgundy transition-transform duration-300 motion-reduce:transition-none"
                  style={{ transform: `scaleX(${total ? answered / total : 0})` }}
                />
              </div>
              <span className="font-mono text-xs text-muted">
                {answered}/{total}
              </span>
            </div>
          </>
        )}
        {submitted && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-linen-raw active:scale-[0.98]"
          >
            <ArrowCounterClockwise size={14} weight="bold" aria-hidden />
            Try again
          </button>
        )}
      </div>

      <div role="list" className="flex flex-col gap-6">
        {tests.preguntas.map((q, qi) => {
          const chosen = answers[q.id]
          return (
            <Rise key={q.id} index={qi}>
              <div role="listitem" className="rounded-lg border border-hairline p-6">
                <p className="mb-4 font-medium">
                  <span className="mr-2 font-mono text-xs text-muted">{qi + 1}</span>
                  {q.enunciado}
                </p>
                <div className="flex flex-col gap-2" role="radiogroup" aria-label={q.enunciado}>
                  {q.opciones.map((opcion, oi) => {
                    const isChosen = chosen === oi
                    const isCorrect = q.correcta === oi
                    let tone = 'border-hairline hover:bg-linen-raw'
                    if (submitted && isCorrect) tone = 'border-moss/40 bg-moss/10'
                    else if (submitted && isChosen && !isCorrect) tone = 'border-burgundy/40 bg-burgundy/10'
                    else if (isChosen) tone = 'border-burgundy/50 bg-burgundy/5'
                    return (
                      <label
                        key={oi}
                        className={`flex cursor-pointer items-center gap-3 rounded-md border px-4 py-2.5 text-sm transition-colors ${tone} ${
                          submitted ? 'cursor-default' : 'active:scale-[0.99]'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`${conceptId}-${q.id}`}
                          checked={isChosen}
                          disabled={submitted}
                          onChange={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                          className="accent-burgundy"
                        />
                        <span className="flex-1">{opcion}</span>
                        {submitted && isCorrect && <Check size={16} weight="bold" className="text-moss" aria-label="Correct answer" />}
                        {submitted && isChosen && !isCorrect && <X size={16} weight="bold" className="text-burgundy" aria-label="Your answer" />}
                      </label>
                    )
                  })}
                </div>
                {submitted && (
                  <p className="mt-4 border-l-2 border-burgundy bg-linen-raw px-4 py-3 text-sm text-ink">
                    {q.explicacion}
                  </p>
                )}
              </div>
            </Rise>
          )
        })}
      </div>

      {!submitted && (
        <div className="mt-8 flex items-center gap-4">
          <button
            type="button"
            disabled={!allAnswered}
            onClick={submit}
            className="rounded-md bg-burgundy px-5 py-2.5 text-sm font-medium text-linen-bright transition-colors hover:bg-burgundy-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Check answers
          </button>
          {!allAnswered && (
            <p className="text-sm text-muted">
              {answered} of {total} answered
            </p>
          )}
        </div>
      )}
    </div>
  )
}
