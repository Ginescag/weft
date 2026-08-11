import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ClockCounterClockwise, MagnifyingGlass, Plus } from '@phosphor-icons/react'
import { api } from '../lib/api'
import type { Flecha, Graph, GraphEdge, GraphNode, MarcoConMiembros, Sticky } from '../lib/types'
import { UndoManager } from '../lib/undo'
import NeedleGraph, { type NeedleGraphHandle } from '../components/NeedleGraph'
import NewConceptDialog from '../components/NewConceptDialog'
import SearchCommand from '../components/SearchCommand'
import { EmptyState, ErrorState, Loading } from '../components/ui'

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-6 left-6 z-10 flex flex-col gap-2 rounded-lg border border-hairline bg-linen px-4 py-3 text-xs text-muted">
      <div className="flex items-center gap-2">
        <svg aria-hidden width="26" height="8" viewBox="0 0 26 8" className="shrink-0">
          <line x1="0" y1="4" x2="18" y2="4" stroke="#7a2e3a" strokeWidth="2" />
          <path d="M18 0.5 L26 4 L18 7.5 Q20.5 4 18 0.5 Z" fill="#7a2e3a" />
        </svg>
        unlocks
      </div>
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-block h-0 w-5 border-t-2 border-dashed border-burgundy/70" /> related
      </div>
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-block h-3.5 w-5 rounded-sm border border-dashed border-muted" />
        shift+drag selects
      </div>
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-block h-0 w-5 border-t-2 border-burgundy/40" /> tap a thread to cut it
      </div>
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-ink/70" /> right-click a needle to delete it
      </div>
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-block h-3.5 w-5 rounded-sm border border-muted/70 bg-[#EAE0BF]" />
        drag a sticky's corner to resize
      </div>
    </div>
  )
}

