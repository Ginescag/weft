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
 *  hex — the UI offers a free colour wheel plus those four as quick swatches. */
export type StickyColor = string

/** A sticky note pinned on the graph canvas (n8n-style annotation).
 *  Position/size are graph (model) coordinates. `titulo` is the big header in
 *  the note's tab; `texto` is the optional body underneath. */
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

/** A frame ("marco") — a named, bounded region drawn on the graph canvas that
 *  encapsulates a subgraph. Unlike a sticky (a decorative filled label), a frame
 *  is a structural container: new concepts are placed inside its rect and the AI
 *  keeps their relations within it. Position (`x`,`y` = centre) and size are
 *  graph (model) coordinates; `color` is a hex tint for its border/fill.
 *  Stored in .telar/frames.json — real user data, not a derived cache. */
export interface Marco {
  id: string
  nombre: string
  x: number
  y: number
  ancho: number
  alto: number
  color: string
}

/** A frame as read back from the API: the stored `Marco` plus its `miembros` —
 *  the ids of the concepts whose saved position falls inside the frame's rect.
 *  Membership is DERIVED by containment (never stored), so dragging a needle in
 *  or out of a frame just works and no concept `.meta` is touched. */
export interface MarcoConMiembros extends Marco {
  miembros: string[]
}

/** Where a recorded mistake came from (.errorlog `fuente`). */
export type ErrorSource = 'test' | 'challenge'

/** One recorded mistake from a concept's .errorlog, resolved by the backend for
 *  the timeline: joined with its concept and the solution that was given — the
 *  correct option (+ explicacion) for a test, the saved solution for a challenge. */
export interface ResolvedError {
  conceptId: string
  conceptNombre: string
  fuente: ErrorSource
  itemId: string
  /** ISO date, "YYYY-MM-DD". */
  fecha: string
  /** Optional free-text note (e.g. the wrong answer or what tripped them up). */
  nota?: string
  /** Human-readable label of the failed item: the question text or challenge title. */
  titulo: string
  /** The solution that was given, or null when none is available. */
  solucion: string | null
  /** Test errors only: why the correct option is correct. */
  explicacion?: string
}
