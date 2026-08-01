// master.ts — the filesystem layer. Everything that reads or writes
// TELAR-MASTER/ lives here; it knows nothing about HTTP. api.ts stays thin and
// calls into this module (BACKEND_PLAN §5). Reads (F2) and writes (F5) both go
// through the shared helpers below: readJson for tolerant reads, writeFileAtomic
// for crash-safe writes, safeJoin against path traversal.

import { randomBytes } from 'node:crypto'
import type { Dirent } from 'node:fs'
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'
import type {
  ArrowsFile,
  ConceptDetail,
  ConceptMeta,
  ContentFolder,
  ErrorEntry,
  ErrorLog,
  ErrorSource,
  Flashcard,
  Flecha,
  FlashcardsFile,
  FramesFile,
  Graph,
  GraphNode,
  LayoutFile,
  Marco,
  MarcoConMiembros,
  RelationType,
  ResolvedError,
  StickiesFile,
  Sticky,
  StickyColor,
  TestQuestion,
  TestsFile,
} from './types.js'
import { regenerateGraph } from './graph.js'

// --- Errors -----------------------------------------------------------------
// A single error hierarchy carrying an HTTP status, so api.ts can translate any
// failure into the uniform `{ error }` response without knowing the details.

export type HttpErrorStatus = 400 | 404 | 501

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: HttpErrorStatus,
  ) {
    super(message)
    this.name = new.target.name
  }
}

/** The requested concept or file is not in the master. → 404 */
export class NotFound extends HttpError {
  constructor(message: string) {
    super(message, 404)
  }
}

/** The client sent bad data (empty title, unknown relation, escaped path). → 400 */
export class BadRequest extends HttpError {
  constructor(message: string) {
    super(message, 400)
  }
}

/** Placeholder for endpoints whose logic lands in a later phase. → 501 */
export class NotImplemented extends HttpError {
  constructor(message: string) {
    super(message, 501)
  }
}

// --- Constants --------------------------------------------------------------

/** The four content folders every concept can have. Also the getFile allowlist. */
export const CONTENT_FOLDERS: readonly ContentFolder[] = [
  'lessons',
  'examples',
  'challenges',
  'notes',
]

/** Challenge solutions live in this hidden subfolder so they never list as content. */
const SOLUTIONS_DIR = '.solutions'

/** What a lesson/example listing shows: prose (`.md`) plus study documents the
 *  user drops in (`.pdf`). Challenges and notes stay `.md`-only (they have edit
 *  and solution UIs that assume markdown). */
const DOC_EXTS = ['.md', '.pdf'] as const

/** Binary documents the raw route can stream, mapped to their Content-Type.
 *  Text (`.md`) is served as JSON via getFile; these bytes go out verbatim. */
const RAW_TYPES: Record<string, string> = { '.pdf': 'application/pdf' }

/** The four legacy preset tints, name → hex. Colours are now stored as free hex
 *  strings (a colour wheel in the UI); these names are only tolerated on read of
 *  older files and offered as quick swatches. */
const TINT_HEX: Record<string, string> = {
  sand: '#eae0bf',
  moss: '#dce4d3',
  sky: '#d9e0e6',
  rose: '#ead9d6',
}
const DEFAULT_TINT = TINT_HEX.sand

/** Sticky size clamps: free corner-resize, generous enough to frame a whole
 *  subgraph as a region — kept in sync with the frontend's STICKY_MAX. */
const STICKY_MIN = 100
const STICKY_MAX = 6000

/** Roadmap-arrow stroke-width clamps (model px). Thick by default, but bounded. */
const ARROW_MIN_W = 3
const ARROW_MAX_W = 240
/** An arrow with no colour given defaults to burgundy — the roadmap thread. */
const ARROW_DEFAULT_COLOR = '#7a2e3a'

/** Frame (region) size clamps: a frame is bigger than a sticky — it can wrap a
 *  whole subgraph as a labelled region. Kept in sync with the frontend. */
const FRAME_MIN = 200
const FRAME_MAX = 40000
/** A frame with no colour given defaults to a quiet burgundy tint. */
const FRAME_DEFAULT_COLOR = '#7a2e3a'

// --- Shared helpers (used across F2–F5) -------------------------------------

/**
 * Read and parse a JSON file, tolerating both "missing" and "empty" as the
 * given fallback (JSON.parse('') throws, so empty must be handled explicitly).
 * BACKEND_PLAN §8.2.
 */
export async function readJson<T>(path: string, fallback: T): Promise<T> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    return fallback // file does not exist
  }
  if (raw.trim() === '') return fallback // empty file
  return JSON.parse(raw) as T
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
// Transient rename failures worth retrying on Windows: the OS (or an antivirus /
// the search indexer) can briefly hold a handle on the destination, so an
// otherwise-valid atomic replace throws EPERM/EACCES/EBUSY for a few ms.
const TRANSIENT_RENAME = new Set(['EPERM', 'EACCES', 'EBUSY', 'EMFILE', 'ENFILE'])

/** One atomic write: unique temp file → rename over the target, retrying the
 *  rename through transient Windows/AV locks, cleaning the temp up on failure. */
async function writeFileAtomicOnce(path: string, data: string): Promise<void> {
  // A **unique** temp name per write so concurrent writers never share
  // `<path>.tmp` (which raced to ENOENT under a burst of sticky drags).
  const tmp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  try {
    await writeFile(tmp, data, 'utf8')
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(tmp, path)
        return
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code ?? ''
        if (attempt >= 9 || !TRANSIENT_RENAME.has(code)) throw err
        await delay(10 * (attempt + 1)) // 10,20,…,100ms backoff
      }
    }
  } catch (err) {
    await unlink(tmp).catch(() => {})
    throw err
  }
}

// A per-path promise chain: writes to the *same* file run strictly one after
// another. On Windows two renames racing onto the same existing target throw
// EPERM (the OS locks the destination during replace) — a burst of sticky drags
// or repeated graph.json regenerations used to hit exactly this. Writes to
// different files still run in parallel; the map self-cleans once a path drains.
const writeQueues = new Map<string, Promise<void>>()

/**
 * Write a file atomically and serialised per path: write to a unique temp file
 * then rename over the target. A crash mid-write leaves either the old file or
 * the new one, never a corrupt mix (rename is atomic on the same volume), and
 * concurrent writers to one file can neither collide nor be lost. BACKEND_PLAN §10.
 */
export function writeFileAtomic(path: string, data: string): Promise<void> {
  const prev = writeQueues.get(path) ?? Promise.resolve()
  const run = (): Promise<void> => writeFileAtomicOnce(path, data)
  const result = prev.then(run, run) // chain on the previous write, error or not
  const tail = result.then(
    () => {},
    () => {},
  ) // swallowed link that keeps the queue going without unhandled rejections
  writeQueues.set(path, tail)
  void tail.then(() => {
    if (writeQueues.get(path) === tail) writeQueues.delete(path)
  })
  return result
}

