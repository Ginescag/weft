import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react'
import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import edgehandles from 'cytoscape-edgehandles'
import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowRight,
  BoundingBox,
  CornersOut,
  FlowArrow,
  Minus,
  NoteBlank,
  Plus,
  Scissors,
} from '@phosphor-icons/react'
import { api } from '../lib/api'
import type { Flecha, Graph, GraphEdge, Marco, RelationType, Sticky, StickyColor } from '../lib/types'

cytoscape.use(fcose)
cytoscape.use(edgehandles)

type EdgeHandlesInstance = ReturnType<cytoscape.Core['edgehandles']>

const BURGUNDY = '#7a2e3a'
// Every needle looks the same now (no per-concept state); the rim stays a quiet
// neutral so burgundy is spent only on the thread.
const NEEDLE_RING = '#8b8177'

const MIN_ZOOM = 0.08
const MAX_ZOOM = 2.5
const ZOOM_STEP = 1.25
const FIT_PADDING = 80

// Sticky notes: quiet linen pastels, offered as quick swatches beside the free
// colour wheel. Legacy files stored these by name; new ones store hex directly.
const LEGACY_TINT: Record<string, string> = {
  sand: '#EAE0BF',
  moss: '#DCE4D3',
  sky: '#D9E0E6',
  rose: '#EAD9D6',
}
const PRESET_TINTS = [LEGACY_TINT.sand, LEGACY_TINT.moss, LEGACY_TINT.sky, LEGACY_TINT.rose]
/** A stored colour (hex, or a legacy preset name) → a concrete hex to paint. */
const colorToHex = (c: string): string =>
  c && c.startsWith('#') ? c : (LEGACY_TINT[c] ?? LEGACY_TINT.sand)

/** A stored colour → an rgba() string with the given alpha — for the faint fills
 *  and borders of a frame region, where the same hue serves line and wash. */
function hexAlpha(c: string, a: number): string {
  const h = colorToHex(c)
  const r = parseInt(h.slice(1, 3), 16)
  const g = parseInt(h.slice(3, 5), 16)
  const b = parseInt(h.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

// Free corner-resize clamps — kept in sync with the server's cleanSize.
const STICKY_MIN = 100
const STICKY_MAX = 6000
const STICKY_DEFAULT = { ancho: 260, alto: 170 }

// Frames (regions): named containers that encapsulate a subgraph. Bigger clamps
// than a sticky — a frame can wrap a whole subgraph. Mirrors the server.
const FRAME_MIN = 200
const FRAME_MAX = 40000
const FRAME_DEFAULT_COLOR = BURGUNDY

// Roadmap arrows: free-floating canvas annotations. Thick by default so they
// read as a "roadmap" over the regions; width clamps mirror the server.
const ARROW_MIN_W = 3
const ARROW_DEFAULT_W = 16
const ARROW_DEFAULT_COLOR = BURGUNDY

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Sticky cy-ids are prefixed so they can never collide with a concept id. */
const stickyCyId = (id: string) => `sticky:${id}`

/** The cy node is only an invisible hit-box (drag / select / resize target);
 *  the note's visuals live as HTML in the underlay beneath the canvas. */
function stickyNodeData(s: Sticky) {
  return { id: stickyCyId(s.id), stickyId: s.id, sticky: 1, ancho: s.ancho, alto: s.alto }
}

/** Title/body font sizes grow with the note so a big region marker reads from
 *  afar and a small aside stays quiet. */
function stickyFonts(s: { ancho: number; alto: number }) {
  const base = Math.min(s.ancho, s.alto * 1.6)
  const title = Math.round(clamp(base * 0.11, 14, 46))
  const body = Math.round(clamp(base * 0.062, 11, 26))
  return { title, body, tab: Math.round(title * 1.9) }
}

/** Frame cy-ids are prefixed so they can never collide with a concept id. */
const frameCyId = (id: string) => `frame:${id}`

/** The cy node is only an invisible hit-box (drag / select / resize target);
 *  the visible frame lives as HTML in the underlay, behind the stickies. */
function frameNodeData(m: Marco) {
  return { id: frameCyId(m.id), frameId: m.id, frame: 1, ancho: m.ancho, alto: m.alto }
}

/** A frame's title grows with the frame — these regions are big, so the label is
 *  big too — and its dashed border thickens with size so it reads at any zoom. */
function frameTitleFont(m: { ancho: number; alto: number }) {
  const base = Math.min(m.ancho, m.alto * 1.6)
  const title = Math.round(clamp(base * 0.09, 24, 260))
  const border = Math.round(clamp(Math.min(m.ancho, m.alto) * 0.006, 3, 64))
  return { title, border }
}

/**
 * The aerial view of the linen: each concept is the head of a pinned needle,
 * drawn as a crisp SVG (metallic disc, visible eye, muted rim), joined by taut
 * burgundy thread — solid for `requiere`, dashed for `relacionado_con`.
 */

/** A needle head seen from above: metal disc, highlight, eye slot, muted rim.
 *  The explicit width/height set the raster size Cytoscape caches: without
 *  them browsers rasterize the SVG at a tiny default and every zoom scales
 *  that blurry bitmap. 320px covers the largest node at max zoom on hidpi. */
function needleHeadSvg(ring: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 64 64">
  <defs>
    <radialGradient id="metal" cx="40%" cy="34%" r="78%">
      <stop offset="0%" stop-color="#fdfbf6"/>
      <stop offset="42%" stop-color="#efe8d9"/>
      <stop offset="78%" stop-color="#cdc3b0"/>
      <stop offset="100%" stop-color="#bcb2a0"/>
    </radialGradient>
    <radialGradient id="hl" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.6)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
    <linearGradient id="eye" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#857a68"/>
      <stop offset="55%" stop-color="#a89d8a"/>
      <stop offset="100%" stop-color="#c9bfad"/>
    </linearGradient>
  </defs>
  <circle cx="32" cy="32" r="24.5" fill="url(#metal)"/>
  <ellipse cx="23" cy="19" rx="13" ry="9" fill="url(#hl)"/>
  <circle cx="32" cy="32" r="24.5" fill="none" stroke="rgba(42,36,32,0.28)" stroke-width="1"/>
  <rect x="28.6" y="21" width="6.8" height="22" rx="3.4" fill="url(#eye)" stroke="rgba(42,36,32,0.35)" stroke-width="0.8"/>
  <circle cx="32" cy="32" r="28.5" fill="none" stroke="${ring}" stroke-width="4"/>
</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const NEEDLE = needleHeadSvg(NEEDLE_RING)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STYLE: any[] = [
  {
    selector: 'node',
    style: {
      width: 52,
      height: 52,
      shape: 'ellipse',
      'background-opacity': 0,
      'background-image': NEEDLE,
      'background-fit': 'cover',
      'border-width': 0,
      label: 'data(nombre)',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 10,
      'font-family': 'Geist, Helvetica Neue, sans-serif',
      'font-size': 13,
      'font-weight': 500,
      color: '#2a2420',
      'text-background-color': '#f8f4ec',
      'text-background-opacity': 0.85,
      'text-background-shape': 'roundrectangle',
      'text-background-padding': 3,
      'overlay-opacity': 0,
      'transition-property': 'width height opacity',
      'transition-duration': '150ms',
    },
  },
  {
    // A sticky note's cy node is only an invisible hit-box (it drags, selects
    // and anchors the resize grip). The visible note is HTML in the underlay,
    // painted beneath the whole canvas — always under needles and threads.
    selector: 'node.sticky',
    style: {
      shape: 'round-rectangle',
      width: 'data(ancho)',
      height: 'data(alto)',
      'background-image': 'none',
      'background-opacity': 0,
      'border-width': 0,
      label: '',
      'z-compound-depth': 'bottom',
    },
  },
  {
    // A frame's cy node is likewise just an invisible hit-box; the visible
    // region is HTML in the underlay, painted furthest back (under stickies too).
    selector: 'node.frame',
    style: {
      shape: 'round-rectangle',
      width: 'data(ancho)',
      height: 'data(alto)',
      'background-image': 'none',
      'background-opacity': 0,
      'border-width': 0,
      label: '',
      'z-compound-depth': 'bottom',
    },
  },
  {
    selector: 'edge',
    style: {
      width: 2,
      'curve-style': 'straight',
      'line-color': BURGUNDY,
      'line-cap': 'round',
      'target-arrow-shape': 'none',
      'overlay-opacity': 0,
      'transition-property': 'opacity',
      'transition-duration': '150ms',
    },
  },
  {
    // Strong relation is directed: the thread runs prerequisite -> dependent,
    // so the arrow marks the concept it unlocks.
    selector: 'edge[tipo = "requiere"]',
    style: {
      'target-arrow-shape': 'triangle-backcurve',
      'target-arrow-color': BURGUNDY,
      'arrow-scale': 0.9,
      'target-distance-from-node': 2,
    },
  },
  {
    selector: 'edge[tipo = "relacionado_con"]',
    style: {
      width: 1.5,
      'line-style': 'dashed',
      'line-dash-pattern': [6, 6],
      'line-opacity': 0.7,
    },
  },
  // Hover emphasis: the pointed needle grows, its threads pull tight,
  // everything else recedes into the linen.
  { selector: 'node.hovered', style: { width: 58, height: 58 } },
  { selector: 'edge.thread-active', style: { width: 3 } },
  { selector: '.dimmed', style: { opacity: 0.25 } },
  // Box selection (Shift+drag): selected needles/stickies get a quiet burgundy
  // halo; a selected thread thickens and darkens, ready to be cut.
  {
    selector: 'node:selected',
    style: { 'overlay-color': BURGUNDY, 'overlay-opacity': 0.14, 'overlay-padding': 8 },
  },
  {
    selector: 'edge:selected',
    style: { width: 3.5, 'line-color': '#5C1F2A', 'line-opacity': 1 },
  },
  // Search landing pulse.
  {
    selector: 'node.found',
    style: { 'overlay-color': BURGUNDY, 'overlay-opacity': 0.14, 'overlay-padding': 10 },
  },
  // Edge drawing (edgehandles): the loose thread stretching from a needle.
  {
    selector: '.eh-ghost-edge',
    style: {
      width: 2,
      'curve-style': 'straight',
      'line-color': BURGUNDY,
      'line-style': 'dashed',
      'line-dash-pattern': [6, 6],
      opacity: 0.75,
      'target-arrow-shape': 'triangle-backcurve',
      'target-arrow-color': BURGUNDY,
      'arrow-scale': 0.9,
    },
  },
  { selector: '.eh-ghost-edge.eh-preview-active', style: { opacity: 0 } },
  {
    selector: 'edge.eh-preview',
    style: {
      width: 2.5,
      'curve-style': 'straight',
      'line-color': BURGUNDY,
      'target-arrow-shape': 'triangle-backcurve',
      'target-arrow-color': BURGUNDY,
      'arrow-scale': 0.9,
      'target-distance-from-node': 2,
    },
  },
  { selector: 'node.eh-ghost-node', style: { opacity: 0, label: '' } },
  { selector: 'node.eh-source', style: { width: 58, height: 58 } },
  {
    selector: 'node.eh-presumptive-target, node.eh-target, node.eh-hover',
    style: { 'overlay-color': BURGUNDY, 'overlay-opacity': 0.12, 'overlay-padding': 8 },
  },
  // A drawn thread waiting for its type in the confirm popover.
  {
    selector: 'edge.pending-thread',
    style: {
      'line-style': 'dashed',
      'line-dash-pattern': [6, 6],
      opacity: 0.65,
      'target-arrow-shape': 'triangle-backcurve',
      'target-arrow-color': BURGUNDY,
      'arrow-scale': 0.9,
      'target-distance-from-node': 2,
    },
  },
]

/** One-time load animation: threads draw in as if pulled taut. */
function tightenThreads(cy: cytoscape.Core) {
  cy.edges().forEach((edge, i) => {
    const from = edge.sourceEndpoint()
    const to = edge.targetEndpoint()
    const length = Math.hypot(to.x - from.x, to.y - from.y) || 1
    const dashed = edge.data('tipo') === 'relacionado_con'
    const finalOpacity = dashed ? 0.7 : 1

    edge.style({
      'line-style': 'dashed',
      'line-dash-pattern': [length, length],
      'line-dash-offset': length,
      'line-opacity': finalOpacity,
    })

    edge.delay(150 + i * 90).animate(
      { style: { 'line-dash-offset': 0 } },
      {
        duration: 650,
        easing: 'ease-out-cubic',
        complete: () => {
          // Restore the resting style of each thread type.
          edge.removeStyle('line-style line-dash-pattern line-dash-offset line-opacity')
        },
      },
    )
  })
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export interface NeedleGraphHandle {
  centerOn: (id: string) => void
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
}

interface HoverInfo {
  nombre: string
  resumen: string
  x: number
  y: number
  below: boolean
}

/** A user-drawn thread waiting for its relation type. */
interface PendingThread {
  edgeId: string
  de: string
  a: string
  deNombre: string
  aNombre: string
  x: number
  y: number
}

/** A tapped thread waiting on its cut popover. */
interface EdgeMenu {
  edgeId: string
  deNombre: string
  aNombre: string
  x: number
  y: number
}

/** The sticky being edited in the dialog (size is edited on-canvas). */
interface StickyEditState {
  id: string
  titulo: string
  texto: string
  color: StickyColor
}

/** The frame being edited in the dialog (position/size are edited on-canvas). */
interface FrameEditState {
  id: string
  nombre: string
  color: string
}

interface NeedleGraphProps {
  graph: Graph
  /** Sticky annotations at mount; later changes are made on-canvas. */
  stickies: Sticky[]
  /** Roadmap-arrow annotations at mount; later changes are made on-canvas. */
  arrows: Flecha[]
  /** Frame (region) annotations at mount; later changes are made on-canvas. */
  frames: Marco[]
  /** Saved needle positions at mount; empty means "never laid out". */
  positions: Record<string, { x: number; y: number }>
  onOpen: (id: string) => void
  /** A drawn thread was confirmed; the parent persists it and lifts it into state. */
  onConnect: (edge: GraphEdge) => void
  /** A thread was cut on the canvas; the parent persists the removal. */
  onDisconnect: (edge: GraphEdge) => void
  ref?: Ref<NeedleGraphHandle>
}

/** Imperative smooth-zoom controller, created alongside the cy instance. */
interface SmoothZoom {
  /** Multiply the target zoom by `factor`, gliding toward it (anchor defaults to viewport centre). */
  zoomBy: (factor: number, anchor?: { x: number; y: number }) => void
  /** Abort the glide (before fit / centerOn animations take the viewport). */
  cancel: () => void
}

/**
 * Wheel zoom that glides instead of stepping: wheel ticks move a *target*
 * level and a rAF loop eases the real zoom toward it, anchored at the cursor.
 */
function createSmoothZoom(cy: cytoscape.Core, container: HTMLElement): SmoothZoom & { destroy: () => void } {
  const state = {
    target: cy.zoom(),
    anchor: { x: cy.width() / 2, y: cy.height() / 2 },
    raf: 0,
    last: 0,
  }

  const step = (now: number) => {
    const dt = state.last ? Math.min(now - state.last, 64) : 16
    state.last = now
    const current = cy.zoom()
    // Exponential ease with ~90ms time constant: fast to react, soft to land.
    const alpha = 1 - Math.exp(-dt / 90)
    const next = current + (state.target - current) * alpha
    if (Math.abs(state.target - next) < state.target * 0.001) {
      cy.zoom({ level: state.target, renderedPosition: state.anchor })
      state.raf = 0
      state.last = 0
      return
    }
    cy.zoom({ level: next, renderedPosition: state.anchor })
    state.raf = requestAnimationFrame(step)
  }

  const zoomBy = (factor: number, anchor?: { x: number; y: number }) => {
    cy.stop() // take over from any fit/centre animation in flight
    if (!state.raf) state.target = cy.zoom() // resync after external viewport changes
    state.target = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.target * factor))
    state.anchor = anchor ?? { x: cy.width() / 2, y: cy.height() / 2 }
    if (prefersReducedMotion()) {
      cancel()
      cy.zoom({ level: state.target, renderedPosition: state.anchor })
      return
    }
    if (!state.raf) {
      state.last = 0
      state.raf = requestAnimationFrame(step)
    }
  }

  const cancel = () => {
    if (state.raf) cancelAnimationFrame(state.raf)
    state.raf = 0
    state.last = 0
  }

  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    const rect = container.getBoundingClientRect()
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
    // Trackpad pinch arrives as ctrl+wheel with small deltas; give it more gain.
    const gain = event.ctrlKey ? 0.008 : 0.0022
    zoomBy(Math.exp(-delta * gain), { x: event.clientX - rect.left, y: event.clientY - rect.top })
  }
  container.addEventListener('wheel', onWheel, { passive: false })

  return {
    zoomBy,
    cancel,
    destroy: () => {
      cancel()
      container.removeEventListener('wheel', onWheel)
    },
  }
}

