import type { TelarApi } from './api'
import type {
  ConceptDetail,
  ContentFolder,
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

/**
 * Real HTTP client for `telar serve`, implementing the same TelarApi contract as
 * the mock. Every call is a fetch to `/api/*` (Vite proxies that to the backend
 * in dev; in production the same process serves both). The backend always sends
 * `{ error }` on failure, which becomes a thrown Error — exactly what the
 * screens' ErrorState already knows how to render.
 */

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

/** Same as req but for 204/empty responses, where there is no JSON body to read. */
async function reqVoid(url: string, init?: RequestInit): Promise<void> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error ?? `HTTP ${res.status}`)
  }
}

/** Build the JSON-body init shared by every POST/PUT. */
function jsonBody(method: 'POST' | 'PUT', body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

const enc = encodeURIComponent

export const httpApi: TelarApi = {
  getGraph: () => req<Graph>('/api/graph'),

  getConcept: (id) => req<ConceptDetail>(`/api/concept/${enc(id)}`),

  getFile: async (id, folder: ContentFolder, file) =>
    (await req<{ content: string }>(`/api/concept/${enc(id)}/${folder}/${enc(file)}`)).content,

  fileUrl: (id, folder: ContentFolder, file) =>
    `/api/concept/${enc(id)}/${folder}/${enc(file)}/raw`,

  getTests: (id) => req<TestsFile>(`/api/concept/${enc(id)}/tests`),

  getFlashcards: (id) => req<FlashcardsFile>(`/api/concept/${enc(id)}/flashcards`),

  getSolution: async (id, challengeFile) =>
    (
      await req<{ content: string | null }>(
        `/api/concept/${enc(id)}/challenges/${enc(challengeFile)}/solution`,
      )
    ).content,

  createNote: (id, title, body) =>
    req<{ file: string }>(`/api/concept/${enc(id)}/notes`, jsonBody('POST', { title, body })),

  saveNote: (id, file, body) =>
    reqVoid(`/api/concept/${enc(id)}/notes/${enc(file)}`, jsonBody('PUT', { body })),

  saveSolution: (id, challengeFile, body) =>
    reqVoid(
      `/api/concept/${enc(id)}/challenges/${enc(challengeFile)}/solution`,
      jsonBody('POST', { body }),
    ),

  createConcept: (nombre, resumen) =>
    req<GraphNode>('/api/concepts', jsonBody('POST', { nombre, resumen })),

  addRelation: (id, relation: { id: string; tipo: RelationType }) =>
    reqVoid(`/api/concept/${enc(id)}/relations`, jsonBody('POST', relation)),

  getErrors: async () => (await req<{ errores: ResolvedError[] }>('/api/errors')).errores,

  logError: (id, error) => reqVoid(`/api/concept/${enc(id)}/errors`, jsonBody('POST', error)),

  removeRelation: (id, target) =>
    reqVoid(`/api/concept/${enc(id)}/relations/${enc(target)}`, { method: 'DELETE' }),

  getStickies: async () => (await req<{ stickies: Sticky[] }>('/api/stickies')).stickies,

  createSticky: (data) => req<Sticky>('/api/stickies', jsonBody('POST', data)),

  updateSticky: async (id, patch) => {
    await req<Sticky>(`/api/stickies/${enc(id)}`, jsonBody('PUT', patch))
  },

  deleteSticky: (id) => reqVoid(`/api/stickies/${enc(id)}`, { method: 'DELETE' }),

  getArrows: async () => (await req<{ flechas: Flecha[] }>('/api/arrows')).flechas,

  createArrow: (data) => req<Flecha>('/api/arrows', jsonBody('POST', data)),

  updateArrow: async (id, patch) => {
    await req<Flecha>(`/api/arrows/${enc(id)}`, jsonBody('PUT', patch))
  },

  deleteArrow: (id) => reqVoid(`/api/arrows/${enc(id)}`, { method: 'DELETE' }),

  getFrames: async () => (await req<{ marcos: MarcoConMiembros[] }>('/api/frames')).marcos,

  createFrame: (data) => req<Marco>('/api/frames', jsonBody('POST', data)),

  updateFrame: async (id, patch) => {
    await req<Marco>(`/api/frames/${enc(id)}`, jsonBody('PUT', patch))
  },

  deleteFrame: (id) => reqVoid(`/api/frames/${enc(id)}`, { method: 'DELETE' }),

  getLayout: async () =>
    (await req<{ posiciones: Record<string, { x: number; y: number }> }>('/api/layout')).posiciones,

  saveLayout: (posiciones) => reqVoid('/api/layout', jsonBody('PUT', { posiciones })),
}
