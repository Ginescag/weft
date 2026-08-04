import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { api } from '../lib/api'
import type { ConceptDetail, Graph, GraphNode } from '../lib/types'
import TabBar, { TAB_KEYS, type TabKey } from '../components/TabBar'
import ReaderTab from '../components/ReaderTab'
import TestRunner from '../components/TestRunner'
import ChallengePanel from '../components/ChallengePanel'
import FlashcardDeck from '../components/FlashcardDeck'
import NotesPanel from '../components/NotesPanel'
import { ErrorState, Loading } from '../components/ui'

/** Add a neighbour to its bucket once (dedupe across the connection groups). */
function push(node: GraphNode | undefined, bucket: GraphNode[], seen: Set<string>) {
  if (!node) return
  seen.add(node.id)
  bucket.push(node)
}

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

  // Connections to the concepts around this one, so the learner can walk the
  // roadmap concept-to-concept without going back to the graph. Split by thread
  // semantics: `requiere` is directed (prerequisite → dependent), so an incoming
  // edge is a prerequisite this concept *Requires* and an outgoing one is what it
  // *Unlocks*; `relacionado_con` is undirected — a *Related* concept.
  const connections = useMemo(() => {
    const requires: GraphNode[] = []
    const unlocks: GraphNode[] = []
    const related: GraphNode[] = []
    if (graph) {
      const byId = new Map(graph.nodos.map((n) => [n.id, n]))
      const seen = new Set<string>() // one chip per neighbour, first bucket wins
      for (const e of graph.aristas) {
        if (e.tipo === 'requiere') {
          if (e.a === id && !seen.has(e.de)) push(byId.get(e.de), requires, seen)
          else if (e.de === id && !seen.has(e.a)) push(byId.get(e.a), unlocks, seen)
        } else if (e.tipo === 'relacionado_con') {
          const other = e.de === id ? e.a : e.a === id ? e.de : null
          if (other && !seen.has(other)) push(byId.get(other), related, seen)
        }
      }
    }
    return { requires, unlocks, related }
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
        {/* Walk the roadmap without the graph: chips to the concepts around this
            one, split into what it Requires, what it Unlocks, and what's Related.
            Each keeps the current tab, so studying carries across concepts. */}
        {(connections.requires.length > 0 ||
          connections.unlocks.length > 0 ||
          connections.related.length > 0) && (
          <div className="mt-4 flex flex-col gap-2">
            <ConnectionGroup label="Requires" nodes={connections.requires} tab={activeTab} />
            <ConnectionGroup label="Unlocks" nodes={connections.unlocks} tab={activeTab} />
            <ConnectionGroup label="Related" nodes={connections.related} tab={activeTab} dashed />
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

/** One labelled row of connection chips (Requires / Unlocks / Related). Each chip
 *  links to the neighbour on the *same* tab, so the learner keeps studying the
 *  same facet as they walk the roadmap. `dashed` echoes the dashed "related"
 *  thread on the graph, setting related apart from the solid prerequisite ones. */
function ConnectionGroup({
  label,
  nodes,
  tab,
  dashed = false,
}: {
  label: string
  nodes: GraphNode[]
  tab: string
  dashed?: boolean
}) {
  if (nodes.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 shrink-0 text-xs text-muted">{label}</span>
      {nodes.map((n) => (
        <Link
          key={n.id}
          to={`/concept/${n.id}/${tab}`}
          className={`rounded-full border bg-linen-bright px-2.5 py-1 text-[12px] font-medium leading-none text-ink transition-colors hover:border-burgundy/40 hover:text-burgundy ${
            dashed ? 'border-dashed border-hairline' : 'border-hairline'
          }`}
        >
          {n.nombre}
        </Link>
      ))}
    </div>
  )
}