export default function NeedleGraph({
  graph,
  stickies,
  arrows,
  frames,
  positions,
  onOpen,
  onConnect,
  onDisconnect,
  ref,
}: NeedleGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)
  const smoothRef = useRef<SmoothZoom | null>(null)
  const ehRef = useRef<EdgeHandlesInstance | null>(null)
  const foundTimeout = useRef<number | undefined>(undefined)
  const layoutTimer = useRef<number | undefined>(undefined)
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen
  const onConnectRef = useRef(onConnect)
  onConnectRef.current = onConnect
  const onDisconnectRef = useRef(onDisconnect)
  onDisconnectRef.current = onDisconnect
  // The cy instance is built once from the graph at mount; later prop changes
  // are applied incrementally by the grow-only diff effect below. Stickies and
  // saved positions are mount-time seeds too — afterwards the canvas owns them.
  const initialGraph = useRef(graph)
  const initialStickies = useRef(stickies)
  const initialArrows = useRef(arrows)
  const initialFrames = useRef(frames)
  const initialPositions = useRef(positions)
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const [drawMode, setDrawMode] = useState(false)
  const drawModeRef = useRef(false)
  // Frame generator: a draw mode where a drag rubber-bands the frame's rectangle.
  const [frameDraw, setFrameDraw] = useState(false)
  const frameDrawRef = useRef(false)
  // The in-progress rubber-band rectangle, in container-local screen px.
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const drawStartRef = useRef<{ x: number; y: number } | null>(null)
  const [pending, setPending] = useState<PendingThread | null>(null)
  const pendingRef = useRef<PendingThread | null>(null)
  const [edgeMenu, setEdgeMenu] = useState<EdgeMenu | null>(null)
  const [stickyEdit, setStickyEdit] = useState<StickyEditState | null>(null)
  // The canvas owns sticky state after mount: cy holds the hit-boxes, this
  // list drives the HTML underlay, and every mutation patches both.
  const [stickyList, setStickyList] = useState<Sticky[]>(initialStickies.current)
  const stickyListRef = useRef(stickyList)
  stickyListRef.current = stickyList
  const stickyDivs = useRef(new Map<string, HTMLDivElement>())
  // Frames own the same canvas-state pattern: cy holds the hit-box, this list
  // drives the HTML underlay (painted behind stickies), every mutation patches both.
  const [frameList, setFrameList] = useState<Marco[]>(initialFrames.current)
  const frameListRef = useRef(frameList)
  frameListRef.current = frameList
  const frameDivs = useRef(new Map<string, HTMLDivElement>())
  const [frameEdit, setFrameEdit] = useState<FrameEditState | null>(null)
  // A frame drag tows the needles/stickies inside it: captured at grab time.
  const frameDragRef = useRef<{
    fx0: number
    fy0: number
    members: { node: cytoscape.NodeSingular; x: number; y: number }[]
  } | null>(null)
  // Roadmap arrows: free canvas objects. The underlay paints the lines (model
  // coords); their drag handles are screen-space DOM above the canvas.
  const [arrowList, setArrowList] = useState<Flecha[]>(initialArrows.current)
  const arrowListRef = useRef(arrowList)
  arrowListRef.current = arrowList
  const [arrowEdit, setArrowEdit] = useState<Flecha | null>(null)
  const [selectedArrow, setSelectedArrow] = useState<string | null>(null)
  const selectedArrowRef = useRef<string | null>(null)
  selectedArrowRef.current = selectedArrow
  const arrowHandleDivs = useRef(new Map<string, HTMLDivElement>())
  const arrowDragRef = useRef<{
    id: string
    kind: 'a' | 'b' | 'move'
    mx: number
    my: number
    x1: number
    y1: number
    x2: number
    y2: number
  } | null>(null)
  const underlayRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<HTMLDivElement>(null)
  // The corner grip resizes a sticky OR a frame; the target carries which.
  type ResizeTarget = { kind: 'sticky' | 'frame'; id: string }
  const [resizeTarget, setResizeTarget] = useState<ResizeTarget | null>(null)
  const resizeTargetRef = useRef<ResizeTarget | null>(null)
  const overHandleRef = useRef(false)
  const hideHandleTimer = useRef<number | undefined>(undefined)
  const resizingRef = useRef<{
    id: string
    kind: 'sticky' | 'frame'
    mx: number
    my: number
    x: number
    y: number
    ancho: number
    alto: number
  } | null>(null)
  const reduceMotion = useReducedMotion()

  const patchSticky = (id: string, patch: Partial<Sticky>) => {
    setStickyList((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const patchArrow = (id: string, patch: Partial<Flecha>) => {
    setArrowList((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  const patchFrame = (id: string, patch: Partial<Marco>) => {
    setFrameList((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  /** The prefixed cy id of a resize target (sticky or frame). */
  const resizeCyId = (t: ResizeTarget) => (t.kind === 'sticky' ? stickyCyId(t.id) : frameCyId(t.id))

  /** Pin the resize grip to the bottom-right corner of its sticky/frame, in screen px. */
  const syncResizeHandle = () => {
    const cy = cyRef.current
    const el = handleRef.current
    const t = resizeTargetRef.current
    if (!cy || cy.destroyed() || !el || !t) return
    const node = cy.getElementById(resizeCyId(t))
    if (node.empty()) return
    const zoom = cy.zoom()
    const p = (node as cytoscape.NodeSingular).renderedPosition()
    el.style.left = `${p.x + ((node.data('ancho') as number) / 2) * zoom}px`
    el.style.top = `${p.y + ((node.data('alto') as number) / 2) * zoom}px`
  }

  /** Pin each arrow's drag handles (endpoints + midpoint mover) in screen px,
   *  computed from its model endpoints via the cy pan/zoom transform. */
  const syncArrows = () => {
    const cy = cyRef.current
    if (!cy || cy.destroyed()) return
    const pan = cy.pan()
    const zoom = cy.zoom()
    const place = (key: string, mx: number, my: number) => {
      const el = arrowHandleDivs.current.get(key)
      if (!el) return
      el.style.left = `${pan.x + mx * zoom}px`
      el.style.top = `${pan.y + my * zoom}px`
    }
    for (const f of arrowListRef.current) {
      place(`${f.id}:a`, f.x1, f.y1)
      place(`${f.id}:b`, f.x2, f.y2)
      place(`${f.id}:move`, (f.x1 + f.x2) / 2, (f.y1 + f.y2) / 2)
    }
  }

  /** Keep the HTML underlay glued to the cy viewport (model → screen). */
  const syncUnderlay = () => {
    const cy = cyRef.current
    const el = underlayRef.current
    if (!cy || cy.destroyed() || !el) return
    const pan = cy.pan()
    el.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${cy.zoom()})`
    syncResizeHandle()
    syncArrows()
  }

  const showResizeHandle = (target: ResizeTarget) => {
    window.clearTimeout(hideHandleTimer.current)
    resizeTargetRef.current = target
    setResizeTarget(target)
  }

  /** Hide the grip shortly after the pointer leaves sticky and grip alike. */
  const hideResizeHandleSoon = () => {
    window.clearTimeout(hideHandleTimer.current)
    hideHandleTimer.current = window.setTimeout(() => {
      if (resizingRef.current || overHandleRef.current) return
      resizeTargetRef.current = null
      setResizeTarget(null)
    }, 250)
  }

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const cy = cyRef.current
    const t = resizeTargetRef.current
    if (!cy || cy.destroyed() || !t) return
    const node = cy.getElementById(resizeCyId(t))
    if (node.empty()) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const p = (node as cytoscape.NodeSingular).position()
    resizingRef.current = {
      id: t.id,
      kind: t.kind,
      mx: event.clientX,
      my: event.clientY,
      x: p.x,
      y: p.y,
      ancho: node.data('ancho') as number,
      alto: node.data('alto') as number,
    }
  }

  const moveResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const r = resizingRef.current
    const cy = cyRef.current
    if (!r || !cy || cy.destroyed()) return
    const node = cy.getElementById(r.kind === 'sticky' ? stickyCyId(r.id) : frameCyId(r.id))
    if (node.empty()) return
    const zoom = cy.zoom()
    const lo = r.kind === 'sticky' ? STICKY_MIN : FRAME_MIN
    const hi = r.kind === 'sticky' ? STICKY_MAX : FRAME_MAX
    // Anchor the top-left corner: the centre shifts by half the size delta.
    const ancho = Math.round(clamp(r.ancho + (event.clientX - r.mx) / zoom, lo, hi))
    const alto = Math.round(clamp(r.alto + (event.clientY - r.my) / zoom, lo, hi))
    const x = Math.round(r.x + (ancho - r.ancho) / 2)
    const y = Math.round(r.y + (alto - r.alto) / 2)
    node.data({ ancho, alto })
    ;(node as cytoscape.NodeSingular).position({ x, y })
    if (r.kind === 'sticky') patchSticky(r.id, { ancho, alto, x, y })
    else patchFrame(r.id, { ancho, alto, x, y })
    syncResizeHandle()
  }

  const endResize = () => {
    const r = resizingRef.current
    resizingRef.current = null
    if (!r) return
    const cy = cyRef.current
    if (cy && !cy.destroyed()) {
      const node = cy.getElementById(r.kind === 'sticky' ? stickyCyId(r.id) : frameCyId(r.id))
      if (!node.empty()) {
        const p = (node as cytoscape.NodeSingular).position()
        const patch = {
          x: Math.round(p.x),
          y: Math.round(p.y),
          ancho: node.data('ancho') as number,
          alto: node.data('alto') as number,
        }
        const save = r.kind === 'sticky' ? api.updateSticky(r.id, patch) : api.updateFrame(r.id, patch)
        void save.catch(() => {})
      }
    }
    hideResizeHandleSoon()
  }

  // --- Roadmap arrows: drag their endpoints / move them, all in model coords --
  const startArrowDrag =
    (id: string, kind: 'a' | 'b' | 'move') => (event: ReactPointerEvent<HTMLDivElement>) => {
      const cy = cyRef.current
      const f = arrowListRef.current.find((a) => a.id === id)
      if (!cy || cy.destroyed() || !f) return
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      setSelectedArrow(id)
      arrowDragRef.current = { id, kind, mx: event.clientX, my: event.clientY, x1: f.x1, y1: f.y1, x2: f.x2, y2: f.y2 }
    }

  const moveArrowDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = arrowDragRef.current
    const cy = cyRef.current
    if (!d || !cy || cy.destroyed()) return
    const zoom = cy.zoom()
    const dx = (event.clientX - d.mx) / zoom
    const dy = (event.clientY - d.my) / zoom
    // patchArrow re-renders the underlay line; the layout effect re-pins handles.
    if (d.kind === 'a') patchArrow(d.id, { x1: Math.round(d.x1 + dx), y1: Math.round(d.y1 + dy) })
    else if (d.kind === 'b') patchArrow(d.id, { x2: Math.round(d.x2 + dx), y2: Math.round(d.y2 + dy) })
    else
      patchArrow(d.id, {
        x1: Math.round(d.x1 + dx),
        y1: Math.round(d.y1 + dy),
        x2: Math.round(d.x2 + dx),
        y2: Math.round(d.y2 + dy),
      })
  }

  const endArrowDrag = () => {
    const d = arrowDragRef.current
    arrowDragRef.current = null
    if (!d) return
    const f = arrowListRef.current.find((a) => a.id === d.id)
    if (f) void api.updateArrow(d.id, { x1: f.x1, y1: f.y1, x2: f.x2, y2: f.y2 }).catch(() => {})
  }

  /** Draw a fresh roadmap arrow across the middle of the viewport. */
  const addArrow = async () => {
    const cy = cyRef.current
    if (!cy) return
    const ext = cy.extent()
    const cx = Math.round((ext.x1 + ext.x2) / 2)
    const midY = Math.round((ext.y1 + ext.y2) / 2)
    const half = Math.max(120, Math.min(260, Math.round((ext.x2 - ext.x1) / 5)))
    try {
      const arrow = await api.createArrow({
        x1: cx - half,
        y1: midY,
        x2: cx + half,
        y2: midY,
        color: ARROW_DEFAULT_COLOR,
        ancho: ARROW_DEFAULT_W,
      })
      setArrowList((list) => [...list, arrow])
      setSelectedArrow(arrow.id)
    } catch {
      // Arrow creation failing quietly leaves the canvas intact.
    }
  }

  const saveArrowEdit = (next: Flecha) => {
    patchArrow(next.id, { color: next.color, ancho: next.ancho })
    setArrowEdit(null)
    void api.updateArrow(next.id, { color: next.color, ancho: next.ancho }).catch(() => {})
  }

  const deleteArrowById = (id: string) => {
    setArrowList((list) => list.filter((a) => a.id !== id))
    if (selectedArrowRef.current === id) setSelectedArrow(null)
    arrowHandleDivs.current.delete(`${id}:a`)
    arrowHandleDivs.current.delete(`${id}:b`)
    arrowHandleDivs.current.delete(`${id}:move`)
    void api.deleteArrow(id).catch(() => {})
  }

  const deleteArrowEdit = () => {
    const edit = arrowEdit
    setArrowEdit(null)
    if (edit) deleteArrowById(edit.id)
  }

  // --- Frame generator: drag a rectangle on the canvas to place a frame -------
  // "+ frame" toggles a draw mode; a drag on the overlay rubber-bands a rectangle
  // (any size, anywhere); on release it becomes a frame, then the title dialog opens.
  const exitFrameDraw = () => {
    frameDrawRef.current = false
    setFrameDraw(false)
    setDrawRect(null)
    drawStartRef.current = null
  }

  const toggleFrameDraw = () => {
    const next = !frameDrawRef.current
    if (!next) {
      exitFrameDraw()
      return
    }
    if (drawModeRef.current) toggleDrawMode() // frame-draw and thread-draw are exclusive
    setHover(null)
    frameDrawRef.current = true
    setFrameDraw(true)
  }

  /** clientX/Y → coordinates local to the canvas container. */
  const containerLocal = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) }
  }

  const startFrameDrawAt = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!frameDrawRef.current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const p = containerLocal(event.clientX, event.clientY)
    drawStartRef.current = p
    setDrawRect({ x: p.x, y: p.y, w: 0, h: 0 })
  }

  const moveFrameDraw = (event: ReactPointerEvent<HTMLDivElement>) => {
    const s = drawStartRef.current
    if (!s) return
    const p = containerLocal(event.clientX, event.clientY)
    setDrawRect({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    })
  }

  const endFrameDraw = async (event: ReactPointerEvent<HTMLDivElement>) => {
    const s = drawStartRef.current
    exitFrameDraw() // leave the mode whatever happens
    if (!s) return
    const cy = cyRef.current
    if (!cy) return
    const p = containerLocal(event.clientX, event.clientY)
    const rx = Math.min(s.x, p.x)
    const ry = Math.min(s.y, p.y)
    const rw = Math.abs(p.x - s.x)
    const rh = Math.abs(p.y - s.y)
    if (rw < 24 || rh < 24) return // a click, not a drag — no frame
    // Container-local screen rect → model rect (inverse of the underlay transform).
    const pan = cy.pan()
    const zoom = cy.zoom()
    const mx1 = (rx - pan.x) / zoom
    const my1 = (ry - pan.y) / zoom
    const ancho = Math.round(clamp(rw / zoom, FRAME_MIN, FRAME_MAX))
    const alto = Math.round(clamp(rh / zoom, FRAME_MIN, FRAME_MAX))
    const x = Math.round(mx1 + ancho / 2)
    const y = Math.round(my1 + alto / 2)
    try {
      const frame = await api.createFrame({ nombre: '', x, y, ancho, alto, color: FRAME_DEFAULT_COLOR })
      cy.add({
        group: 'nodes',
        data: frameNodeData(frame),
        position: { x: frame.x, y: frame.y },
        classes: 'frame',
      })
      setFrameList((list) => [...list, frame])
      setFrameEdit({ id: frame.id, nombre: frame.nombre, color: frame.color })
    } catch {
      // Frame creation failing quietly leaves the canvas intact.
    }
  }

  const saveFrameEdit = (next: FrameEditState) => {
    patchFrame(next.id, { nombre: next.nombre, color: next.color })
    setFrameEdit(null)
    void api.updateFrame(next.id, { nombre: next.nombre, color: next.color }).catch(() => {})
  }

  const deleteFrameNode = (node: cytoscape.NodeSingular) => {
    const id = node.data('frameId') as string
    node.remove()
    setFrameList((list) => list.filter((m) => m.id !== id))
    frameDivs.current.delete(id)
    if (resizeTargetRef.current?.kind === 'frame' && resizeTargetRef.current.id === id) {
      resizeTargetRef.current = null
      setResizeTarget(null)
    }
    void api.deleteFrame(id).catch(() => {})
  }

  const deleteFrameEdit = () => {
    const edit = frameEdit
    setFrameEdit(null)
    if (!edit) return
    const cy = cyRef.current
    if (cy) {
      const node = cy.getElementById(frameCyId(edit.id))
      if (!node.empty()) {
        deleteFrameNode(node as cytoscape.NodeSingular)
        return
      }
    }
    setFrameList((list) => list.filter((m) => m.id !== edit.id))
    void api.deleteFrame(edit.id).catch(() => {})
  }

  /** Debounced full-position save: the loom remembers where every needle sits. */
  const persistLayoutSoon = () => {
    window.clearTimeout(layoutTimer.current)
    layoutTimer.current = window.setTimeout(() => {
      const cy = cyRef.current
      if (!cy || cy.destroyed()) return
      const posiciones: Record<string, { x: number; y: number }> = {}
      cy.nodes('[!sticky][!frame]').forEach((n) => {
        if (n.hasClass('eh-ghost-node')) return
        const p = n.position()
        posiciones[n.id()] = { x: Math.round(p.x), y: Math.round(p.y) }
      })
      void api.saveLayout(posiciones).catch(() => {})
    }, 600)
  }

  /** Remove a thread from the canvas and hand the removal to the parent. */
  const cutEdge = (edge: cytoscape.EdgeSingular) => {
    const arista: GraphEdge = {
      de: edge.source().id(),
      a: edge.target().id(),
      tipo: edge.data('tipo') as RelationType,
    }
    edge.remove()
    onDisconnectRef.current(arista)
  }

  const cutEdgeFromMenu = () => {
    const menu = edgeMenu
    const cy = cyRef.current
    setEdgeMenu(null)
    if (!menu || !cy) return
    const edge = cy.getElementById(menu.edgeId)
    if (!edge.empty()) cutEdge(edge as cytoscape.EdgeSingular)
  }

  const deleteStickyNode = (node: cytoscape.NodeSingular) => {
    const id = node.data('stickyId') as string
    node.remove()
    setStickyList((list) => list.filter((s) => s.id !== id))
    if (resizeTargetRef.current?.kind === 'sticky' && resizeTargetRef.current.id === id) {
      resizeTargetRef.current = null
      setResizeTarget(null)
    }
    void api.deleteSticky(id).catch(() => {})
  }

  /** Pin a fresh sticky at the viewport centre and open its editor. */
  const addSticky = async () => {
    const cy = cyRef.current
    if (!cy) return
    const ext = cy.extent()
    try {
      const sticky = await api.createSticky({
        titulo: '',
        texto: '',
        color: 'sand',
        x: Math.round((ext.x1 + ext.x2) / 2),
        y: Math.round((ext.y1 + ext.y2) / 2),
        ancho: STICKY_DEFAULT.ancho,
        alto: STICKY_DEFAULT.alto,
      })
      cy.add({
        group: 'nodes',
        data: stickyNodeData(sticky),
        position: { x: sticky.x, y: sticky.y },
        classes: 'sticky',
      })
      setStickyList((list) => [...list, sticky])
      setStickyEdit({
        id: sticky.id,
        titulo: sticky.titulo,
        texto: sticky.texto,
        color: sticky.color,
      })
    } catch {
      // Annotation creation failing quietly leaves the canvas intact.
    }
  }

  const saveStickyEdit = (next: StickyEditState) => {
    patchSticky(next.id, { titulo: next.titulo, texto: next.texto, color: next.color })
    setStickyEdit(null)
    void api
      .updateSticky(next.id, { titulo: next.titulo, texto: next.texto, color: next.color })
      .catch(() => {})
  }

  const deleteStickyEdit = () => {
    const edit = stickyEdit
    setStickyEdit(null)
    if (!edit) return
    const cy = cyRef.current
    if (cy) {
      const node = cy.getElementById(stickyCyId(edit.id))
      if (!node.empty()) {
        deleteStickyNode(node as cytoscape.NodeSingular)
        return
      }
    }
    setStickyList((list) => list.filter((s) => s.id !== edit.id))
    void api.deleteSticky(edit.id).catch(() => {})
  }

  /** Remove an undecided thread (Esc, background tap, pan, or a new draw). */
  const cancelPending = () => {
    const p = pendingRef.current
    if (!p) return
    const cy = cyRef.current
    if (cy) {
      const edge = cy.getElementById(p.edgeId)
      if (!edge.empty()) edge.remove()
    }
    pendingRef.current = null
    setPending(null)
  }

  const confirmPending = (tipo: RelationType) => {
    const p = pendingRef.current
    const cy = cyRef.current
    if (!p || !cy) return
    const edge = cy.getElementById(p.edgeId)
    if (!edge.empty()) {
      edge.data('tipo', tipo)
      edge.removeClass('pending-thread')
    }
    pendingRef.current = null
    setPending(null)
    onConnectRef.current({ de: p.de, a: p.a, tipo })
  }

  const toggleDrawMode = () => {
    const next = !drawModeRef.current
    drawModeRef.current = next
    setDrawMode(next)
    setHover(null)
    if (next) {
      if (frameDrawRef.current) exitFrameDraw() // the two draw modes are exclusive
      ehRef.current?.enableDrawMode()
    } else {
      ehRef.current?.disableDrawMode()
      cancelPending()
    }
  }

  const fitView = () => {
    const cy = cyRef.current
    if (!cy) return
    smoothRef.current?.cancel()
    if (prefersReducedMotion()) {
      cy.fit(cy.elements(), FIT_PADDING)
      return
    }
    cy.stop().animate(
      { fit: { eles: cy.elements(), padding: FIT_PADDING } },
      { duration: 350, easing: 'ease-in-out-cubic' },
    )
  }

  useImperativeHandle(ref, () => ({
    zoomIn: () => smoothRef.current?.zoomBy(ZOOM_STEP),
    zoomOut: () => smoothRef.current?.zoomBy(1 / ZOOM_STEP),
    fit: fitView,
    centerOn: (id: string) => {
      const cy = cyRef.current
      if (!cy) return
      const node = cy.getElementById(id)
      if (node.empty()) return
      smoothRef.current?.cancel()
      const pulse = () => {
        node.addClass('found')
        window.clearTimeout(foundTimeout.current)
        foundTimeout.current = window.setTimeout(() => node.removeClass('found'), 1400)
      }
      const zoom = Math.max(cy.zoom(), 1.3)
      if (prefersReducedMotion()) {
        cy.zoom(zoom)
        cy.center(node)
        pulse()
        return
      }
      cy.stop().animate(
        { center: { eles: node }, zoom },
        { duration: 450, easing: 'ease-in-out-cubic', complete: pulse },
      )
    },
  }))

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const initial = initialGraph.current

    const saved = initialPositions.current
    const cy = cytoscape({
      container,
      elements: [
        ...initial.nodos.map((n) => ({
          data: { id: n.id, nombre: n.nombre, resumen: n.resumen },
          ...(saved[n.id] ? { position: { x: saved[n.id].x, y: saved[n.id].y } } : {}),
        })),
        ...initial.aristas.map((e) => ({
          data: { id: `${e.de}->${e.a}`, source: e.de, target: e.a, tipo: e.tipo },
        })),
        ...initialStickies.current.map((s) => ({
          data: stickyNodeData(s),
          position: { x: s.x, y: s.y },
          classes: 'sticky',
        })),
        ...initialFrames.current.map((m) => ({
          data: frameNodeData(m),
          position: { x: m.x, y: m.y },
          classes: 'frame',
        })),
      ],
      style: STYLE,
      // Positions come from .telar/layout.json (preset); fcose only weaves the
      // very first layout below — never re-shuffling stickies or saved needles.
      layout: { name: 'preset' },
      // Shift+drag draws a selection box; needles, stickies and threads select.
      boxSelectionEnabled: true,
      autounselectify: false,
      // Native wheel zoom steps discretely; the smooth-zoom controller below
      // replaces it with an eased glide anchored at the cursor.
      userZoomingEnabled: false,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
    })
    cyRef.current = cy

    // First load ever: weave the initial layout with fcose (needles + threads
    // only), then remember it so every later load is stable. With a saved
    // layout, only needles that appeared since the last save need a spot.
    const needles = cy.nodes('[!sticky][!frame]')
    const unplaced = needles.filter((n) => saved[n.id()] === undefined)
    if (needles.length > 0 && unplaced.length === needles.length) {
      needles
        .union(cy.edges())
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .layout({ name: 'fcose', animate: false, idealEdgeLength: 170, nodeRepulsion: 14000, padding: FIT_PADDING } as any)
        .run()
    } else if (unplaced.length > 0) {
      // New needles with no saved spot (e.g. an AI batch that skipped set_positions):
      // lay them out in a grid to the RIGHT of the existing weave, not on top of it,
      // so a fresh subgraph never buries an old one. (Framed batches are placed
      // server-side; this is the fallback for unframed ones.)
      const placed = needles.difference(unplaced)
      const bb = placed.boundingBox()
      const startX = bb.x2 + 320
      const cols = Math.max(1, Math.round(Math.sqrt(unplaced.length)))
      unplaced.forEach((n, i) => {
        n.position({
          x: startX + (i % cols) * 200,
          y: bb.y1 + Math.floor(i / cols) * 160,
        })
      })
    }
    cy.fit(cy.elements(), FIT_PADDING)
    if (needles.length > 0) persistLayoutSoon()

    // The HTML underlay tracks the viewport; sticky hit-boxes tow their notes.
    cy.on('pan zoom resize', syncUnderlay)
    cy.on('position', 'node.sticky', (event) => {
      const node = event.target as cytoscape.NodeSingular
      const div = stickyDivs.current.get(node.data('stickyId') as string)
      if (div) {
        const p = node.position()
        div.style.left = `${p.x - (node.data('ancho') as number) / 2}px`
        div.style.top = `${p.y - (node.data('alto') as number) / 2}px`
      }
      syncResizeHandle()
    })
    cy.on('position', 'node.frame', (event) => {
      const node = event.target as cytoscape.NodeSingular
      const div = frameDivs.current.get(node.data('frameId') as string)
      if (div) {
        const p = node.position()
        div.style.left = `${p.x - (node.data('ancho') as number) / 2}px`
        div.style.top = `${p.y - (node.data('alto') as number) / 2}px`
      }
      syncResizeHandle()
    })

    // Moving a frame tows everything inside it. Capture the members (needles +
    // stickies whose centre is inside the rect) at grab time, then translate them
    // by the frame's delta as it drags — encapsulation you can feel.
    cy.on('grab', 'node.frame', (event) => {
      const frame = event.target as cytoscape.NodeSingular
      const p = frame.position()
      const halfW = (frame.data('ancho') as number) / 2
      const halfH = (frame.data('alto') as number) / 2
      const x1 = p.x - halfW
      const x2 = p.x + halfW
      const y1 = p.y - halfH
      const y2 = p.y + halfH
      const members = cy
        .nodes('[!frame]')
        .filter((n) => {
          const q = (n as cytoscape.NodeSingular).position()
          return q.x >= x1 && q.x <= x2 && q.y >= y1 && q.y <= y2
        })
        .map((n) => {
          const node = n as cytoscape.NodeSingular
          const q = node.position()
          return { node, x: q.x, y: q.y }
        })
      frameDragRef.current = { fx0: p.x, fy0: p.y, members }
    })
    cy.on('drag', 'node.frame', (event) => {
      const d = frameDragRef.current
      if (!d) return
      const p = (event.target as cytoscape.NodeSingular).position()
      const dx = p.x - d.fx0
      const dy = p.y - d.fy0
      d.members.forEach((m) => m.node.position({ x: m.x + dx, y: m.y + dy }))
    })
    cy.on('free', 'node.frame', (event) => {
      const frame = event.target as cytoscape.NodeSingular
      const d = frameDragRef.current
      frameDragRef.current = null
      const p = frame.position()
      const id = frame.data('frameId') as string
      patchFrame(id, { x: Math.round(p.x), y: Math.round(p.y) })
      void api.updateFrame(id, { x: Math.round(p.x), y: Math.round(p.y) }).catch(() => {})
      if (!d) return
      // Persist the towed needles (whole layout) and each towed sticky.
      persistLayoutSoon()
      d.members.forEach((m) => {
        if (!m.node.data('sticky')) return
        const sp = m.node.position()
        const sx = Math.round(sp.x)
        const sy = Math.round(sp.y)
        const sid = m.node.data('stickyId') as string
        patchSticky(sid, { x: sx, y: sy })
        void api.updateSticky(sid, { x: sx, y: sy }).catch(() => {})
      })
    })
    syncUnderlay()

    const smoothZoom = createSmoothZoom(cy, container)
    smoothRef.current = smoothZoom

    // Drag-to-connect: in draw mode the whole needle acts as the handle and
    // dragging stretches a loose thread toward the cursor.
    const eh = cy.edgehandles({
      canConnect: (source, target) =>
        !source.data('sticky') &&
        !target.data('sticky') &&
        !source.data('frame') &&
        !target.data('frame') &&
        !source.same(target) &&
        source.edgesWith(target).empty(),
      snap: true,
      snapThreshold: 28,
    })
    ehRef.current = eh

    // Threads are sewn between needles; a drag starting on a sticky is cancelled.
    cy.on('ehstart', (_event, ...extra) => {
      const [source] = extra as [cytoscape.NodeSingular]
      if (source.data('sticky') || source.data('frame')) eh.stop()
    })

    cy.on('ehcomplete', (_event, ...extra) => {
      const [source, target, added] = extra as [
        cytoscape.NodeSingular,
        cytoscape.NodeSingular,
        cytoscape.EdgeSingular,
      ]
      cancelPending() // one undecided thread at a time
      added.addClass('pending-thread')
      const mid = added.renderedMidpoint()
      const info: PendingThread = {
        edgeId: added.id(),
        de: source.id(),
        a: target.id(),
        deNombre: source.data('nombre') as string,
        aNombre: target.data('nombre') as string,
        x: Math.min(Math.max(mid.x, 130), Math.max(container.clientWidth - 130, 130)),
        y: Math.min(Math.max(mid.y, 60), Math.max(container.clientHeight - 150, 60)),
      }
      pendingRef.current = info
      setPending(info)
    })

    cy.on('tap', 'node', (event) => {
      if (drawModeRef.current) return // taps draw threads, they do not navigate
      // Stickies and frames select and drag, nothing more — they never navigate.
      if (event.target.data('sticky') || event.target.data('frame')) return
      onOpenRef.current(event.target.id())
    })
    cy.on('tap', (event) => {
      if (event.target === cy) {
        cancelPending() // background tap discards the popovers
        setEdgeMenu(null)
        setSelectedArrow(null)
      }
    })

    // Tap a thread → the cut popover at its midpoint (Supr cuts all selected).
    cy.on('tap', 'edge', (event) => {
      if (drawModeRef.current) return
      const edge = event.target as cytoscape.EdgeSingular
      if (edge.hasClass('pending-thread') || edge.hasClass('eh-ghost-edge') || edge.hasClass('eh-preview'))
        return
      const mid = edge.renderedMidpoint()
      setEdgeMenu({
        edgeId: edge.id(),
        deNombre: edge.source().data('nombre') as string,
        aNombre: edge.target().data('nombre') as string,
        x: Math.min(Math.max(mid.x, 130), Math.max(container.clientWidth - 130, 130)),
        y: Math.min(Math.max(mid.y, 60), Math.max(container.clientHeight - 150, 60)),
      })
    })

    // Double-tap a sticky to edit it.
    cy.on('dbltap', 'node.sticky', (event) => {
      const id = event.target.data('stickyId') as string
      const s = stickyListRef.current.find((st) => st.id === id)
      if (s) setStickyEdit({ id: s.id, titulo: s.titulo, texto: s.texto, color: s.color })
    })

    // Double-tap a frame to edit its title / colour.
    cy.on('dbltap', 'node.frame', (event) => {
      const id = event.target.data('frameId') as string
      const m = frameListRef.current.find((fr) => fr.id === id)
      if (m) setFrameEdit({ id: m.id, nombre: m.nombre, color: m.color })
    })

    // Dropped needles re-save the whole layout; a dropped sticky saves itself
    // (dragfreeon covers elements dragged along inside a box selection). Frames
    // persist through their own grab/drag/free handlers above, so exclude them.
    cy.on('dragfree dragfreeon', 'node[!sticky][!frame]', () => persistLayoutSoon())
    cy.on('dragfree dragfreeon', 'node.sticky', (event) => {
      const node = event.target as cytoscape.NodeSingular
      const p = node.position()
      const x = Math.round(p.x)
      const y = Math.round(p.y)
      patchSticky(node.data('stickyId') as string, { x, y })
      void api.updateSticky(node.data('stickyId') as string, { x, y }).catch(() => {})
    })

    cy.on('mouseover', 'node', (event) => {
      const node = event.target
      if (node.data('sticky')) {
        container.style.cursor = 'grab' // annotations drag; no hover card, no dimming
        showResizeHandle({ kind: 'sticky', id: node.data('stickyId') as string })
        return
      }
      if (node.data('frame')) {
        container.style.cursor = 'grab' // regions drag (towing contents); no hover card
        showResizeHandle({ kind: 'frame', id: node.data('frameId') as string })
        return
      }
      if (drawModeRef.current) {
        node.addClass('hovered') // grow as a drag affordance, keep the linen quiet
        return
      }
      container.style.cursor = 'pointer'
      node.addClass('hovered')
      cy.elements().not(node.closedNeighborhood()).addClass('dimmed')
      node.connectedEdges().addClass('thread-active')

      const pos = node.renderedPosition()
      const offset = node.renderedOuterHeight() / 2 + 12
      const below = pos.y - offset < 180
      setHover({
        nombre: node.data('nombre'),
        resumen: node.data('resumen') ?? '',
        x: Math.min(Math.max(pos.x, 150), Math.max(container.clientWidth - 150, 150)),
        y: below ? pos.y + offset : pos.y - offset,
        below,
      })
    })
    cy.on('mouseout', 'node', (event) => {
      container.style.cursor = ''
      if (event.target.data('sticky') || event.target.data('frame')) hideResizeHandleSoon()
      event.target.removeClass('hovered')
      cy.elements().removeClass('dimmed thread-active')
      setHover(null)
    })
    cy.on('pan zoom', () => {
      setHover(null)
      cancelPending() // its anchor point is stale once the viewport moves
      setEdgeMenu(null)
    })
    cy.on('grab', 'node', () => {
      setHover(null)
      setEdgeMenu(null)
    })

    if (!prefersReducedMotion() && cy.edges().length > 0) tightenThreads(cy)

    if (import.meta.env.DEV) {
      // Test hook: lets browser automation find node positions on the canvas.
      ;(window as unknown as { __cy?: cytoscape.Core }).__cy = cy
    }

    return () => {
      window.clearTimeout(foundTimeout.current)
      window.clearTimeout(layoutTimer.current)
      window.clearTimeout(hideHandleTimer.current)
      eh.destroy()
      ehRef.current = null
      smoothZoom.destroy()
      smoothRef.current = null
      cyRef.current = null
      cy.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- built once; later graph changes are diffed below
  }, [])

  // Grow-only diff: pin new concepts and thread new edges without re-running
  // the layout or replaying the load animation. Nothing is removed this phase.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    for (const n of graph.nodos) {
      if (!cy.getElementById(n.id).empty()) continue
      const ext = cy.extent()
      const node = cy.add({
        group: 'nodes',
        data: { id: n.id, nombre: n.nombre, resumen: n.resumen },
        // Pin it where the user is looking, with a little scatter.
        position: {
          x: (ext.x1 + ext.x2) / 2 + (Math.random() - 0.5) * 80,
          y: (ext.y1 + ext.y2) / 2 + (Math.random() - 0.5) * 80,
        },
      })
      node.addClass('found')
      window.setTimeout(() => {
        if (!cy.destroyed()) node.removeClass('found')
      }, 1400)
    }

    for (const e of graph.aristas) {
      const pair = cy.edges(`[source = "${e.de}"][target = "${e.a}"]`)
      if (pair.filter((edge) => edge.data('tipo') === e.tipo).nonempty()) continue
      if (cy.getElementById(e.de).empty() || cy.getElementById(e.a).empty()) continue
      cy.add({ group: 'edges', data: { source: e.de, target: e.a, tipo: e.tipo } })
    }
  }, [graph])

  // Esc backs out: popovers first, then draw mode. Supr/Backspace cuts every
  // selected thread and removes every selected sticky (never a concept).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEdgeMenu(null)
        setSelectedArrow(null)
        if (pendingRef.current) cancelPending()
        else if (drawModeRef.current) toggleDrawMode()
        else if (frameDrawRef.current) exitFrameDraw()
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const t = event.target
        if (
          t instanceof HTMLInputElement ||
          t instanceof HTMLTextAreaElement ||
          (t instanceof HTMLElement && t.isContentEditable)
        ) {
          return
        }
        const cy = cyRef.current
        if (!cy) return
        const edges = cy.edges(':selected').filter((e) => !e.hasClass('pending-thread'))
        if (edges.length > 0) setEdgeMenu(null)
        edges.forEach((e) => cutEdge(e))
        cy.nodes('.sticky:selected').forEach((n) => deleteStickyNode(n))
        cy.nodes('.frame:selected').forEach((n) => deleteFrameNode(n))
        if (selectedArrowRef.current) deleteArrowById(selectedArrowRef.current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers only touch refs
  }, [])

  // Re-glue the underlay after every render: it positions the resize grip the
  // moment it appears and re-applies the transform when the sticky list changes.
  useLayoutEffect(() => {
    syncUnderlay()
  })

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Sticky underlay: the visible notes, glued to the cy viewport but
          painted beneath the canvas so they always sit under the embroidery. */}
      <div
        ref={underlayRef}
        className="pointer-events-none absolute left-0 top-0"
        style={{ transformOrigin: '0 0', zIndex: 0 }}
      >
        {/* Frames first: painted furthest back, under stickies and needles alike. */}
        {frameList.map((m) => (
          <FrameRegion
            key={m.id}
            frame={m}
            divRef={(el) => {
              if (el) frameDivs.current.set(m.id, el)
              else frameDivs.current.delete(m.id)
            }}
          />
        ))}
        {stickyList.map((s) => (
          <StickyNote
            key={s.id}
            sticky={s}
            divRef={(el) => {
              if (el) stickyDivs.current.set(s.id, el)
              else stickyDivs.current.delete(s.id)
            }}
          />
        ))}
        {/* Roadmap arrows: drawn in model coords (the underlay is pan/zoom-scaled),
            so a thick stroke reads as a bold connector over the regions. */}
        <svg className="absolute left-0 top-0 overflow-visible" width={1} height={1} aria-hidden>
          {arrowList.map((f) => (
            <ArrowShape key={f.id} arrow={f} selected={selectedArrow === f.id} />
          ))}
        </svg>
      </div>

      {/* Sized in-flow (cytoscape overrides `position` inline, so inset-0 would
          collapse it); z-[5] keeps the canvas above the underlay. */}
      <div
        ref={containerRef}
        className={`relative z-[5] h-full w-full ${drawMode ? 'cursor-crosshair' : ''}`}
        aria-label="Concept graph"
      />

      {/* Frame generator: a full-canvas capture layer while in frame-draw mode.
          A drag rubber-bands the frame's rectangle; release places the frame. */}
      {frameDraw && (
        <div
          className="absolute inset-0 z-[6]"
          style={{ cursor: 'crosshair', touchAction: 'none' }}
          onPointerDown={startFrameDrawAt}
          onPointerMove={moveFrameDraw}
          onPointerUp={endFrameDraw}
          onPointerCancel={endFrameDraw}
          aria-label="Draw a frame"
        >
          {drawRect && (
            <div
              className="pointer-events-none absolute rounded-xl"
              style={{
                left: drawRect.x,
                top: drawRect.y,
                width: drawRect.w,
                height: drawRect.h,
                border: `2px dashed ${BURGUNDY}`,
                background: 'rgba(122,46,58,0.05)',
              }}
            />
          )}
        </div>
      )}

      {/* Corner grip: appears while hovering a sticky; dragging it resizes. */}
      {resizeTarget && (
        <div
          ref={handleRef}
          role="button"
          aria-label="Resize note or frame"
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onPointerEnter={() => {
            overHandleRef.current = true
            window.clearTimeout(hideHandleTimer.current)
          }}
          onPointerLeave={() => {
            overHandleRef.current = false
            hideResizeHandleSoon()
          }}
          className="absolute z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded border border-burgundy/70 bg-linen-bright"
          style={{ touchAction: 'none' }}
        />
      )}

      {/* Roadmap-arrow handles (screen-space, above the canvas): the two endpoints
          reshape the arrow; the mid dot moves it and double-click opens the editor. */}
      {arrowList.map((f) => {
        const setRef = (key: string) => (el: HTMLDivElement | null) => {
          if (el) arrowHandleDivs.current.set(key, el)
          else arrowHandleDivs.current.delete(key)
        }
        const endClass = `absolute z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 bg-linen-bright ${
          selectedArrow === f.id ? 'border-burgundy' : 'border-burgundy/60'
        }`
        return (
          <div key={f.id}>
            <div
              ref={setRef(`${f.id}:a`)}
              role="button"
              aria-label="Arrow start"
              onPointerDown={startArrowDrag(f.id, 'a')}
              onPointerMove={moveArrowDrag}
              onPointerUp={endArrowDrag}
              onPointerCancel={endArrowDrag}
              className={endClass}
              style={{ touchAction: 'none' }}
            />
            <div
              ref={setRef(`${f.id}:b`)}
              role="button"
              aria-label="Arrow end"
              onPointerDown={startArrowDrag(f.id, 'b')}
              onPointerMove={moveArrowDrag}
              onPointerUp={endArrowDrag}
              onPointerCancel={endArrowDrag}
              className={endClass}
              style={{ touchAction: 'none' }}
            />
            <div
              ref={setRef(`${f.id}:move`)}
              role="button"
              aria-label="Move arrow (double-click to edit)"
              title="Drag to move · double-click to edit"
              onPointerDown={startArrowDrag(f.id, 'move')}
              onPointerMove={moveArrowDrag}
              onPointerUp={endArrowDrag}
              onPointerCancel={endArrowDrag}
              onDoubleClick={() => setArrowEdit(f)}
              className="absolute z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border border-linen-bright bg-burgundy"
              style={{ touchAction: 'none' }}
            />
          </div>
        )
      })}

      {hover && (
        <div className="pointer-events-none absolute z-10" style={{ left: hover.x, top: hover.y }}>
          <div className={hover.below ? '-translate-x-1/2' : '-translate-x-1/2 -translate-y-full'}>
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: hover.below ? -4 : 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
              className="w-64 rounded-lg border border-hairline bg-linen-bright p-4"
              role="tooltip"
            >
              <p className="font-display text-base font-semibold tracking-tight">{hover.nombre}</p>
              {hover.resumen && <p className="mt-2 text-[13px] leading-snug text-muted">{hover.resumen}</p>}
            </motion.div>
          </div>
        </div>
      )}

      {pending && (
        <div className="absolute z-20" style={{ left: pending.x, top: pending.y }}>
          <div className="-translate-x-1/2 translate-y-3">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
              className="w-60 rounded-lg border border-hairline bg-linen-bright p-3"
              role="dialog"
              aria-label="Choose thread type"
            >
              <p className="truncate font-mono text-[11px] text-muted">
                {pending.deNombre} → {pending.aNombre}
              </p>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => confirmPending('requiere')}
                  className="flex-1 rounded-md bg-burgundy px-2.5 py-1.5 text-xs font-medium text-linen-bright transition-colors hover:bg-burgundy-deep active:scale-[0.98]"
                >
                  Unlocks
                </button>
                <button
                  type="button"
                  onClick={() => confirmPending('relacionado_con')}
                  className="flex-1 rounded-md border border-hairline px-2.5 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-linen-raw active:scale-[0.98]"
                >
                  Related
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-muted">
                Solid thread unlocks the target. Esc cancels.
              </p>
            </motion.div>
          </div>
        </div>
      )}

      {edgeMenu && (
        <div className="absolute z-20" style={{ left: edgeMenu.x, top: edgeMenu.y }}>
          <div className="-translate-x-1/2 translate-y-2">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
              className="w-56 rounded-lg border border-hairline bg-linen-bright p-3"
              role="dialog"
              aria-label="Thread options"
            >
              <p className="truncate font-mono text-[11px] text-muted">
                {edgeMenu.deNombre} → {edgeMenu.aNombre}
              </p>
              <button
                type="button"
                onClick={cutEdgeFromMenu}
                className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-burgundy px-2.5 py-1.5 text-xs font-medium text-linen-bright transition-colors hover:bg-burgundy-deep active:scale-[0.98]"
              >
                <Scissors size={13} weight="bold" aria-hidden />
                Cut thread
              </button>
              <p className="mt-2 text-[11px] leading-snug text-muted">
                Del cuts every selected thread. Esc closes.
              </p>
            </motion.div>
          </div>
        </div>
      )}

      <StickyDialog
        edit={stickyEdit}
        onClose={() => setStickyEdit(null)}
        onSave={saveStickyEdit}
        onDelete={deleteStickyEdit}
      />

      <FrameDialog
        edit={frameEdit}
        onClose={() => setFrameEdit(null)}
        onSave={saveFrameEdit}
        onDelete={deleteFrameEdit}
      />

      <ArrowDialog
        edit={arrowEdit}
        onClose={() => setArrowEdit(null)}
        onSave={saveArrowEdit}
        onDelete={deleteArrowEdit}
      />

      <div className="pointer-events-none absolute bottom-6 left-0 right-0 z-10 flex justify-center">
        <AnimatePresence>
          {drawMode && (
            <motion.p
              key="draw"
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="rounded-full border border-hairline bg-linen-bright px-4 py-2 text-xs text-muted"
            >
              Stretch a thread from one needle to another · <kbd>Esc</kbd> when done
            </motion.p>
          )}
          {frameDraw && (
            <motion.p
              key="frame"
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="rounded-full border border-hairline bg-linen-bright px-4 py-2 text-xs text-muted"
            >
              Drag to draw a frame around a subgraph · <kbd>Esc</kbd> to cancel
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="absolute bottom-6 right-6 z-10 flex flex-col gap-2">
        <button
          type="button"
          onClick={toggleFrameDraw}
          aria-label="Draw a frame (region)"
          aria-pressed={frameDraw}
          title="Draw a frame (region)"
          className={`rounded-md border p-2.5 transition-colors active:scale-[0.95] ${
            frameDraw
              ? 'border-burgundy bg-burgundy text-linen-bright hover:bg-burgundy-deep'
              : 'border-hairline bg-linen-bright text-muted hover:bg-linen-raw hover:text-ink'
          }`}
        >
          <BoundingBox size={15} weight="bold" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => void addSticky()}
          aria-label="Add sticky note"
          title="Add sticky note"
          className="rounded-md border border-hairline bg-linen-bright p-2.5 text-muted transition-colors hover:bg-linen-raw hover:text-ink active:scale-[0.95]"
        >
          <NoteBlank size={15} weight="bold" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => void addArrow()}
          aria-label="Add roadmap arrow"
          title="Add roadmap arrow"
          className="rounded-md border border-hairline bg-linen-bright p-2.5 text-muted transition-colors hover:bg-linen-raw hover:text-ink active:scale-[0.95]"
        >
          <ArrowRight size={15} weight="bold" aria-hidden />
        </button>
        <button
          type="button"
          onClick={toggleDrawMode}
          aria-label="Draw threads"
          aria-pressed={drawMode}
          title="Draw threads"
          className={`rounded-md border p-2.5 transition-colors active:scale-[0.95] ${
            drawMode
              ? 'border-burgundy bg-burgundy text-linen-bright hover:bg-burgundy-deep'
              : 'border-hairline bg-linen-bright text-muted hover:bg-linen-raw hover:text-ink'
          }`}
        >
          <FlowArrow size={15} weight="bold" aria-hidden />
        </button>
        <div className="flex flex-col divide-y divide-hairline overflow-hidden rounded-md border border-hairline bg-linen-bright">
          <button
            type="button"
            onClick={() => smoothRef.current?.zoomBy(ZOOM_STEP)}
            aria-label="Zoom in"
            className="p-2.5 text-muted transition-colors hover:bg-linen-raw hover:text-ink active:scale-[0.95]"
          >
            <Plus size={15} weight="bold" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => smoothRef.current?.zoomBy(1 / ZOOM_STEP)}
            aria-label="Zoom out"
            className="p-2.5 text-muted transition-colors hover:bg-linen-raw hover:text-ink active:scale-[0.95]"
          >
            <Minus size={15} weight="bold" aria-hidden />
          </button>
          <button
            type="button"
            onClick={fitView}
            aria-label="Fit graph to view"
            className="p-2.5 text-muted transition-colors hover:bg-linen-raw hover:text-ink active:scale-[0.95]"
          >
            <CornersOut size={15} weight="bold" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}

/** The visible note: a folder-style tab holding the big title, the optional
 *  body below. Rendered in model coordinates inside the pan/zoom underlay;
 *  interaction (drag, select, dbltap, resize) happens on its cy hit-box. */
function StickyNote({
  sticky,
  divRef,
}: {
  sticky: Sticky
  divRef: (el: HTMLDivElement | null) => void
}) {
  const tint = colorToHex(sticky.color)
  const fonts = stickyFonts(sticky)
  // ?? '' shields against version skew (an old server answering without titulo):
  // a malformed note must degrade to body-only, never crash the whole canvas.
  const hasTitle = (sticky.titulo ?? '').trim() !== ''
  const border = '1.5px solid rgba(42,36,32,0.18)'
  return (
    <div
      ref={divRef}
      data-sticky-note={sticky.id}
      style={{
        position: 'absolute',
        left: sticky.x - sticky.ancho / 2,
        top: sticky.y - sticky.alto / 2,
        width: sticky.ancho,
        height: sticky.alto,
        userSelect: 'none',
      }}
    >
      {hasTitle && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            maxWidth: '82%',
            height: fonts.tab,
            display: 'flex',
            alignItems: 'center',
            padding: `0 ${Math.round(fonts.title * 0.55)}px`,
            background: tint,
            border,
            borderBottom: 'none',
            borderRadius: '10px 10px 0 0',
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: fonts.title,
            letterSpacing: '-0.01em',
            color: '#2a2420',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{sticky.titulo}</span>
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: hasTitle ? fonts.tab : 0,
          bottom: 0,
          background: tint,
          border,
          borderRadius: hasTitle ? '0 10px 10px 10px' : 10,
          padding: Math.round(fonts.body * 0.8),
          fontFamily: 'var(--font-sans)',
          fontSize: fonts.body,
          lineHeight: 1.45,
          color: 'rgba(42,36,32,0.78)',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          overflow: 'hidden',
        }}
      >
        {sticky.texto}
      </div>
    </div>
  )
}

/** The visible frame: a bordered, faintly washed region with a folder-style
 *  title tab. Rendered in model coords in the underlay, furthest back; its cy
 *  hit-box handles drag (towing contents), select, resize and dbltap-edit. */
function FrameRegion({
  frame,
  divRef,
}: {
  frame: Marco
  divRef: (el: HTMLDivElement | null) => void
}) {
  const { title, border } = frameTitleFont(frame)
  const hasTitle = (frame.nombre ?? '').trim() !== ''
  const line = hexAlpha(frame.color, 0.75)
  const ink = colorToHex(frame.color)
  return (
    <div
      ref={divRef}
      data-frame-region={frame.id}
      style={{
        position: 'absolute',
        left: frame.x - frame.ancho / 2,
        top: frame.y - frame.alto / 2,
        width: frame.ancho,
        height: frame.alto,
        // No fill — just a dashed outline (the border thickens with the frame so
        // it stays visible when the region is framed from far out).
        border: `${border}px dashed ${line}`,
        borderRadius: Math.max(16, border * 2.5),
        background: 'transparent',
        userSelect: 'none',
        boxSizing: 'border-box',
      }}
    >
      {hasTitle && (
        <div
          style={{
            position: 'absolute',
            left: Math.round(title * 0.42),
            top: Math.round(title * 0.32),
            maxWidth: '92%',
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: title,
            lineHeight: 1.02,
            letterSpacing: '-0.02em',
            color: ink,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {frame.nombre}
        </div>
      )}
    </div>
  )
}

/** Edit a sticky: its title, body text and tint — or unpin it from the linen.
 *  Size is edited on the canvas by dragging the note's corner grip. */
function StickyDialog({
  edit,
  onClose,
  onSave,
  onDelete,
}: {
  edit: StickyEditState | null
  onClose: () => void
  onSave: (next: StickyEditState) => void
  onDelete: () => void
}) {
  const [titulo, setTitulo] = useState('')
  const [texto, setTexto] = useState('')
  const [color, setColor] = useState<StickyColor>('sand')

  // Seed the fields each time a sticky opens.
  useEffect(() => {
    if (!edit) return
    setTitulo(edit.titulo)
    setTexto(edit.texto)
    setColor(edit.color)
  }, [edit])

  const save = () => {
    if (!edit) return
    onSave({ id: edit.id, titulo, texto, color })
  }

  return (
    <Dialog.Root open={edit !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/25" />
        <Dialog.Content className="fixed left-1/2 top-1/3 z-50 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-hairline bg-linen-bright p-6 focus:outline-none">
          <Dialog.Title className="font-display text-lg font-semibold tracking-tight">
            Sticky note
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted">
            A big title with optional detail, pinned under the needles. Drag the note's
            corner on the canvas to resize it.
          </Dialog.Description>

          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            autoFocus
            spellCheck={false}
            aria-label="Sticky title"
            placeholder="Title"
            className="mt-4 w-full rounded-md border border-hairline bg-linen px-3.5 py-2.5 font-display text-xl font-semibold tracking-tight text-ink outline-none transition-colors placeholder:text-muted focus:border-burgundy/50"
          />

          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            spellCheck={false}
            aria-label="Sticky text"
            placeholder="Optional text — what does this corner of the graph hold?"
            className="mt-3 min-h-[96px] w-full resize-y rounded-md border border-hairline bg-linen px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-burgundy/50"
          />

          <div className="mt-4">
            <ColorField value={color} onChange={setColor} />
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md px-3 py-2 text-sm font-medium text-burgundy transition-colors hover:bg-burgundy/10 active:scale-[0.98]"
            >
              Unpin note
            </button>
            <div className="flex gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-md border border-hairline px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-linen-raw active:scale-[0.98]"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={save}
                className="rounded-md bg-burgundy px-4 py-2 text-sm font-medium text-linen-bright transition-colors hover:bg-burgundy-deep active:scale-[0.98]"
              >
                Done
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Edit a frame: its title and colour, or remove it. Position and size are edited
 *  on the canvas (drag to move — towing its contents — and the corner grip to resize). */
function FrameDialog({
  edit,
  onClose,
  onSave,
  onDelete,
}: {
  edit: FrameEditState | null
  onClose: () => void
  onSave: (next: FrameEditState) => void
  onDelete: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [color, setColor] = useState<string>(FRAME_DEFAULT_COLOR)

  useEffect(() => {
    if (!edit) return
    setNombre(edit.nombre)
    setColor(edit.color)
  }, [edit])

  const save = () => {
    if (!edit) return
    onSave({ id: edit.id, nombre, color })
  }

  return (
    <Dialog.Root open={edit !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/25" />
        <Dialog.Content className="fixed left-1/2 top-1/3 z-50 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-hairline bg-linen-bright p-6 focus:outline-none">
          <Dialog.Title className="font-display text-lg font-semibold tracking-tight">
            Frame
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted">
            A named region that groups a subgraph. Drag it on the canvas to move it (its
            contents come along); drag the corner to resize.
          </Dialog.Description>

          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
            spellCheck={false}
            aria-label="Frame title"
            placeholder="Title"
            className="mt-4 w-full rounded-md border border-hairline bg-linen px-3.5 py-2.5 font-display text-xl font-semibold tracking-tight text-ink outline-none transition-colors placeholder:text-muted focus:border-burgundy/50"
          />

          <div className="mt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Colour</p>
            <ColorField value={color} onChange={setColor} />
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md px-3 py-2 text-sm font-medium text-burgundy transition-colors hover:bg-burgundy/10 active:scale-[0.98]"
            >
              Remove frame
            </button>
            <div className="flex gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-md border border-hairline px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-linen-raw active:scale-[0.98]"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={save}
                className="rounded-md bg-burgundy px-4 py-2 text-sm font-medium text-linen-bright transition-colors hover:bg-burgundy-deep active:scale-[0.98]"
              >
                Done
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Colour picker shared by stickies and arrows: four quick preset swatches plus
 *  a free colour wheel (the native OS picker behind a rainbow chip). */
function ColorField({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const hex = colorToHex(value).toLowerCase()
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Colour">
      {PRESET_TINTS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Preset ${c}`}
          aria-pressed={hex === c.toLowerCase()}
          className={`h-7 w-7 rounded-full border transition-transform ${
            hex === c.toLowerCase() ? 'scale-110 border-ink/50' : 'border-ink/10 hover:scale-105'
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
      <label
        className="relative ml-1 h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-full border border-ink/15"
        title="Custom colour"
      >
        <span
          className="pointer-events-none absolute inset-0"
          style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
        />
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Custom colour"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  )
}

/** One roadmap arrow, drawn in model coordinates inside the pan/zoom underlay:
 *  a thick shaft plus a filled arrowhead, both in the arrow's colour. */
function ArrowShape({ arrow, selected }: { arrow: Flecha; selected: boolean }) {
  const { x1, y1, x2, y2, ancho } = arrow
  const color = colorToHex(arrow.color)
  const ang = Math.atan2(y2 - y1, x2 - x1)
  const head = Math.max(ancho * 2.4, 18)
  // End the shaft just short of the tip so it doesn't poke through the head.
  const ex = x2 - Math.cos(ang) * head * 0.6
  const ey = y2 - Math.sin(ang) * head * 0.6
  const hx1 = x2 + Math.cos(ang + Math.PI - 0.5) * head
  const hy1 = y2 + Math.sin(ang + Math.PI - 0.5) * head
  const hx2 = x2 + Math.cos(ang + Math.PI + 0.5) * head
  const hy2 = y2 + Math.sin(ang + Math.PI + 0.5) * head
  return (
    <g>
      {selected && (
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="#2a2420"
          strokeOpacity={0.16}
          strokeWidth={ancho + 10}
          strokeLinecap="round"
        />
      )}
      <line x1={x1} y1={y1} x2={ex} y2={ey} stroke={color} strokeWidth={ancho} strokeLinecap="round" />
      <path
        d={`M ${hx1} ${hy1} L ${x2} ${y2} L ${hx2} ${hy2} Z`}
        fill={color}
        stroke={color}
        strokeWidth={ancho * 0.5}
        strokeLinejoin="round"
      />
    </g>
  )
}

/** Edit a roadmap arrow: its colour and thickness, or remove it. */
function ArrowDialog({
  edit,
  onClose,
  onSave,
  onDelete,
}: {
  edit: Flecha | null
  onClose: () => void
  onSave: (next: Flecha) => void
  onDelete: () => void
}) {
  const [color, setColor] = useState<string>(ARROW_DEFAULT_COLOR)
  const [ancho, setAncho] = useState<number>(ARROW_DEFAULT_W)

  useEffect(() => {
    if (!edit) return
    setColor(edit.color)
    setAncho(edit.ancho)
  }, [edit])

  const save = () => {
    if (!edit) return
    onSave({ ...edit, color, ancho })
  }

  return (
    <Dialog.Root open={edit !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/25" />
        <Dialog.Content className="fixed left-1/2 top-1/3 z-50 w-[min(380px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-hairline bg-linen-bright p-6 focus:outline-none">
          <Dialog.Title className="font-display text-lg font-semibold tracking-tight">
            Roadmap arrow
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted">
            A free arrow drawn over the canvas. Drag its ends on the graph to aim it.
          </Dialog.Description>

          <div className="mt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Colour</p>
            <ColorField value={color} onChange={setColor} />
          </div>

          <div className="mt-4">
            <label className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted">
              <span>Thickness</span>
              <span className="font-mono lowercase text-ink">{ancho}px</span>
            </label>
            <input
              type="range"
              min={ARROW_MIN_W}
              max={80}
              value={ancho}
              onChange={(e) => setAncho(Number(e.target.value))}
              aria-label="Arrow thickness"
              className="w-full accent-burgundy"
            />
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md px-3 py-2 text-sm font-medium text-burgundy transition-colors hover:bg-burgundy/10 active:scale-[0.98]"
            >
              Remove arrow
            </button>
            <div className="flex gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-md border border-hairline px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-linen-raw active:scale-[0.98]"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={save}
                className="rounded-md bg-burgundy px-4 py-2 text-sm font-medium text-linen-bright transition-colors hover:bg-burgundy-deep active:scale-[0.98]"
              >
                Done
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