// A per-key operation lock. `writeFileAtomic` only serialises the *write*; a
// read-modify-write (read a canvas file, change one item, write it back) must run
// under a lock spanning the whole sequence — otherwise N concurrent mutators of
// the same file (e.g. moving a frame persists all its sticky members at once)
// each read the pre-change file and the last write wins, silently dropping the
// others' updates. This chains such sequences per key so none is lost.
const opLocks = new Map<string, Promise<unknown>>()
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = opLocks.get(key) ?? Promise.resolve()
  const result = prev.then(fn, fn) // run after the previous op, success or failure
  const tail = result.then(
    () => {},
    () => {},
  )
  opLocks.set(key, tail)
  void tail.then(() => {
    if (opLocks.get(key) === tail) opLocks.delete(key)
  })
  return result
}

/** Pretty-print JSON the way every file on disk is written (BACKEND_PLAN §10). */
function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n'
}

/**
 * Join user-supplied path parts to a base and guarantee the result stays inside
 * that base — the defense against `../` path traversal. BACKEND_PLAN §9.
 */
export function safeJoin(base: string, ...parts: string[]): string {
  const full = resolve(base, ...parts)
  if (full !== base && !full.startsWith(base + sep)) {
    throw new BadRequest('Invalid path')
  }
  return full
}

/**
 * Turn a human title into a filesystem-safe slug. Ported verbatim from the mock
 * (frontend mockApi.ts) so createNote / createConcept name things identically.
 */
export function slugify(title: string, fallback = 'note'): string {
  const slug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return slug || fallback
}

/** Human-readable title from a markdown filename ("two-sum.md" → "Two sum").
 *  Mirrors the frontend's prettyName so both ends label a challenge the same. */
function prettyTitle(file: string): string {
  const base = file.replace(/\.md$/, '').replace(/-/g, ' ').trim()
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : file
}

/** A finite number or 400; canvas coordinates are stored rounded. */
function cleanNumber(value: unknown, name: string): number {
  const n = Number(value)
  if (!Number.isFinite(n)) throw new BadRequest(`${name} must be a finite number`)
  return Math.round(n)
}

function cleanSize(value: unknown, name: string): number {
  return Math.min(STICKY_MAX, Math.max(STICKY_MIN, cleanNumber(value, name)))
}

function cleanArrowWidth(value: unknown): number {
  return Math.min(ARROW_MAX_W, Math.max(ARROW_MIN_W, cleanNumber(value, 'ancho')))
}

function cleanFrameSize(value: unknown, name: string): number {
  return Math.min(FRAME_MAX, Math.max(FRAME_MIN, cleanNumber(value, name)))
}

/** Normalise a colour to a lowercase 6-digit hex. Accepts a hex string
 *  (#rgb or #rrggbb) or a legacy preset name; 3-digit hex is expanded. */
function toHex(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  if (TINT_HEX[v]) return TINT_HEX[v]
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  if (/^#[0-9a-f]{3}$/.test(v)) return '#' + v.slice(1).split('').map((c) => c + c).join('')
  return null
}

/** Strict writer-side colour clean: reject anything that isn't a hex/preset. */
function cleanColor(value: unknown): StickyColor {
  const hex = toHex(value)
  if (!hex) throw new BadRequest(`Invalid color: ${String(value)}`)
  return hex
}

/** Lenient reader-side colour: never throws — an odd value degrades to the
 *  default tint so a hand-edited file can't break the whole canvas. */
function readColor(value: unknown): StickyColor {
  return toHex(value) ?? DEFAULT_TINT
}

/** Read .telar/stickies.json tolerantly (missing/empty → no stickies; notes
 *  saved before the title/body split read back with an empty titulo). */
async function readStickies(masterDir: string): Promise<Sticky[]> {
  const file = await readJson<StickiesFile>(join(masterDir, '.telar', 'stickies.json'), {
    stickies: [],
  })
  const list = Array.isArray(file.stickies) ? file.stickies : []
  return list.map((s) => ({
    ...s,
    titulo: typeof s.titulo === 'string' ? s.titulo : '',
    color: readColor(s.color),
  }))
}

/** Read .telar/arrows.json tolerantly (missing/empty → no arrows). Colours are
 *  normalised to hex; malformed entries are dropped rather than crashing. */
async function readArrows(masterDir: string): Promise<Flecha[]> {
  const file = await readJson<ArrowsFile>(join(masterDir, '.telar', 'arrows.json'), { flechas: [] })
  const list = Array.isArray(file.flechas) ? file.flechas : []
  return list
    .filter((f) => f && typeof f.id === 'string')
    .map((f) => ({
      id: f.id,
      x1: Number(f.x1) || 0,
      y1: Number(f.y1) || 0,
      x2: Number(f.x2) || 0,
      y2: Number(f.y2) || 0,
      color: readColor(f.color),
      ancho: Math.min(ARROW_MAX_W, Math.max(ARROW_MIN_W, Math.round(Number(f.ancho) || 14))),
    }))
}

/** Read .telar/frames.json tolerantly (missing/empty → no frames). Colours are
 *  normalised to hex; malformed entries are dropped rather than crashing. */
async function readFrames(masterDir: string): Promise<Marco[]> {
  const file = await readJson<FramesFile>(join(masterDir, '.telar', 'frames.json'), { marcos: [] })
  const list = Array.isArray(file.marcos) ? file.marcos : []
  return list
    .filter((m) => m && typeof m.id === 'string')
    .map((m) => ({
      id: m.id,
      nombre: typeof m.nombre === 'string' ? m.nombre : '',
      x: Number(m.x) || 0,
      y: Number(m.y) || 0,
      ancho: Math.min(FRAME_MAX, Math.max(FRAME_MIN, Math.round(Number(m.ancho) || FRAME_MIN))),
      alto: Math.min(FRAME_MAX, Math.max(FRAME_MIN, Math.round(Number(m.alto) || FRAME_MIN))),
      color: readColor(m.color),
    }))
}

/** The axis-aligned rect of a frame (centre + size → min/max corners + area). */
function frameRect(m: Marco): { x1: number; y1: number; x2: number; y2: number; area: number } {
  return {
    x1: m.x - m.ancho / 2,
    y1: m.y - m.alto / 2,
    x2: m.x + m.ancho / 2,
    y2: m.y + m.alto / 2,
    area: m.ancho * m.alto,
  }
}

/**
 * Read the frames and attach each one's `miembros` — the concept ids whose saved
 * position falls inside its rect. Membership is DERIVED by containment (never
 * stored): a needle belongs to the *smallest* frame that contains it, so nested
 * / overlapping frames resolve deterministically and no `.meta` is touched.
 */
async function framesWithMembers(masterDir: string): Promise<MarcoConMiembros[]> {
  const frames = await readFrames(masterDir)
  if (frames.length === 0) return []
  const layout = await readJson<LayoutFile>(join(masterDir, '.telar', 'layout.json'), {
    posiciones: {},
  })
  const posiciones = layout.posiciones && typeof layout.posiciones === 'object' ? layout.posiciones : {}
  // Only real concepts can be members — filter out stale layout entries.
  const concepts = await scanConcepts(masterDir)

  const rects = frames.map((m) => ({ m, r: frameRect(m), miembros: [] as string[] }))
  for (const [id, pos] of Object.entries(posiciones)) {
    if (!concepts.has(id) || !pos || typeof pos !== 'object') continue
    // Smallest-area containing frame wins.
    let best: (typeof rects)[number] | null = null
    for (const entry of rects) {
      const { r } = entry
      if (pos.x >= r.x1 && pos.x <= r.x2 && pos.y >= r.y1 && pos.y <= r.y2) {
        if (!best || r.area < best.r.area) best = entry
      }
    }
    if (best) best.miembros.push(id)
  }
  return rects.map(({ m, miembros }) => ({ ...m, miembros: miembros.sort() }))
}

/** Build a fresh Marco (with a new `f…` id) from partial data, given the frames
 *  that already exist — shared by createFrame and buildSubgraph's frame spec. */
function newFrame(data: Partial<Omit<Marco, 'id'>>, existing: Marco[]): Marco {
  const used = new Set(existing.map((m) => m.id))
  let n = existing.length + 1
  let id = `f${n}`
  while (used.has(id)) id = `f${++n}`
  return {
    id,
    nombre: typeof data.nombre === 'string' ? data.nombre : '',
    x: cleanNumber(data.x ?? 0, 'x'),
    y: cleanNumber(data.y ?? 0, 'y'),
    ancho: cleanFrameSize(data.ancho ?? 900, 'ancho'),
    alto: cleanFrameSize(data.alto ?? 600, 'alto'),
    color: cleanColor(data.color ?? FRAME_DEFAULT_COLOR),
  }
}

/**
 * Lay out `ids` as an evenly spaced grid inside a frame's rect (with padding),
 * so a freshly built subgraph lands tidily inside its frame instead of piling at
 * the origin. Returns id → { x, y } (centre coords, model space).
 */
function layoutInRect(ids: string[], m: Marco): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {}
  if (ids.length === 0) return out
  const pad = Math.min(m.ancho, m.alto) * 0.12
  const innerW = Math.max(1, m.ancho - pad * 2)
  const innerH = Math.max(1, m.alto - pad * 2)
  // Bias the column count by the aspect ratio so the grid roughly fills the rect.
  const cols = Math.max(1, Math.round(Math.sqrt(ids.length * (innerW / innerH))))
  const rows = Math.max(1, Math.ceil(ids.length / cols))
  const x0 = m.x - m.ancho / 2 + pad
  const y0 = m.y - m.alto / 2 + pad
  const cellW = innerW / cols
  const cellH = innerH / rows
  ids.forEach((id, i) => {
    const c = i % cols
    const r = Math.floor(i / cols)
    out[id] = { x: Math.round(x0 + cellW * (c + 0.5)), y: Math.round(y0 + cellH * (r + 0.5)) }
  })
  return out
}

