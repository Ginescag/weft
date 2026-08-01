import type {
  ConceptDetail,
  ContentFolder,
  ErrorSource,
  FlashcardsFile,
  Flecha,
  Graph,
  GraphNode,
  Marco,
  MarcoConMiembros,
  RelationType,
  ResolvedError,
  Sticky,
  TestsFile,
} from './types'
import { mockApi } from './mockApi'
import { httpApi } from './httpApi'

/**
 * Client contract mirroring the future `telar serve` HTTP API 1:1.
 * Swapping the mock for a fetch-based client must not touch any screen.
 */
export interface TelarApi {
  /** GET /api/graph */
  getGraph(): Promise<Graph>
  /** GET /api/concept/:id — meta + file listings per folder */
  getConcept(id: string): Promise<ConceptDetail>
  /** GET /api/concept/:id/:folder/:file — raw markdown */
  getFile(id: string, folder: ContentFolder, file: string): Promise<string>
  /** URL of GET /api/concept/:id/:folder/:file/raw — the raw bytes of a study
   *  document (PDF) in lessons/examples, for an <iframe> viewer or download.
   *  A plain address (no fetch); the browser loads the bytes itself. */
  fileUrl(id: string, folder: ContentFolder, file: string): string
  /** GET /api/concept/:id/tests */
  getTests(id: string): Promise<TestsFile>
  /** GET /api/concept/:id/flashcards */
  getFlashcards(id: string): Promise<FlashcardsFile>
  /** POST /api/concept/:id/notes */
  createNote(id: string, title: string, body: string): Promise<{ file: string }>
  /** PUT /api/concept/:id/notes/:file — overwrite a note's markdown body */
  saveNote(id: string, file: string, body: string): Promise<void>
  /** GET /api/concept/:id/challenges/:file/solution */
  getSolution(id: string, challengeFile: string): Promise<string | null>
  /** POST /api/concept/:id/challenges/:file/solution */
  saveSolution(id: string, challengeFile: string, body: string): Promise<void>
  /** POST /api/concepts — scaffold a concept folder, return its graph node */
  createConcept(nombre: string, resumen: string): Promise<GraphNode>
  /** POST /api/concept/:id/relations — append to the concept's .meta relaciones.
   *  `relation.id` is the prerequisite (requiere) or related concept, matching
   *  the on-disk semantics: a concept's relaciones list what it depends on. */
  addRelation(id: string, relation: { id: string; tipo: RelationType }): Promise<void>
  /** GET /api/errors — every recorded mistake across the project, resolved
   *  with the solution that was given and sorted newest-first. */
  getErrors(): Promise<ResolvedError[]>
  /** POST /api/concept/:id/errors — append a mistake to the concept's
   *  .errorlog (`fecha` is filled in server-side). */
  logError(id: string, error: { fuente: ErrorSource; itemId: string; nota?: string }): Promise<void>
  /** DELETE /api/concept/:id/relations/:target — drop `target` from the
   *  concept's .meta relaciones (the inverse of addRelation). Idempotent. */
  removeRelation(id: string, target: string): Promise<void>
  /** GET /api/stickies — the canvas sticky-note annotations. */
  getStickies(): Promise<Sticky[]>
  /** POST /api/stickies — pin a new sticky, returns it with its id. */
  createSticky(data: Omit<Sticky, 'id'>): Promise<Sticky>
  /** PUT /api/stickies/:id — patch a sticky (text, color, position, size). */
  updateSticky(id: string, patch: Partial<Omit<Sticky, 'id'>>): Promise<void>
  /** DELETE /api/stickies/:id. Idempotent. */
  deleteSticky(id: string): Promise<void>
  /** GET /api/arrows — roadmap arrow annotations (free canvas objects). */
  getArrows(): Promise<Flecha[]>
  /** POST /api/arrows — add a roadmap arrow, returns it with its id. */
  createArrow(data: Omit<Flecha, 'id'>): Promise<Flecha>
  /** PUT /api/arrows/:id — patch an arrow (endpoints, color, width). */
  updateArrow(id: string, patch: Partial<Omit<Flecha, 'id'>>): Promise<void>
  /** DELETE /api/arrows/:id. Idempotent. */
  deleteArrow(id: string): Promise<void>
  /** GET /api/frames — canvas frames (regions), each with its derived `miembros`
   *  (the concept ids whose saved position falls inside the frame's rect). */
  getFrames(): Promise<MarcoConMiembros[]>
  /** POST /api/frames — add a frame, returns it with its id. */
  createFrame(data: Omit<Marco, 'id'>): Promise<Marco>
  /** PUT /api/frames/:id — patch a frame (name, color, position, size). */
  updateFrame(id: string, patch: Partial<Omit<Marco, 'id'>>): Promise<void>
  /** DELETE /api/frames/:id. Idempotent. */
  deleteFrame(id: string): Promise<void>
  /** GET /api/layout — saved needle positions (empty on a fresh project). */
  getLayout(): Promise<Record<string, { x: number; y: number }>>
  /** PUT /api/layout — persist the full needle-position map. */
  saveLayout(posiciones: Record<string, { x: number; y: number }>): Promise<void>
}

// The real HTTP backend is the default; `VITE_API_MOCK=1` keeps the offline mock
// (fixtures + localStorage) available for demos or working without a server.
export const api: TelarApi = import.meta.env.VITE_API_MOCK === '1' ? mockApi : httpApi