export default function GraphScreen() {
  const navigate = useNavigate()
  const graphRef = useRef<NeedleGraphHandle>(null)
  const [graph, setGraph] = useState<Graph | null>(null)
  const [stickies, setStickies] = useState<Sticky[] | null>(null)
  const [arrows, setArrows] = useState<Flecha[] | null>(null)
  const [frames, setFrames] = useState<MarcoConMiembros[] | null>(null)
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  // One shared undo/redo stack for the whole canvas. NeedleGraph pushes its
  // canvas/thread commands; the concept commands are pushed here.
  const undo = useMemo(() => new UndoManager(), [])
  // Latest graph in a ref so the delete handler can capture the node being removed.
  const graphStateRef = useRef<Graph | null>(null)
  graphStateRef.current = graph

  const flashToast = (msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 1600)
  }

  // Ctrl+Z undo, Ctrl+Shift+Z / Ctrl+Y redo. Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key !== 'z' && key !== 'y') return
      const t = e.target
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      ) {
        return
      }
      e.preventDefault()
      const redo = key === 'y' || (key === 'z' && e.shiftKey)
      if (redo) void undo.redo().then((c) => c && flashToast(`Redid: ${c.label}`))
      else void undo.undo().then((c) => c && flashToast(`Undid: ${c.label}`))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo])

  useEffect(() => {
    let alive = true
    Promise.all([api.getGraph(), api.getStickies(), api.getLayout(), api.getArrows(), api.getFrames()])
      .then(([g, s, l, a, f]) => {
        if (!alive) return
        setGraph(g)
        setStickies(s)
        setPositions(l)
        setArrows(a)
        setFrames(f)
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [])

  // --- Concept view sync (state + cy), shared by create/delete undo & redo -----
  const removeConceptFromView = (id: string) => {
    setGraph((g) =>
      g
        ? {
            ...g,
            nodos: g.nodos.filter((n) => n.id !== id),
            aristas: g.aristas.filter((e) => e.de !== id && e.a !== id),
          }
        : g,
    )
    graphRef.current?.removeNeedle(id)
  }
  const addConceptToView = (
    node: GraphNode,
    pos: { x: number; y: number } | null,
    edges: GraphEdge[],
  ) => {
    setGraph((g) => {
      if (!g) return g
      const nodos = g.nodos.some((n) => n.id === node.id) ? g.nodos : [...g.nodos, node]
      const aristas = [...g.aristas]
      for (const e of edges) {
        if (!aristas.some((x) => x.de === e.de && x.a === e.a && x.tipo === e.tipo)) aristas.push(e)
      }
      return { ...g, nodos, aristas }
    })
    graphRef.current?.addNeedle(node, pos, edges)
  }

  const handleConceptCreated = (node: GraphNode) => {
    setAddOpen(false)
    setGraph((g) => (g ? { ...g, nodos: [...g.nodos, node] } : g))
    // Undo removes the fresh concept (to the trash); redo restores it.
    undo.push({
      label: `add "${node.nombre}"`,
      undo: async () => {
        await api.deleteConcept(node.id).catch(() => {})
        removeConceptFromView(node.id)
      },
      redo: async () => {
        await api.restoreConcept(node.id).catch(() => {})
        addConceptToView(node, null, [])
      },
    })
  }

  // A thread was drawn on the canvas — lift it into state + persist. Reused by
  // NeedleGraph's thread undo commands, so undo/redo re-persist through here.
  const handleConnect = (arista: GraphEdge) => {
    setGraph((g) =>
      g
        ? g.aristas.some((e) => e.de === arista.de && e.a === arista.a && e.tipo === arista.tipo)
          ? g
          : { ...g, aristas: [...g.aristas, arista] }
        : g,
    )
    void api.addRelation(arista.a, { id: arista.de, tipo: arista.tipo })
  }

  // A thread was cut on the canvas; persist the removal and drop it from state.
  const handleDisconnect = (arista: GraphEdge) => {
    setGraph((g) =>
      g
        ? {
            ...g,
            aristas: g.aristas.filter(
              (e) => !(e.de === arista.de && e.a === arista.a && e.tipo === arista.tipo),
            ),
          }
        : g,
    )
    void api.removeRelation(arista.a, arista.de)
  }

  // A concept was deleted on the canvas (cy node already removed by NeedleGraph).
  // Sync state, trash it on disk, and push a restore command (Ctrl+Z brings it
  // back with its content from .telar/trash and re-threads its neighbours).
  const handleDeleteConcept = (
    id: string,
    pos: { x: number; y: number } | null,
    edges: GraphEdge[],
  ) => {
    const node = graphStateRef.current?.nodos.find((n) => n.id === id) ?? null
    setGraph((g) =>
      g
        ? {
            ...g,
            nodos: g.nodos.filter((n) => n.id !== id),
            aristas: g.aristas.filter((e) => e.de !== id && e.a !== id),
          }
        : g,
    )
    void api.deleteConcept(id)
    if (!node) return
    undo.push({
      label: `delete "${node.nombre}"`,
      undo: async () => {
        await api.restoreConcept(id).catch(() => {})
        addConceptToView(node, pos, edges)
      },
      redo: async () => {
        await api.deleteConcept(id).catch(() => {})
        removeConceptFromView(id)
      },
    })
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-hairline px-8 py-4">
        <div className="flex items-baseline gap-4">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Telar</h1>
          <p className="text-sm text-muted">Concept graph</p>
        </div>
        <div className="flex items-center gap-5">
          {graph && (
            <p className="hidden font-mono text-xs text-muted sm:block">
              {graph.nodos.length} concepts · {graph.aristas.length} threads
            </p>
          )}
          <Link
            to="/errors"
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-linen-bright px-3 py-1.5 text-[13px] text-muted transition-colors hover:bg-linen-raw hover:text-ink"
          >
            <ClockCounterClockwise size={14} weight="bold" aria-hidden />
            Mistakes
          </Link>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-hairline bg-linen-bright px-3 py-1.5 text-[13px] text-muted transition-colors hover:bg-linen-raw hover:text-ink"
          >
            <MagnifyingGlass size={14} weight="bold" aria-hidden />
            Search concepts
            <kbd className="ml-1">Ctrl K</kbd>
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-burgundy px-3 py-1.5 text-[13px] font-medium text-linen-bright transition-colors hover:bg-burgundy-deep active:scale-[0.98]"
          >
            <Plus size={14} weight="bold" aria-hidden />
            Add concept
          </button>
        </div>
      </header>

      <main className="relative flex-1">
        {error ? (
          <ErrorState message={error} />
        ) : !graph || !stickies || !positions || !arrows || !frames ? (
          <Loading />
        ) : graph.nodos.length === 0 ? (
          <EmptyState
            title="The linen is bare."
            hint="Start a learning project to pin the first concept."
          />
        ) : (
          <>
            <NeedleGraph
              ref={graphRef}
              graph={graph}
              stickies={stickies}
              arrows={arrows}
              frames={frames}
              positions={positions}
              onOpen={(id) => navigate(`/concept/${id}/lessons`)}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onDeleteConcept={handleDeleteConcept}
              undo={undo}
            />
            <Legend />
            <SearchCommand
              graph={graph}
              open={searchOpen}
              onOpenChange={setSearchOpen}
              onLocate={(id) => graphRef.current?.centerOn(id)}
            />
          </>
        )}
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-ink/10 bg-ink/90 px-4 py-2 text-[13px] font-medium text-linen-bright shadow-lg"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <NewConceptDialog open={addOpen} onOpenChange={setAddOpen} onCreated={handleConceptCreated} />
    </div>
  )
}