/** Atomic write of a JSON file inside .telar/, creating the folder if needed. */
async function writeTelarJson(masterDir: string, file: string, value: unknown): Promise<void> {
  const telarDir = join(masterDir, '.telar')
  await mkdir(telarDir, { recursive: true })
  await writeFileAtomic(join(telarDir, file), toJson(value))
}

/** List the first-level `*.md` files of a folder, sorted. Missing folder → []. */
async function listMarkdown(folderDir: string): Promise<string[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(folderDir, { withFileTypes: true })
  } catch {
    return [] // folder does not exist yet
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name)
    .sort()
}

/** Like listMarkdown but for lesson/example folders, which also surface study
 *  PDFs the user drops in. Sorted, missing folder → []. */
async function listDocuments(folderDir: string): Promise<string[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(folderDir, { withFileTypes: true })
  } catch {
    return [] // folder does not exist yet
  }
  return entries
    .filter((e) => e.isFile() && DOC_EXTS.some((ext) => e.name.toLowerCase().endsWith(ext)))
    .map((e) => e.name)
    .sort()
}

/**
 * Create a NEW markdown file in a content folder: slug the title, avoid
 * clobbering an existing file (suffix -2, -3…), give it an H1 heading. Shared by
 * createNote / createLesson / createExample / createChallenge — every generated
 * piece lands as its own separate file. Returns the filename created.
 */
async function writeNewMarkdown(folderDir: string, title: string, body: string): Promise<string> {
  const name = title.trim()
  if (!name) throw new BadRequest('Title is required')
  await mkdir(folderDir, { recursive: true })
  const existing = new Set(await listMarkdown(folderDir))
  const base = slugify(name)
  let file = `${base}.md`
  for (let n = 2; existing.has(file); n++) file = `${base}-${n}.md`
  const content = body.trim() ? `# ${name}\n\n${body}\n` : `# ${name}\n\n`
  await writeFileAtomic(join(folderDir, file), content)
  return file
}

/**
 * Overwrite one markdown file in a content folder by name (safe against `../`).
 * Body is written verbatim — the caller owns the heading. Shared by the edit
 * operations (saveNote / saveLesson).
 */
async function overwriteMarkdown(folderDir: string, file: string, body: string): Promise<void> {
  if (!file.endsWith('.md')) throw new BadRequest('Only .md files can be saved')
  const path = safeJoin(folderDir, file)
  await mkdir(folderDir, { recursive: true })
  await writeFileAtomic(path, body)
}

// --- Concept discovery ------------------------------------------------------

/** One concept found on disk: its id, master-relative path, absolute dir, meta. */
export interface ConceptEntry {
  id: string
  /** Path relative to the master, POSIX-joined ("rag", "rag/reranking"). */
  ruta: string
  /** Absolute directory holding this concept's .meta and content folders. */
  dir: string
  meta: ConceptMeta
}

/**
 * Read a concept's .meta with tolerant defaults (BACKEND_PLAN §4.4). Missing or
 * empty fields fall back to the folder name, so a half-scaffolded concept still
 * resolves to a usable node instead of throwing.
 */
export async function readMeta(dir: string, ruta: string): Promise<ConceptMeta> {
  const base = ruta.split('/').pop() || basename(dir)
  const raw = await readJson<Partial<ConceptMeta>>(join(dir, '.meta'), {})
  return {
    id: raw.id ?? base,
    nombre: raw.nombre ?? base,
    resumen: raw.resumen ?? '',
    relaciones: Array.isArray(raw.relaciones) ? raw.relaciones : [],
  }
}

/**
 * Walk the master tree and index every concept (a folder holding a .meta) by id
 * (BACKEND_PLAN §4.2). Content folders and dot-folders (`.telar`, `.solutions`)
 * are never descended into, so subconcepts — nested concept folders — are found
 * but content is not mistaken for one. Duplicate ids keep the first, with a warning.
 */
