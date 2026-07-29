import type { TelarApi } from './api'
import type {
  ConceptDetail,
  ContentFolder,
  ErrorSource,
  Flecha,
  Graph,
  GraphNode,
  RelationType,
  ResolvedError,
  Sticky,
} from './types'
import { concepts, type ConceptFixture } from './fixtures'

/**
 * Mock implementation of TelarApi. Fixtures are the read-only base layer;
 * writes (notes, challenge solutions) land in a localStorage overlay that is
 * merged on read, so they survive reloads — the same behaviour the real
 * backend will provide by writing into TELAR-MASTER/.
 */

const LATENCY_MS = 150
const OVERLAY_KEY = 'telar.mock.overlay'

interface Overlay {
  /** conceptId -> note file -> markdown */
  notes: Record<string, Record<string, string>>
  /** conceptId -> challenge file -> solution markdown */
  solutions: Record<string, Record<string, string>>
  /** concepts pinned from the graph screen (the real backend scaffolds a folder) */
  concepts: Record<string, { nombre: string; resumen: string }>
  /** extra .meta relaciones per dependent concept, same shape as on disk */
  relations: Record<string, { id: string; tipo: RelationType }[]>
  /** recorded mistakes per concept, same shape as the on-disk .errorlog entries */
  errors: Record<string, { fuente: ErrorSource; itemId: string; fecha: string; nota?: string }[]>
  /** fixture relations the user cut: dependent concept -> removed target ids */
  removedRelations: Record<string, string[]>
  /** canvas sticky notes (the real backend keeps .telar/stickies.json) */
  stickies: Sticky[]
  /** roadmap arrows (the real backend keeps .telar/arrows.json) */
  arrows: Flecha[]
  /** saved needle positions (the real backend keeps .telar/layout.json) */
  layout: Record<string, { x: number; y: number }>
}

function loadOverlay(): Overlay {
  try {
    const raw = localStorage.getItem(OVERLAY_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Overlay>
      return {
        notes: parsed.notes ?? {},
        solutions: parsed.solutions ?? {},
        concepts: parsed.concepts ?? {},
        relations: parsed.relations ?? {},
        errors: parsed.errors ?? {},
        removedRelations: parsed.removedRelations ?? {},
        // Notes saved before the title/body split read back with an empty titulo.
        stickies: (parsed.stickies ?? []).map((s: Sticky) => ({
          ...s,
          titulo: typeof s.titulo === 'string' ? s.titulo : '',
        })),
        arrows: parsed.arrows ?? [],
        layout: parsed.layout ?? {},
      }
    }
  } catch {
    // Corrupted overlay: start clean.
  }
  return {
    notes: {},
    solutions: {},
    concepts: {},
    relations: {},
    errors: {},
    removedRelations: {},
    stickies: [],
    arrows: [],
    layout: {},
  }
}

function saveOverlay(overlay: Overlay): void {
  localStorage.setItem(OVERLAY_KEY, JSON.stringify(overlay))
}

const wait = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS))

/** An overlay-pinned concept behaves like a fixture with empty folders. */
function pinnedConcept(id: string, meta: { nombre: string; resumen: string }): ConceptFixture {
  return {
    id,
    nombre: meta.nombre,
    ruta: id,
    resumen: meta.resumen,
    relaciones: [],
    lessons: {},
    examples: {},
    challenges: {},
    notes: {},
    tests: { preguntas: [] },
    flashcards: { tarjetas: [] },
  }
}

function conceptOrThrow(id: string, overlay: Overlay = loadOverlay()): ConceptFixture {
  const fixture = concepts[id]
  if (fixture) return fixture
  const pinned = overlay.concepts[id]
  if (!pinned) throw new Error(`Unknown concept: ${id}`)
  return pinnedConcept(id, pinned)
}

function slugify(title: string, fallback = 'note'): string {
  const slug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return slug || fallback
}

