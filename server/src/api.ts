// api.ts — the HTTP surface. Thin routes: parse params/body, call master.ts,
// translate the result to HTTP. No filesystem logic lives here (BACKEND_PLAN §5).
// The full contract (21 methods + health) is wired now; the internals land per
// phase, so an unimplemented endpoint answers 501 via the error handler below.

import { Hono } from 'hono'
import { logger } from 'hono/logger'
import type { ContentFolder, ErrorSource, Flecha, Marco, RelationType, Sticky } from './types.js'
import { HttpError, type Master } from './master.js'

export interface ApiOptions {
  /** Request logging (method, path, status, ms) to console. A dev convenience. */
  dev: boolean
  /** When set, each request is logged as a line to this sink (the serve
   *  dashboard's LOGS panel) instead of the console. */
  onLog?: (line: string) => void
}

export function createApi(master: Master, opts: ApiOptions): Hono {
  const app = new Hono()

  // The dashboard sink and the console logger are mutually exclusive — the TUI
  // would be corrupted by console writes.
  if (opts.onLog) {
    app.use('*', async (c, next) => {
      const started = Date.now()
      await next()
      opts.onLog!(`${c.req.method.padEnd(4)} ${c.res.status}  ${c.req.path}  ${Date.now() - started}ms`)
    })
  } else if (opts.dev) {
    app.use('*', logger())
  }

  // Every failure becomes a uniform { error } body with a semantic status code.
  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status)
    console.error(err)
    return c.json({ error: 'Internal server error' }, 500)
  })
  app.notFound((c) => c.json({ error: `No route for ${c.req.method} ${c.req.path}` }, 404))

  // --- health ---------------------------------------------------------------
  app.get('/api/health', (c) => c.json({ ok: true, master: master.dir }))

  // --- reads (F2) -----------------------------------------------------------
  app.get('/api/graph', async (c) => c.json(await master.getGraph()))

  // Every recorded mistake across the project, resolved for the timeline.
  app.get('/api/errors', async (c) => c.json({ errores: await master.getErrors() }))

  // Canvas state: sticky-note annotations + saved needle positions (.telar/).
  app.get('/api/stickies', async (c) => c.json({ stickies: await master.getStickies() }))

  app.get('/api/layout', async (c) => c.json({ posiciones: await master.getLayout() }))

  app.get('/api/concept/:id', async (c) => c.json(await master.getConcept(c.req.param('id'))))

  app.get('/api/concept/:id/tests', async (c) => c.json(await master.getTests(c.req.param('id'))))

  app.get('/api/concept/:id/flashcards', async (c) =>
    c.json(await master.getFlashcards(c.req.param('id'))),
  )

  app.get('/api/concept/:id/challenges/:file/solution', async (c) => {
    const content = await master.getSolution(c.req.param('id'), c.req.param('file'))
    return c.json({ content })
  })

  // Raw bytes of a study document (PDF dropped into lessons/examples). A distinct
  // route — the JSON { content } wrapper below can't carry binary — registered
  // before the catch-all so the trailing /raw is matched, not treated as a file.
  app.get('/api/concept/:id/:folder/:file/raw', async (c) => {
    const folder = c.req.param('folder') as ContentFolder
    const file = c.req.param('file')
    const { data, contentType } = await master.getRawFile(c.req.param('id'), folder, file)
    c.header('Content-Type', contentType)
    c.header('Content-Disposition', `inline; filename="${encodeURIComponent(file)}"`)
    return c.body(data)
  })

  // getFile is the catch-all read — registered after the specific routes above.
  app.get('/api/concept/:id/:folder/:file', async (c) => {
    const folder = c.req.param('folder') as ContentFolder
    const content = await master.getFile(c.req.param('id'), folder, c.req.param('file'))
    return c.json({ content })
  })

  // --- writes (F5) ----------------------------------------------------------
  app.post('/api/concepts', async (c) => {
    const body = await c.req.json<{ nombre?: string; resumen?: string }>()
    const node = await master.createConcept(body.nombre ?? '', body.resumen ?? '')
    return c.json(node, 201)
  })

  app.post('/api/concept/:id/notes', async (c) => {
    const body = await c.req.json<{ title?: string; body?: string }>()
    const result = await master.createNote(c.req.param('id'), body.title ?? '', body.body ?? '')
    return c.json(result, 201)
  })

  app.put('/api/concept/:id/notes/:file', async (c) => {
    const body = await c.req.json<{ body?: string }>()
    await master.saveNote(c.req.param('id'), c.req.param('file'), body.body ?? '')
    return c.body(null, 204)
  })

  app.post('/api/concept/:id/challenges/:file/solution', async (c) => {
    const body = await c.req.json<{ body?: string }>()
    await master.saveSolution(c.req.param('id'), c.req.param('file'), body.body ?? '')
    return c.body(null, 204)
  })

  app.post('/api/concept/:id/errors', async (c) => {
    const body = await c.req.json<{ fuente?: ErrorSource; itemId?: string; nota?: string }>()
    await master.logError(c.req.param('id'), {
      fuente: body.fuente ?? 'test',
      itemId: body.itemId ?? '',
      nota: body.nota,
    })
    return c.body(null, 204)
  })

  app.post('/api/concept/:id/relations', async (c) => {
    const body = await c.req.json<{ id?: string; tipo?: RelationType }>()
    await master.addRelation(c.req.param('id'), {
      id: body.id ?? '',
      tipo: body.tipo ?? 'requiere',
    })
    return c.body(null, 204)
  })

  app.delete('/api/concept/:id/relations/:target', async (c) => {
    await master.removeRelation(c.req.param('id'), c.req.param('target'))
    return c.body(null, 204)
  })

  // --- canvas writes (stickies + layout) ------------------------------------
  app.post('/api/stickies', async (c) => {
    const body = await c.req.json<Partial<Omit<Sticky, 'id'>>>()
    return c.json(await master.createSticky(body), 201)
  })

  app.put('/api/stickies/:id', async (c) => {
    const body = await c.req.json<Partial<Omit<Sticky, 'id'>>>()
    return c.json(await master.updateSticky(c.req.param('id'), body))
  })

  app.delete('/api/stickies/:id', async (c) => {
    await master.deleteSticky(c.req.param('id'))
    return c.body(null, 204)
  })

  // --- canvas writes (roadmap arrows) ---------------------------------------
  app.get('/api/arrows', async (c) => c.json({ flechas: await master.getArrows() }))

  app.post('/api/arrows', async (c) => {
    const body = await c.req.json<Partial<Omit<Flecha, 'id'>>>()
    return c.json(await master.createArrow(body), 201)
  })

  app.put('/api/arrows/:id', async (c) => {
    const body = await c.req.json<Partial<Omit<Flecha, 'id'>>>()
    return c.json(await master.updateArrow(c.req.param('id'), body))
  })

  app.delete('/api/arrows/:id', async (c) => {
    await master.deleteArrow(c.req.param('id'))
    return c.body(null, 204)
  })

  // --- canvas writes (frames / regions) -------------------------------------
  // GET returns each frame with its derived `miembros` (concept ids inside it).
  app.get('/api/frames', async (c) => c.json({ marcos: await master.getFrames() }))

  app.post('/api/frames', async (c) => {
    const body = await c.req.json<Partial<Omit<Marco, 'id'>>>()
    return c.json(await master.createFrame(body), 201)
  })

  app.put('/api/frames/:id', async (c) => {
    const body = await c.req.json<Partial<Omit<Marco, 'id'>>>()
    return c.json(await master.updateFrame(c.req.param('id'), body))
  })

  app.delete('/api/frames/:id', async (c) => {
    await master.deleteFrame(c.req.param('id'))
    return c.body(null, 204)
  })

  app.put('/api/layout', async (c) => {
    const body = await c.req.json<{ posiciones?: Record<string, { x: number; y: number }> }>()
    await master.saveLayout(body.posiciones ?? {})
    return c.body(null, 204)
  })

  return app
}