export async function scanConcepts(masterDir: string): Promise<Map<string, ConceptEntry>> {
  const index = new Map<string, ConceptEntry>()

  async function walk(absDir: string, ruta: string): Promise<void> {
    let entries: Dirent[]
    try {
      entries = await readdir(absDir, { withFileTypes: true })
    } catch {
      return
    }

    if (entries.some((e) => e.isFile() && e.name === '.meta')) {
      const meta = await readMeta(absDir, ruta)
      if (index.has(meta.id)) {
        console.warn(`Duplicate concept id "${meta.id}" at ${ruta}; keeping the first.`)
      } else {
        index.set(meta.id, { id: meta.id, ruta, dir: absDir, meta })
      }
    }

    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue
      if (CONTENT_FOLDERS.includes(e.name as ContentFolder)) continue
      await walk(join(absDir, e.name), ruta ? `${ruta}/${e.name}` : e.name)
    }
  }

  await walk(masterDir, '')
  return index
}

/** Resolve a concept id to its on-disk entry, or 404. */
async function resolveConcept(masterDir: string, id: string): Promise<ConceptEntry> {
  const entry = (await scanConcepts(masterDir)).get(id)
  if (!entry) throw new NotFound(`Unknown concept: ${id}`)
  return entry
}

// --- Input shapes for the incremental writes (MCP / AI generation) ----------
// Looser than the on-disk shapes: id (and a couple of fields) are optional and
// filled in / validated by the operation. See MCP.md §5.2.

/** A test question accepted by addQuestions; id/explicacion optional. */
export interface NewQuestion {
  id?: string
  enunciado: string
  opciones: string[]
  correcta: number
  explicacion?: string
}

/** A flashcard accepted by addFlashcards; id optional. */
export interface NewFlashcard {
  id?: string
  anverso: string
  reverso: string
}

/** A recorded mistake accepted by logError; fecha defaults to today. */
export interface NewError {
  fuente: ErrorSource
  itemId: string
  fecha?: string
  nota?: string
}

/** A concept to create in a buildSubgraph batch. `ref` is a local alias the
 *  relations in the same call can point at (defaults to `nombre`). */
export interface NewConcept {
  ref?: string
  nombre: string
  resumen?: string
}

/** A relation in a buildSubgraph batch. `from`/`to` are each either a `ref` of a
 *  concept created in the same call or the id of one that already exists. */
export interface NewSubgraphRelation {
  from: string
  to: string
  tipo: RelationType
}

/** Optionally scope a buildSubgraph batch to a frame: either the id of an
 *  existing frame, or a spec to create a new one. When given, the created
 *  concepts are auto-laid-out inside the frame's rect (fixes the "new nodes pile
 *  in the centre" problem — everything lands in the reserved region instead). */
export type SubgraphFrame = string | Partial<Omit<Marco, 'id'>>

/** What buildSubgraph reports back: the id each new concept got, plus a count.
 *  `marco` is the id of the frame the batch landed in (if one was requested). */
export interface BuiltSubgraph {
  created: { ref: string; id: string; nombre: string }[]
  relations: number
  marco?: string
}

// --- The Master interface (all the TelarApi + generation operations) --------

export interface Master {
  /** Absolute path of the TELAR-MASTER/ directory this instance reads. */
  readonly dir: string

  // Reads (F2)
  getGraph(): Promise<Graph>
  getConcept(id: string): Promise<ConceptDetail>
  getFile(id: string, folder: ContentFolder, file: string): Promise<string>
  /** Raw bytes of a binary study document (PDF) in lessons/examples, for the
   *  frontend's viewer/download — text (.md) still goes through getFile. */
  getRawFile(
    id: string,
    folder: ContentFolder,
    file: string,
  ): Promise<{ data: ArrayBuffer; contentType: string }>
  getTests(id: string): Promise<TestsFile>
  getFlashcards(id: string): Promise<FlashcardsFile>
  getSolution(id: string, challengeFile: string): Promise<string | null>
  getErrorLog(id: string): Promise<ErrorLog>
  getErrors(): Promise<ResolvedError[]>

  // Writes (F5)
  createNote(id: string, title: string, body: string): Promise<{ file: string }>
  saveNote(id: string, file: string, body: string): Promise<void>
  saveSolution(id: string, challengeFile: string, body: string): Promise<void>
  createConcept(nombre: string, resumen: string): Promise<GraphNode>
  /** Edit a concept's display name / summary in place; id and relations are
   *  preserved (the folder name = id never changes, so relations stay valid). */
  updateConcept(id: string, patch: { nombre?: string; resumen?: string }): Promise<GraphNode>
  addRelation(id: string, relation: { id: string; tipo: RelationType }): Promise<void>
  removeRelation(id: string, target: string): Promise<void>
  /** Batch: create many concepts and wire their relations in a single call
   *  (one filesystem scan). Relations may reference the new concepts by `ref`.
   *  With `marco`, the created concepts are placed inside that frame's rect. */
  buildSubgraph(
    concepts: NewConcept[],
    relations: NewSubgraphRelation[],
    marco?: SubgraphFrame,
  ): Promise<BuiltSubgraph>

  // Canvas state (.telar/): sticky-note annotations + saved needle positions.
  getStickies(): Promise<Sticky[]>
  createSticky(data: Partial<Omit<Sticky, 'id'>>): Promise<Sticky>
  updateSticky(id: string, patch: Partial<Omit<Sticky, 'id'>>): Promise<Sticky>
  deleteSticky(id: string): Promise<void>
  // Roadmap arrows: free-floating canvas annotations (like stickies, not relations).
  getArrows(): Promise<Flecha[]>
  createArrow(data: Partial<Omit<Flecha, 'id'>>): Promise<Flecha>
  updateArrow(id: string, patch: Partial<Omit<Flecha, 'id'>>): Promise<Flecha>
  deleteArrow(id: string): Promise<void>
  // Frames (regions): named containers; `getFrames` returns derived `miembros`.
  getFrames(): Promise<MarcoConMiembros[]>
  createFrame(data: Partial<Omit<Marco, 'id'>>): Promise<Marco>
  updateFrame(id: string, patch: Partial<Omit<Marco, 'id'>>): Promise<Marco>
  deleteFrame(id: string): Promise<void>
  getLayout(): Promise<Record<string, { x: number; y: number }>>
  saveLayout(posiciones: Record<string, { x: number; y: number }>): Promise<void>

  // Content generation writes (MCP / AI). Lessons/examples/challenges each land
  // as their own file; a lesson can also be edited in place. Tests, flashcards
  // and the error log grow incrementally.
  createLesson(id: string, title: string, body: string): Promise<{ file: string }>
  saveLesson(id: string, file: string, body: string): Promise<void>
  createExample(id: string, title: string, body: string): Promise<{ file: string }>
  createChallenge(id: string, title: string, body: string): Promise<{ file: string }>
  addQuestions(id: string, preguntas: NewQuestion[]): Promise<{ added: number; total: number }>
  addFlashcards(id: string, tarjetas: NewFlashcard[]): Promise<{ added: number; total: number }>
  logError(id: string, error: NewError): Promise<void>
}

