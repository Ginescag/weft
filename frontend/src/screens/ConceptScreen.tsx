import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { api } from '../lib/api'
import type { ConceptDetail, Graph } from '../lib/types'
import TabBar, { TAB_KEYS, type TabKey } from '../components/TabBar'
import ReaderTab from '../components/ReaderTab'
import TestRunner from '../components/TestRunner'
import ChallengePanel from '../components/ChallengePanel'
import FlashcardDeck from '../components/FlashcardDeck'
import NotesPanel from '../components/NotesPanel'
import { ErrorState, Loading } from '../components/ui'

export default function ConceptScreen() {
  const { id = '', tab = 'lessons' } = useParams()
  const [detail, setDetail] = useState<ConceptDetail | null>(null)
  const [graph, setGraph] = useState<Graph | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .getConcept(id)
      .then(setDetail)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [id])

  useEffect(() => {
    setDetail(null)
    setError(null)
    load()
  }, [load])

  // The graph is only needed for the "Requires" chips; failure is non-fatal.
  useEffect(() => {
    let alive = true
    api
      .getGraph()
      .then((g) => alive && setGraph(g))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const requires = useMemo(() => {
    if (!graph) return []
    return graph.aristas
      .filter((e) => e.a === id && e.tipo === 'requiere')
      .map((e) => graph.nodos.find((n) => n.id === e.de))
      .filter((n) => n !== undefined)
  }, [graph, id])

  if (!TAB_KEYS.includes(tab as TabKey)) {
    return <Navigate to={`/concept/${id}/lessons`} replace />
  }
  const activeTab = tab as TabKey

  const renderTab = (d: ConceptDetail) => {
    switch (activeTab) {
      case 'lessons':
        return (
          <ReaderTab
            key={`${id}-lessons`}
            conceptId={id}
            folder="lessons"
            files={d.files.lessons}
            emptyTitle="No lessons woven yet."
            emptyHint="Ask your AI to explain this concept and the lessons will land here."
          />
        )
      case 'examples':
        return (
          <ReaderTab
            key={`${id}-examples`}
            conceptId={id}
            folder="examples"
            files={d.files.examples}
            emptyTitle="No examples yet."
            emptyHint="Worked examples will appear here, next to the lessons."
          />
        )
      case 'tests':
        return <TestRunner key={id} conceptId={id} />
      case 'challenges':
        return <ChallengePanel key={id} conceptId={id} files={d.files.challenges} />
      case 'flashcards':
        return <FlashcardDeck key={id} conceptId={id} />
      case 'notes':
        return <NotesPanel key={id} conceptId={id} files={d.files.notes} onCreated={load} />
    }
  }

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
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {detail?.nombre ?? id}
          </h1>
        </div>
        {requires.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Requires</span>
            {requires.map((n) => (
              <Link
                key={n.id}
                to={`/concept/${n.id}/lessons`}
                className="rounded-full border border-hairline bg-linen-bright px-2.5 py-1 text-[12px] font-medium leading-none text-ink transition-colors hover:border-burgundy/40 hover:text-burgundy"
              >
                {n.nombre}
              </Link>
            ))}
          </div>
        )}
      </header>

      <TabBar
        conceptId={id}
        active={activeTab}
        counts={
          detail
            ? {
                lessons: detail.files.lessons.length,
                examples: detail.files.examples.length,
                challenges: detail.files.challenges.length,
                notes: detail.files.notes.length,
              }
            : undefined
        }
      />

      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-10">
          {error ? (
            <ErrorState message={error} />
          ) : !detail ? (
            <Loading />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              >
                {renderTab(detail)}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </main>
    </div>
  )
}
