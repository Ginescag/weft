// Mirror of frontend/src/lib/types.ts — if you touch one, touch the other.
// (A shared workspace would remove the duplication; kept copied for now to
// avoid adding build complexity. These ~60 lines are stable — see BACKEND_PLAN §5.)
//
// Data keys are Spanish to match the on-disk formats defined in TELAR_PLAN.md
// (.meta, .errorlog, graph.json, tests.json, flashcard.json). UI and code are English.

export type RelationType = 'requiere' | 'relacionado_con'

export interface GraphNode {
  id: string
  nombre: string
  ruta: string
  /** One-or-two sentence summary, surfaced in the hover card and search.
   *  Forward extension of graph.json, derived from a `resumen` field in .meta. */
  resumen: string
}

export interface GraphEdge {
  de: string
  a: string
  tipo: RelationType
}

export interface Graph {
  nodos: GraphNode[]
  aristas: GraphEdge[]
}

export type ContentFolder = 'lessons' | 'examples' | 'challenges' | 'notes'

export interface ConceptDetail {
  id: string
  nombre: string
  files: Record<ContentFolder, string[]>
}

export interface TestQuestion {
  id: string
  enunciado: string
  opciones: string[]
  correcta: number
  explicacion: string
}

export interface TestsFile {
  preguntas: TestQuestion[]
}

export interface Flashcard {
  id: string
  anverso: string
  reverso: string
}

export interface FlashcardsFile {
  tarjetas: Flashcard[]
}

/** A sticky note's colour: a hex string ("#rrggbb"). The four legacy preset
 *  names ('sand'|'moss'|'sky'|'rose') are still tolerated on read and mapped to
 *  hex — the UI now offers a free colour wheel plus those four as quick swatches. */
export type StickyColor = string

/** A sticky note pinned on the graph canvas (n8n-style annotation), stored in
 *  .telar/stickies.json. Position/size are graph (model) coordinates.
 *  `titulo` is the big header shown in the note's tab; `texto` is the optional
 *  body underneath (older files without `titulo` read back as ''). */
export interface Sticky {
  id: string
  titulo: string
  texto: string
  color: StickyColor
  x: number
  y: number
  ancho: number
  alto: number
}

/** .telar/stickies.json — user annotations, real data (not a derived cache). */
export interface StickiesFile {
  stickies: Sticky[]
}

/** A free-floating "roadmap" arrow drawn on the graph canvas — a canvas
 *  annotation like a sticky (NOT a concept relation). Endpoints (x1,y1)→(x2,y2)
 *  are graph (model) coordinates; `ancho` is the stroke width; `color` is hex. */
export interface Flecha {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  ancho: number
}

/** .telar/arrows.json — roadmap arrow annotations, real data (not a cache). */
export interface ArrowsFile {
  flechas: Flecha[]
}

/** .telar/layout.json — saved needle positions so the canvas is stable across
 *  loads (a prerequisite for stickies to mark meaningful regions). */
export interface LayoutFile {
  posiciones: Record<string, { x: number; y: number }>
}

// --- On-disk shapes the backend reads/writes (no frontend counterpart) ------

/** A concept's .meta file. `relaciones` lists this concept's prerequisites. */
export interface ConceptMeta {
  id: string
  nombre: string
  resumen: string
  relaciones: { id: string; tipo: RelationType }[]
}

/** Where a recorded mistake came from. Extend as new practice modes land. */
export type ErrorSource = 'test' | 'challenge'

/** One recorded mistake: which item the learner got wrong, and when. */
export interface ErrorEntry {
  fuente: ErrorSource
  itemId: string
  /** ISO date, "YYYY-MM-DD". */
  fecha: string
  /** Optional free-text note (e.g. the wrong answer or what tripped them up). */
  nota?: string
}

/** A concept's .errorlog file. Absent/empty defaults to { errores: [] }.
 *  Replaces the old .progress model; the future spaced-repetition engine reads
 *  from here (BACKEND_PLAN §4). */
export interface ErrorLog {
  errores: ErrorEntry[]
}

/** One recorded mistake resolved for display: joined with the concept it
 *  belongs to and the solution that was given — the correct option (+
 *  explicacion) from tests.json for a test error, the learner's saved solution
 *  for a challenge error. What the errors timeline renders directly. */
export interface ResolvedError extends ErrorEntry {
  conceptId: string
  conceptNombre: string
  /** Human-readable label of the failed item: the question text or challenge title. */
  titulo: string
  /** The solution that was given, or null when none is available. */
  solucion: string | null
  /** Test errors only: why the correct option is correct. */
  explicacion?: string
}