/**
 * Build a Master bound to a TELAR-MASTER directory. Every operation scans the
 * tree fresh (a handful of concepts, milliseconds) so hand-edits on disk are
 * always reflected and the derived graph never drifts (BACKEND_PLAN §4.3).
 */
export function createMaster(dir: string): Master {
  // Lock keys for the read-modify-write canvas files, so concurrent per-item
  // mutators (e.g. persisting every sticky towed by a frame move at once) can't
  // lose each other's updates. See withLock above.
  const stickiesLock = join(dir, '.telar', 'stickies.json')
  const arrowsLock = join(dir, '.telar', 'arrows.json')
  const framesLock = join(dir, '.telar', 'frames.json')
  return {
    dir,

    // --- Reads (F2) ---------------------------------------------------------

    // graph.json is disposable: rebuilt from the .meta files and rewritten here.
    getGraph: () => regenerateGraph(dir),

    getConcept: async (id) => {
      const entry = await resolveConcept(dir, id)
      // Lessons and examples also surface study PDFs; challenges and notes are
      // markdown-only (their UIs edit / attach solutions to markdown).
      const [lessons, examples, challenges, notes] = await Promise.all([
        listDocuments(join(entry.dir, 'lessons')),
        listDocuments(join(entry.dir, 'examples')),
        listMarkdown(join(entry.dir, 'challenges')),
        listMarkdown(join(entry.dir, 'notes')),
      ])
      return {
        id: entry.meta.id,
        nombre: entry.meta.nombre,
        files: { lessons, examples, challenges, notes },
      }
    },

    getFile: async (id, folder, file) => {
      if (!CONTENT_FOLDERS.includes(folder)) throw new BadRequest(`Unknown folder: ${folder}`)
      if (!file.endsWith('.md')) throw new BadRequest('Only .md files can be read')
      const entry = await resolveConcept(dir, id)
      const path = safeJoin(join(entry.dir, folder), file)
      try {
        return await readFile(path, 'utf8')
      } catch {
        throw new NotFound(`Not found: ${id}/${folder}/${file}`)
      }
    },

    getRawFile: async (id, folder, file) => {
      if (!CONTENT_FOLDERS.includes(folder)) throw new BadRequest(`Unknown folder: ${folder}`)
      const lower = file.toLowerCase()
      const ext = Object.keys(RAW_TYPES).find((e) => lower.endsWith(e))
      if (!ext) throw new BadRequest('Only PDF documents can be served raw')
      const entry = await resolveConcept(dir, id)
      const path = safeJoin(join(entry.dir, folder), file)
      try {
        const buf = await readFile(path) // no encoding → raw bytes
        // Slice to this view's exact bytes: small files may share a pooled buffer.
        const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
        return { data, contentType: RAW_TYPES[ext] }
      } catch {
        throw new NotFound(`Not found: ${id}/${folder}/${file}`)
      }
    },

    getTests: async (id) => {
      const entry = await resolveConcept(dir, id)
      return readJson<TestsFile>(join(entry.dir, 'tests.json'), { preguntas: [] })
    },

    getFlashcards: async (id) => {
      const entry = await resolveConcept(dir, id)
      return readJson<FlashcardsFile>(join(entry.dir, 'flashcard.json'), { tarjetas: [] })
    },

    // null (not 404) when nothing has been written yet, matching the mock.
    getSolution: async (id, challengeFile) => {
      if (!challengeFile.endsWith('.md')) throw new BadRequest('Invalid challenge file')
      const entry = await resolveConcept(dir, id)
      const path = safeJoin(join(entry.dir, 'challenges', SOLUTIONS_DIR), challengeFile)
      try {
        return await readFile(path, 'utf8')
      } catch {
        return null
      }
    },

    getErrorLog: async (id) => {
      const entry = await resolveConcept(dir, id)
      return readJson<ErrorLog>(join(entry.dir, '.errorlog'), { errores: [] })
    },

    // Every mistake across the master, newest first, each joined with the
    // solution that was given: the correct option (+ explicacion) from
    // tests.json for a test error, the saved solution for a challenge error.
    getErrors: async () => {
      const index = await scanConcepts(dir)
      const resolved: ResolvedError[] = []
      for (const entry of index.values()) {
        const log = await readJson<ErrorLog>(join(entry.dir, '.errorlog'), { errores: [] })
        const errores = Array.isArray(log.errores) ? log.errores : []
        if (errores.length === 0) continue
        const tests = errores.some((e) => e.fuente === 'test')
          ? await readJson<TestsFile>(join(entry.dir, 'tests.json'), { preguntas: [] })
          : { preguntas: [] as TestQuestion[] }
        for (const e of errores) {
          const base = { ...e, conceptId: entry.id, conceptNombre: entry.meta.nombre }
          if (e.fuente === 'test') {
            const q = tests.preguntas.find((p) => p.id === e.itemId)
            resolved.push({
              ...base,
              titulo: q?.enunciado ?? e.itemId,
              solucion: q ? (q.opciones[q.correcta] ?? null) : null,
              ...(q?.explicacion ? { explicacion: q.explicacion } : {}),
            })
          } else {
            let solucion: string | null = null
            try {
              // A hand-edited .errorlog could carry a traversal itemId; safeJoin
              // throws inside the try, so it degrades to "no solution".
              const path = safeJoin(join(entry.dir, 'challenges', SOLUTIONS_DIR), e.itemId)
              solucion = await readFile(path, 'utf8')
            } catch {
              solucion = null
            }
            resolved.push({ ...base, titulo: prettyTitle(e.itemId), solucion })
          }
        }
      }
      // fecha is "YYYY-MM-DD", so plain string comparison sorts chronologically.
      return resolved.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
    },

    // --- Writes (F5) --------------------------------------------------------

    createNote: async (id, title, body) => {
      const entry = await resolveConcept(dir, id)
      return { file: await writeNewMarkdown(join(entry.dir, 'notes'), title, body) }
    },

    saveNote: async (id, file, body) => {
      const entry = await resolveConcept(dir, id)
      await overwriteMarkdown(join(entry.dir, 'notes'), file, body)
    },

    saveSolution: async (id, challengeFile, body) => {
      if (!challengeFile.endsWith('.md')) throw new BadRequest('Invalid challenge file')
      const entry = await resolveConcept(dir, id)
      const solutionsDir = join(entry.dir, 'challenges', SOLUTIONS_DIR)
      const path = safeJoin(solutionsDir, challengeFile)
      await mkdir(solutionsDir, { recursive: true })
      await writeFileAtomic(path, body)
    },

    createConcept: async (nombre, resumen) => {
      const name = nombre.trim()
      if (!name) throw new BadRequest('Concept name is required')
      const summary = resumen.trim()

      const index = await scanConcepts(dir)
      const base = slugify(name, 'concept')
      let id = base
      for (let n = 2; index.has(id); n++) id = `${base}-${n}`

      const conceptDir = join(dir, id)
      await mkdir(conceptDir, { recursive: true })
      await Promise.all(CONTENT_FOLDERS.map((f) => mkdir(join(conceptDir, f), { recursive: true })))

      const meta: ConceptMeta = { id, nombre: name, resumen: summary, relaciones: [] }
      await Promise.all([
        writeFileAtomic(join(conceptDir, '.meta'), toJson(meta)),
        writeFileAtomic(join(conceptDir, '.errorlog'), toJson({ errores: [] })),
        writeFileAtomic(join(conceptDir, 'tests.json'), toJson({ preguntas: [] })),
        writeFileAtomic(join(conceptDir, 'flashcard.json'), toJson({ tarjetas: [] })),
      ])

      const node: GraphNode = { id, nombre: name, ruta: id, resumen: summary }
      return node
    },

    // Patch a concept's nombre / resumen in place, keeping its id and relations.
    // The id (folder name) is never rewritten, so every edge stays valid.
    updateConcept: async (id, patch) => {
      const entry = await resolveConcept(dir, id)
      const nombre =
        patch.nombre !== undefined ? String(patch.nombre).trim() : entry.meta.nombre
      if (!nombre) throw new BadRequest('Concept name cannot be empty')
      const resumen =
        patch.resumen !== undefined ? String(patch.resumen).trim() : entry.meta.resumen
      const next: ConceptMeta = { ...entry.meta, nombre, resumen }
      await writeFileAtomic(join(entry.dir, '.meta'), toJson(next))
      return { id: entry.meta.id, nombre, ruta: entry.ruta, resumen }
    },

    // Edits the dependent's .meta: relaciones list this concept's prerequisites.
    // Every UI check is repeated here — the client is never trusted (§9).
    addRelation: async (id, relation) => {
      const { tipo } = relation
      if (tipo !== 'requiere' && tipo !== 'relacionado_con') {
        throw new BadRequest(`Unknown relation type: ${tipo}`)
      }
      const target = relation.id
      if (!target) throw new BadRequest('Relation target is required')
      if (target === id) throw new BadRequest('A concept cannot relate to itself')

      const index = await scanConcepts(dir)
      const entry = index.get(id)
      if (!entry) throw new NotFound(`Unknown concept: ${id}`)
      if (!index.has(target)) throw new BadRequest(`Unknown related concept: ${target}`)

      if (entry.meta.relaciones.some((r) => r.id === target)) return // idempotent

      const next: ConceptMeta = {
        ...entry.meta,
        relaciones: [...entry.meta.relaciones, { id: target, tipo }],
      }
      await writeFileAtomic(join(entry.dir, '.meta'), toJson(next))
    },

    // The inverse of addRelation: drop the target from the dependent's .meta.
    removeRelation: async (id, target) => {
      if (!target) throw new BadRequest('Relation target is required')
      const index = await scanConcepts(dir)
      const entry = index.get(id)
      if (!entry) throw new NotFound(`Unknown concept: ${id}`)
      if (!entry.meta.relaciones.some((r) => r.id === target)) return // idempotent
      const next: ConceptMeta = {
        ...entry.meta,
        relaciones: entry.meta.relaciones.filter((r) => r.id !== target),
      }
      await writeFileAtomic(join(entry.dir, '.meta'), toJson(next))
    },

    // Create many concepts and wire their relations in one pass. Scans the tree
    // ONCE (createConcept would re-scan per node), assigns unique slugged ids,
    // then applies relations that may point at the just-created concepts by ref.
    buildSubgraph: async (concepts, relations, marco) => {
      const index = await scanConcepts(dir)
      const used = new Set(index.keys()) // ids taken (existing + created so far)

      const created: BuiltSubgraph['created'] = []
      const refToId = new Map<string, string>() // ref/nombre → new id
      const newMeta = new Map<string, { dir: string; meta: ConceptMeta }>()

      // 1) Create each concept: slug, dedup, scaffold the four content folders
      //    and the empty .meta/.errorlog/tests.json/flashcard.json (as createConcept).
      for (const c of concepts ?? []) {
        const name = (c?.nombre ?? '').trim()
        if (!name) throw new BadRequest('Each concept needs a nombre')
        const base = slugify(name, 'concept')
        let id = base
        for (let n = 2; used.has(id); n++) id = `${base}-${n}`
        used.add(id)

        const conceptDir = join(dir, id)
        await mkdir(conceptDir, { recursive: true })
        await Promise.all(CONTENT_FOLDERS.map((f) => mkdir(join(conceptDir, f), { recursive: true })))
        const meta: ConceptMeta = { id, nombre: name, resumen: (c.resumen ?? '').trim(), relaciones: [] }
        await Promise.all([
          writeFileAtomic(join(conceptDir, '.meta'), toJson(meta)),
          writeFileAtomic(join(conceptDir, '.errorlog'), toJson({ errores: [] })),
          writeFileAtomic(join(conceptDir, 'tests.json'), toJson({ preguntas: [] })),
          writeFileAtomic(join(conceptDir, 'flashcard.json'), toJson({ tarjetas: [] })),
        ])

        const ref = (c.ref ?? name).trim()
        if (refToId.has(ref)) throw new BadRequest(`Duplicate concept ref: ${ref}`)
        refToId.set(ref, id)
        newMeta.set(id, { dir: conceptDir, meta })
        created.push({ ref, id, nombre: name })
      }

      // Resolve a relation endpoint to a concrete id: a batch ref, or an id that
      // already existed / was just created.
      const resolveRef = (token: string): string => {
        const t = (token ?? '').trim()
        if (refToId.has(t)) return refToId.get(t)!
        if (newMeta.has(t) || index.has(t)) return t
        throw new BadRequest(`Unknown concept in relation: ${token}`)
      }

      // 2) Apply relations. Existing concepts are loaded on demand into a
      //    writeback map (a copy of their relaciones); new ones mutate in place.
      const writeback = new Map<string, { dir: string; meta: ConceptMeta }>()
      const metaFor = (relId: string): { dir: string; meta: ConceptMeta } => {
        if (newMeta.has(relId)) return newMeta.get(relId)!
        if (writeback.has(relId)) return writeback.get(relId)!
        const entry = index.get(relId)! // resolveRef guaranteed it exists
        const w = { dir: entry.dir, meta: { ...entry.meta, relaciones: [...entry.meta.relaciones] } }
        writeback.set(relId, w)
        return w
      }

      let relCount = 0
      for (const r of relations ?? []) {
        if (r.tipo !== 'requiere' && r.tipo !== 'relacionado_con') {
          throw new BadRequest(`Unknown relation type: ${r.tipo}`)
        }
        const fromId = resolveRef(r.from)
        const toId = resolveRef(r.to)
        if (fromId === toId) throw new BadRequest('A concept cannot relate to itself')
        const w = metaFor(fromId)
        if (w.meta.relaciones.some((x) => x.id === toId)) continue // idempotent
        w.meta.relaciones.push({ id: toId, tipo: r.tipo })
        relCount++
      }

      // 3) Persist affected .meta files (new concepts only if they gained edges,
      //    since their empty .meta was already written above).
      for (const { dir: d, meta } of newMeta.values()) {
        if (meta.relaciones.length > 0) await writeFileAtomic(join(d, '.meta'), toJson(meta))
      }
      for (const { dir: d, meta } of writeback.values()) {
        await writeFileAtomic(join(d, '.meta'), toJson(meta))
      }

      // 4) Optional: drop the whole batch into a frame (a reserved region) and
      //    lay the new concepts out inside it, so they land tidily in that region
      //    instead of piling at the origin over existing subgraphs.
      let marcoId: string | undefined
      if (marco !== undefined) {
        const frames = await readFrames(dir)
        let target: Marco
        if (typeof marco === 'string') {
          const found = frames.find((m) => m.id === marco)
          if (!found) throw new BadRequest(`Unknown frame: ${marco}`)
          target = found
        } else {
          target = newFrame(marco, frames)
          await writeTelarJson(dir, 'frames.json', { marcos: [...frames, target] })
        }
        marcoId = target.id
        const positions = layoutInRect(
          created.map((c) => c.id),
          target,
        )
        const layout = await readJson<LayoutFile>(join(dir, '.telar', 'layout.json'), {
          posiciones: {},
        })
        const base =
          layout.posiciones && typeof layout.posiciones === 'object' ? layout.posiciones : {}
        await writeTelarJson(dir, 'layout.json', { posiciones: { ...base, ...positions } })
      }

      return { created, relations: relCount, marco: marcoId }
    },

    // --- Canvas state (.telar/) ---------------------------------------------
    // Stickies are user annotations — real data, unlike the derived graph.json.
    // The layout keeps needle positions stable across loads, which is what
    // makes a sticky meaningful as a region marker.

    getStickies: () => readStickies(dir),

    createSticky: (data) =>
      withLock(stickiesLock, async () => {
        const stickies = await readStickies(dir)
        const used = new Set(stickies.map((s) => s.id))
        let n = stickies.length + 1
        let id = `s${n}`
        while (used.has(id)) id = `s${++n}`
        const sticky: Sticky = {
          id,
          titulo: typeof data.titulo === 'string' ? data.titulo : '',
          texto: typeof data.texto === 'string' ? data.texto : '',
          color: cleanColor(data.color ?? 'sand'),
          x: cleanNumber(data.x ?? 0, 'x'),
          y: cleanNumber(data.y ?? 0, 'y'),
          ancho: cleanSize(data.ancho ?? 260, 'ancho'),
          alto: cleanSize(data.alto ?? 170, 'alto'),
        }
        await writeTelarJson(dir, 'stickies.json', { stickies: [...stickies, sticky] })
        return sticky
      }),

    updateSticky: (id, patch) =>
      withLock(stickiesLock, async () => {
        const stickies = await readStickies(dir)
        const i = stickies.findIndex((s) => s.id === id)
        if (i === -1) throw new NotFound(`Unknown sticky: ${id}`)
        const next: Sticky = {
          ...stickies[i],
          ...(patch.titulo !== undefined ? { titulo: String(patch.titulo) } : {}),
          ...(patch.texto !== undefined ? { texto: String(patch.texto) } : {}),
          ...(patch.color !== undefined ? { color: cleanColor(patch.color) } : {}),
          ...(patch.x !== undefined ? { x: cleanNumber(patch.x, 'x') } : {}),
          ...(patch.y !== undefined ? { y: cleanNumber(patch.y, 'y') } : {}),
          ...(patch.ancho !== undefined ? { ancho: cleanSize(patch.ancho, 'ancho') } : {}),
          ...(patch.alto !== undefined ? { alto: cleanSize(patch.alto, 'alto') } : {}),
        }
        const all = [...stickies]
        all[i] = next
        await writeTelarJson(dir, 'stickies.json', { stickies: all })
        return next
      }),

    deleteSticky: (id) =>
      withLock(stickiesLock, async () => {
        const stickies = await readStickies(dir)
        const remaining = stickies.filter((s) => s.id !== id)
        if (remaining.length === stickies.length) return // idempotent
        await writeTelarJson(dir, 'stickies.json', { stickies: remaining })
      }),

    // Roadmap arrows: same shape of CRUD as stickies, in .telar/arrows.json.
    getArrows: () => readArrows(dir),

    createArrow: (data) =>
      withLock(arrowsLock, async () => {
        const arrows = await readArrows(dir)
        const used = new Set(arrows.map((a) => a.id))
        let n = arrows.length + 1
        let id = `a${n}`
        while (used.has(id)) id = `a${++n}`
        const arrow: Flecha = {
          id,
          x1: cleanNumber(data.x1 ?? 0, 'x1'),
          y1: cleanNumber(data.y1 ?? 0, 'y1'),
          x2: cleanNumber(data.x2 ?? 0, 'x2'),
          y2: cleanNumber(data.y2 ?? 0, 'y2'),
          color: cleanColor(data.color ?? ARROW_DEFAULT_COLOR),
          ancho: cleanArrowWidth(data.ancho ?? 14),
        }
        await writeTelarJson(dir, 'arrows.json', { flechas: [...arrows, arrow] })
        return arrow
      }),

    updateArrow: (id, patch) =>
      withLock(arrowsLock, async () => {
        const arrows = await readArrows(dir)
        const i = arrows.findIndex((a) => a.id === id)
        if (i === -1) throw new NotFound(`Unknown arrow: ${id}`)
        const next: Flecha = {
          ...arrows[i],
          ...(patch.x1 !== undefined ? { x1: cleanNumber(patch.x1, 'x1') } : {}),
          ...(patch.y1 !== undefined ? { y1: cleanNumber(patch.y1, 'y1') } : {}),
          ...(patch.x2 !== undefined ? { x2: cleanNumber(patch.x2, 'x2') } : {}),
          ...(patch.y2 !== undefined ? { y2: cleanNumber(patch.y2, 'y2') } : {}),
          ...(patch.color !== undefined ? { color: cleanColor(patch.color) } : {}),
          ...(patch.ancho !== undefined ? { ancho: cleanArrowWidth(patch.ancho) } : {}),
        }
        const all = [...arrows]
        all[i] = next
        await writeTelarJson(dir, 'arrows.json', { flechas: all })
        return next
      }),

    deleteArrow: (id) =>
      withLock(arrowsLock, async () => {
        const arrows = await readArrows(dir)
        const remaining = arrows.filter((a) => a.id !== id)
        if (remaining.length === arrows.length) return // idempotent
        await writeTelarJson(dir, 'arrows.json', { flechas: remaining })
      }),

    // --- Frames (regions) ---------------------------------------------------
    // A frame is a named container drawn on the canvas — same CRUD shape as a
    // sticky, in .telar/frames.json. getFrames adds each frame's derived
    // membership (concept ids whose saved position falls inside its rect).
    getFrames: () => framesWithMembers(dir),

    createFrame: (data) =>
      withLock(framesLock, async () => {
        const frames = await readFrames(dir)
        const frame = newFrame(data, frames)
        await writeTelarJson(dir, 'frames.json', { marcos: [...frames, frame] })
        return frame
      }),

    updateFrame: (id, patch) =>
      withLock(framesLock, async () => {
        const frames = await readFrames(dir)
        const i = frames.findIndex((m) => m.id === id)
        if (i === -1) throw new NotFound(`Unknown frame: ${id}`)
        const next: Marco = {
          ...frames[i],
          ...(patch.nombre !== undefined ? { nombre: String(patch.nombre) } : {}),
          ...(patch.x !== undefined ? { x: cleanNumber(patch.x, 'x') } : {}),
          ...(patch.y !== undefined ? { y: cleanNumber(patch.y, 'y') } : {}),
          ...(patch.ancho !== undefined ? { ancho: cleanFrameSize(patch.ancho, 'ancho') } : {}),
          ...(patch.alto !== undefined ? { alto: cleanFrameSize(patch.alto, 'alto') } : {}),
          ...(patch.color !== undefined ? { color: cleanColor(patch.color) } : {}),
        }
        const all = [...frames]
        all[i] = next
        await writeTelarJson(dir, 'frames.json', { marcos: all })
        return next
      }),

    deleteFrame: (id) =>
      withLock(framesLock, async () => {
        const frames = await readFrames(dir)
        const remaining = frames.filter((m) => m.id !== id)
        if (remaining.length === frames.length) return // idempotent
        await writeTelarJson(dir, 'frames.json', { marcos: remaining })
      }),

    getLayout: async () => {
      const file = await readJson<LayoutFile>(join(dir, '.telar', 'layout.json'), {
        posiciones: {},
      })
      return file.posiciones && typeof file.posiciones === 'object' ? file.posiciones : {}
    },

    saveLayout: async (posiciones) => {
      if (posiciones === null || typeof posiciones !== 'object' || Array.isArray(posiciones)) {
        throw new BadRequest('posiciones must be an object of { x, y } entries')
      }
      const clean: Record<string, { x: number; y: number }> = {}
      for (const [nodeId, pos] of Object.entries(posiciones)) {
        clean[nodeId] = { x: cleanNumber(pos?.x, 'x'), y: cleanNumber(pos?.y, 'y') }
      }
      await writeTelarJson(dir, 'layout.json', { posiciones: clean })
    },

    // --- Content generation writes (MCP / AI) -------------------------------
    // Lessons/examples/challenges each become their own separate .md file;
    // saveLesson edits one in place. Tests, flashcards and the error log append.

    createLesson: async (id, title, body) => {
      const entry = await resolveConcept(dir, id)
      return { file: await writeNewMarkdown(join(entry.dir, 'lessons'), title, body) }
    },

    saveLesson: async (id, file, body) => {
      const entry = await resolveConcept(dir, id)
      await overwriteMarkdown(join(entry.dir, 'lessons'), file, body)
    },

    createExample: async (id, title, body) => {
      const entry = await resolveConcept(dir, id)
      return { file: await writeNewMarkdown(join(entry.dir, 'examples'), title, body) }
    },

    createChallenge: async (id, title, body) => {
      const entry = await resolveConcept(dir, id)
      return { file: await writeNewMarkdown(join(entry.dir, 'challenges'), title, body) }
    },

    // Append questions to tests.json, validating each and giving it a stable id.
    addQuestions: async (id, preguntas) => {
      if (!Array.isArray(preguntas) || preguntas.length === 0) {
        throw new BadRequest('At least one question is required')
      }
      const entry = await resolveConcept(dir, id)
      const path = join(entry.dir, 'tests.json')
      const current = await readJson<TestsFile>(path, { preguntas: [] })

      const used = new Set(current.preguntas.map((p) => p.id))
      const clean = preguntas.map((raw, i): TestQuestion => {
        const enunciado = (raw.enunciado ?? '').trim()
        if (!enunciado) throw new BadRequest(`Question ${i + 1}: enunciado is required`)
        const opciones = Array.isArray(raw.opciones) ? raw.opciones.map((o) => String(o)) : []
        if (opciones.length < 2) {
          throw new BadRequest(`Question ${i + 1}: at least two opciones are required`)
        }
        const correcta = Number(raw.correcta)
        if (!Number.isInteger(correcta) || correcta < 0 || correcta >= opciones.length) {
          throw new BadRequest(`Question ${i + 1}: correcta must index one of the opciones`)
        }
        const desired = (raw.id ?? '').trim() || `p${used.size + 1}`
        let qid = desired
        for (let n = 2; used.has(qid); n++) qid = `${desired}-${n}`
        used.add(qid)
        return { id: qid, enunciado, opciones, correcta, explicacion: (raw.explicacion ?? '').trim() }
      })

      const next: TestsFile = { preguntas: [...current.preguntas, ...clean] }
      await writeFileAtomic(path, toJson(next))
      return { added: clean.length, total: next.preguntas.length }
    },

    // Append flashcards to flashcard.json, validating each and giving it an id.
    addFlashcards: async (id, tarjetas) => {
      if (!Array.isArray(tarjetas) || tarjetas.length === 0) {
        throw new BadRequest('At least one flashcard is required')
      }
      const entry = await resolveConcept(dir, id)
      const path = join(entry.dir, 'flashcard.json')
      const current = await readJson<FlashcardsFile>(path, { tarjetas: [] })

      const used = new Set(current.tarjetas.map((t) => t.id))
      const clean = tarjetas.map((raw, i): Flashcard => {
        const anverso = (raw.anverso ?? '').trim()
        const reverso = (raw.reverso ?? '').trim()
        if (!anverso || !reverso) {
          throw new BadRequest(`Flashcard ${i + 1}: anverso and reverso are required`)
        }
        const desired = (raw.id ?? '').trim() || `f${used.size + 1}`
        let fid = desired
        for (let n = 2; used.has(fid); n++) fid = `${desired}-${n}`
        used.add(fid)
        return { id: fid, anverso, reverso }
      })

      const next: FlashcardsFile = { tarjetas: [...current.tarjetas, ...clean] }
      await writeFileAtomic(path, toJson(next))
      return { added: clean.length, total: next.tarjetas.length }
    },

    // Append a recorded mistake to .errorlog (the spaced-repetition seed).
    logError: async (id, error) => {
      if (error.fuente !== 'test' && error.fuente !== 'challenge') {
        throw new BadRequest(`Unknown error source: ${error.fuente}`)
      }
      const itemId = (error.itemId ?? '').trim()
      if (!itemId) throw new BadRequest('itemId is required')
      const entry = await resolveConcept(dir, id)
      const path = join(entry.dir, '.errorlog')
      const current = await readJson<ErrorLog>(path, { errores: [] })
      const record: ErrorEntry = {
        fuente: error.fuente,
        itemId,
        fecha: (error.fecha ?? '').trim() || new Date().toISOString().slice(0, 10),
        ...(error.nota && error.nota.trim() ? { nota: error.nota.trim() } : {}),
      }
      await writeFileAtomic(path, toJson({ errores: [...current.errores, record] }))
    },
  }
}
