// graph.ts — regeneration of the derived graph cache (BACKEND_PLAN §4.3).
//
// graph.json is never authored by hand: on every GET /api/graph the server
// rebuilds { nodos, aristas } from the per-concept .meta files and rewrites
// .weft/graph.json as a human-readable snapshot. Keeping the cache disposable
// is what stops it from ever drifting out of sync with the sources.
//
// The algorithm (BACKEND_PLAN §4.3):
//   1. Scan the master for every folder holding a .meta → index of concepts.
//   2. Each concept's .meta (read with tolerant defaults) becomes one GraphNode.
//      Nodes carry no state (the .progress model was dropped; see .errorlog).
//   3. Each relacion becomes an edge from the prerequisite to the dependent:
//      meta.relaciones of concept C yields { de: rel.id, a: C.id, tipo }.
//      Edges to unknown concepts are skipped so the cache never dangles.
//   4. Write .weft/graph.json (pretty-printed) and return the graph.

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Graph, GraphEdge, GraphNode } from './types.js'
import { scanConcepts, writeFileAtomic } from './master.js'

export async function regenerateGraph(masterDir: string): Promise<Graph> {
  const index = await scanConcepts(masterDir)

  const nodos: GraphNode[] = []
  const aristas: GraphEdge[] = []

  for (const { meta, ruta } of index.values()) {
    nodos.push({ id: meta.id, nombre: meta.nombre, ruta, resumen: meta.resumen })
    for (const rel of meta.relaciones) {
      if (!index.has(rel.id)) continue // dangling relation → skip
      aristas.push({ de: rel.id, a: meta.id, tipo: rel.tipo })
    }
  }

  const graph: Graph = { nodos, aristas }

  const weftDir = join(masterDir, '.weft')
  await mkdir(weftDir, { recursive: true })
  await writeFileAtomic(join(weftDir, 'graph.json'), JSON.stringify(graph, null, 2) + '\n')

  return graph
}