export const mockApi: TelarApi = {
  async getGraph(): Promise<Graph> {
    await wait()
    const overlay = loadOverlay()
    const all = [
      ...Object.values(concepts),
      ...Object.entries(overlay.concepts).map(([id, meta]) => pinnedConcept(id, meta)),
    ]
    const cut = (a: string, de: string) => overlay.removedRelations[a]?.includes(de) ?? false
    return {
      nodos: all.map(({ id, nombre, ruta, resumen }) => ({ id, nombre, ruta, resumen })),
      // A concept's `relaciones` list its prerequisites, so edges point from
      // the prerequisite to the concept (de: requirement, a: dependent).
      aristas: [
        ...all.flatMap((c) => c.relaciones.map((r) => ({ de: r.id, a: c.id, tipo: r.tipo }))),
        ...Object.entries(overlay.relations).flatMap(([a, rels]) =>
          rels.map((r) => ({ de: r.id, a, tipo: r.tipo })),
        ),
      ].filter((e) => !cut(e.a, e.de)),
    }
  },

  async getConcept(id: string): Promise<ConceptDetail> {
    await wait()
    const c = conceptOrThrow(id)
    const overlayNotes = Object.keys(loadOverlay().notes[id] ?? {})
    return {
      id: c.id,
      nombre: c.nombre,
      files: {
        lessons: Object.keys(c.lessons),
        examples: Object.keys(c.examples),
        challenges: Object.keys(c.challenges),
        notes: [...Object.keys(c.notes), ...overlayNotes].sort(),
      },
    }
  },

  async getFile(id: string, folder: ContentFolder, file: string): Promise<string> {
    await wait()
    const c = conceptOrThrow(id)
    if (folder === 'notes') {
      const overlaid = loadOverlay().notes[id]?.[file]
      if (overlaid !== undefined) return overlaid
    }
    const content = c[folder][file]
    if (content === undefined) throw new Error(`Not found: ${id}/${folder}/${file}`)
    return content
  },

  // The offline mock has no real backend to stream bytes from; fixtures carry no
  // PDFs, so this points at the route a real server would answer (harmless).
  fileUrl(id: string, folder: ContentFolder, file: string): string {
    return `/api/concept/${encodeURIComponent(id)}/${folder}/${encodeURIComponent(file)}/raw`
  },

  async getTests(id: string) {
    await wait()
    return conceptOrThrow(id).tests
  },

  async getFlashcards(id: string) {
    await wait()
    return conceptOrThrow(id).flashcards
  },

  async createNote(id: string, title: string, body: string): Promise<{ file: string }> {
    await wait()
    const c = conceptOrThrow(id)
    const overlay = loadOverlay()
    const existing = new Set([...Object.keys(c.notes), ...Object.keys(overlay.notes[id] ?? {})])

    const base = slugify(title)
    let file = `${base}.md`
    for (let n = 2; existing.has(file); n++) file = `${base}-${n}.md`

    const content = body.trim() ? `# ${title}\n\n${body}\n` : `# ${title}\n\n`
    overlay.notes[id] = { ...overlay.notes[id], [file]: content }
    saveOverlay(overlay)
    return { file }
  },

  async saveNote(id: string, file: string, body: string): Promise<void> {
    await wait()
    conceptOrThrow(id)
    // Editing a fixture-backed note simply shadows it in the overlay,
    // exactly like the real backend overwriting the file on disk.
    const overlay = loadOverlay()
    overlay.notes[id] = { ...overlay.notes[id], [file]: body }
    saveOverlay(overlay)
  },

  async getSolution(id: string, challengeFile: string): Promise<string | null> {
    await wait()
    conceptOrThrow(id)
    return loadOverlay().solutions[id]?.[challengeFile] ?? null
  },

  async saveSolution(id: string, challengeFile: string, body: string): Promise<void> {
    await wait()
    conceptOrThrow(id)
    const overlay = loadOverlay()
    overlay.solutions[id] = { ...overlay.solutions[id], [challengeFile]: body }
    saveOverlay(overlay)
  },

  async createConcept(nombre: string, resumen: string): Promise<GraphNode> {
    await wait()
    const overlay = loadOverlay()
    const name = nombre.trim()
    const summary = resumen.trim()

    const base = slugify(name, 'concept')
    let id = base
    for (let n = 2; concepts[id] !== undefined || overlay.concepts[id] !== undefined; n++) {
      id = `${base}-${n}`
    }

    overlay.concepts[id] = { nombre: name, resumen: summary }
    saveOverlay(overlay)
    return { id, nombre: name, ruta: id, resumen: summary }
  },

  async addRelation(id: string, relation: { id: string; tipo: RelationType }): Promise<void> {
    await wait()
    const overlay = loadOverlay()
    const dependent = conceptOrThrow(id, overlay)
    conceptOrThrow(relation.id, overlay) // both ends must exist
    const wasCut = overlay.removedRelations[id]?.includes(relation.id) ?? false
    if (wasCut) {
      // Re-threading a fixture relation the user had cut: just undo the cut.
      overlay.removedRelations[id] = overlay.removedRelations[id].filter((t) => t !== relation.id)
      saveOverlay(overlay)
      return
    }
    const existing = [...dependent.relaciones, ...(overlay.relations[id] ?? [])]
    if (existing.some((r) => r.id === relation.id)) return // already threaded
    overlay.relations[id] = [...(overlay.relations[id] ?? []), relation]
    saveOverlay(overlay)
  },

  async removeRelation(id: string, target: string): Promise<void> {
    await wait()
    const overlay = loadOverlay()
    const dependent = conceptOrThrow(id, overlay)
    if (overlay.relations[id]?.some((r) => r.id === target)) {
      overlay.relations[id] = overlay.relations[id].filter((r) => r.id !== target)
    } else if (dependent.relaciones.some((r) => r.id === target)) {
      // Fixtures are read-only, so a cut fixture relation is masked instead.
      overlay.removedRelations[id] = [...(overlay.removedRelations[id] ?? []), target]
    } else {
      return // idempotent
    }
    saveOverlay(overlay)
  },

  async getStickies(): Promise<Sticky[]> {
    await wait()
    return loadOverlay().stickies
  },

  async createSticky(data: Omit<Sticky, 'id'>): Promise<Sticky> {
    await wait()
    const overlay = loadOverlay()
    const used = new Set(overlay.stickies.map((s) => s.id))
    let n = overlay.stickies.length + 1
    let id = `s${n}`
    while (used.has(id)) id = `s${++n}`
    const sticky: Sticky = { ...data, id }
    overlay.stickies = [...overlay.stickies, sticky]
    saveOverlay(overlay)
    return sticky
  },

  async updateSticky(id: string, patch: Partial<Omit<Sticky, 'id'>>): Promise<void> {
    await wait()
    const overlay = loadOverlay()
    const i = overlay.stickies.findIndex((s) => s.id === id)
    if (i === -1) throw new Error(`Unknown sticky: ${id}`)
    const next = [...overlay.stickies]
    next[i] = { ...next[i], ...patch, id }
    overlay.stickies = next
    saveOverlay(overlay)
  },

  async deleteSticky(id: string): Promise<void> {
    await wait()
    const overlay = loadOverlay()
    overlay.stickies = overlay.stickies.filter((s) => s.id !== id)
    saveOverlay(overlay)
  },

  async getArrows(): Promise<Flecha[]> {
    await wait()
    return loadOverlay().arrows
  },

  async createArrow(data: Omit<Flecha, 'id'>): Promise<Flecha> {
    await wait()
    const overlay = loadOverlay()
    const used = new Set(overlay.arrows.map((a) => a.id))
    let n = overlay.arrows.length + 1
    let id = `a${n}`
    while (used.has(id)) id = `a${++n}`
    const arrow: Flecha = { ...data, id }
    overlay.arrows = [...overlay.arrows, arrow]
    saveOverlay(overlay)
    return arrow
  },

  async updateArrow(id: string, patch: Partial<Omit<Flecha, 'id'>>): Promise<void> {
    await wait()
    const overlay = loadOverlay()
    const i = overlay.arrows.findIndex((a) => a.id === id)
    if (i === -1) throw new Error(`Unknown arrow: ${id}`)
    const next = [...overlay.arrows]
    next[i] = { ...next[i], ...patch, id }
    overlay.arrows = next
    saveOverlay(overlay)
  },

  async deleteArrow(id: string): Promise<void> {
    await wait()
    const overlay = loadOverlay()
    overlay.arrows = overlay.arrows.filter((a) => a.id !== id)
    saveOverlay(overlay)
  },

  async getLayout(): Promise<Record<string, { x: number; y: number }>> {
    await wait()
    return loadOverlay().layout
  },

  async saveLayout(posiciones: Record<string, { x: number; y: number }>): Promise<void> {
    await wait()
    const overlay = loadOverlay()
    overlay.layout = posiciones
    saveOverlay(overlay)
  },

  // Mirrors master.getErrors: join each recorded mistake with the solution
  // that was given (tests fixture / overlay solution) and sort newest-first.
  async getErrors(): Promise<ResolvedError[]> {
    await wait()
    const overlay = loadOverlay()
    const resolved: ResolvedError[] = []
    for (const [conceptId, errores] of Object.entries(overlay.errors)) {
      let c: ConceptFixture
      try {
        c = conceptOrThrow(conceptId, overlay)
      } catch {
        continue // concept vanished from fixtures/overlay: skip its errors
      }
      for (const e of errores) {
        const base = { ...e, conceptId, conceptNombre: c.nombre }
        if (e.fuente === 'test') {
          const q = c.tests.preguntas.find((p) => p.id === e.itemId)
          resolved.push({
            ...base,
            titulo: q?.enunciado ?? e.itemId,
            solucion: q ? (q.opciones[q.correcta] ?? null) : null,
            ...(q?.explicacion ? { explicacion: q.explicacion } : {}),
          })
        } else {
          const name = e.itemId.replace(/\.md$/, '').replace(/-/g, ' ')
          resolved.push({
            ...base,
            titulo: name ? name.charAt(0).toUpperCase() + name.slice(1) : e.itemId,
            solucion: overlay.solutions[conceptId]?.[e.itemId] ?? null,
          })
        }
      }
    }
    return resolved.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
  },

  async logError(id: string, error: { fuente: ErrorSource; itemId: string; nota?: string }): Promise<void> {
    await wait()
    conceptOrThrow(id)
    const overlay = loadOverlay()
    const record = {
      fuente: error.fuente,
      itemId: error.itemId,
      fecha: new Date().toISOString().slice(0, 10),
      ...(error.nota?.trim() ? { nota: error.nota.trim() } : {}),
    }
    overlay.errors[id] = [...(overlay.errors[id] ?? []), record]
    saveOverlay(overlay)
  },
}
