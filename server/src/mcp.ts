import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { createMaster } from './master.js'
import type { ContentFolder } from './types.js'


async function runTool(fn: () => Promise<unknown>) {
    try {
        const value = await fn()
        const text = JSON.stringify(value ?? { ok: true }, null, 2)
        return { content: [{ type: 'text' as const, text }] }
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${msg}` }] }
    }
}


export async function startMCPServer(masterDir: string): Promise<void> {
    const master = createMaster(masterDir)
    const mcpServer = new McpServer({ name: 'telar', version: '1.0.0' })

    mcpServer.registerResource(
        'graph',
        'telar://graph',
        {
            title: 'Get the graph of concepts',
            description: 'Returns every concept (node) and relation (edge) in the Telar project graph.',
            mimeType: 'application/json',
        },
        async (uri) => ({
            contents: [
                {
                    uri: uri.href,
                    mimeType: 'application/json',
                    text: JSON.stringify(await master.getGraph(), null, 2),
                },
            ],
        }),
    )


    mcpServer.registerResource(
        'concept',
        new ResourceTemplate('telar://concept/{id}', { list: undefined }),
        {
            title: 'Concept detail',
            description: 'A concept’s name and the lessons/examples/challenges/notes it holds.',
            mimeType: 'application/json',
        },
        async (uri, { id }) => ({
            contents: [
                {
                    uri: uri.href,
                    mimeType: 'application/json',
                    text: JSON.stringify(await master.getConcept(String(id)), null, 2),
                },
            ],
        }),
    )

    // The markdown body of one content file (a lesson, example, note, challenge).
    mcpServer.registerResource(
        'file',
        new ResourceTemplate('telar://concept/{id}/{folder}/{file}', { list: undefined }),
        {
            title: 'Content file',
            description: 'The markdown of a single lesson/example/note/challenge.',
            mimeType: 'text/markdown',
        },
            async (uri, { id, folder, file }) => ({
            contents: [
                {
                    uri: uri.href,
                    mimeType: 'text/markdown',
                    text: await master.getFile(String(id), String(folder) as ContentFolder, String(file)),
                },
            ],
        }),
    )

    // The concept's recorded mistakes (.errorlog), raw — for targeted review.
    mcpServer.registerResource(
        'errorlog',
        new ResourceTemplate('telar://concept/{id}/errorlog', { list: undefined }),
        {
            title: 'Concept error log',
            description: 'The mistakes recorded for one concept (.errorlog): fuente, itemId, fecha, nota.',
            mimeType: 'application/json',
        },
        async (uri, { id }) => ({
            contents: [
                {
                    uri: uri.href,
                    mimeType: 'application/json',
                    text: JSON.stringify(await master.getErrorLog(String(id)), null, 2),
                },
            ],
        }),
    )

    // Every mistake across the project, newest first, each joined with the
    // solution that was given (correct answer for tests, saved solution for
    // challenges) — the feed for "review my mistakes".
    mcpServer.registerResource(
        'errors',
        'telar://errors',
        {
            title: 'All recorded mistakes',
            description:
                'Every mistake across all concepts, newest first, joined with the solution that was given.',
            mimeType: 'application/json',
        },
        async (uri) => ({
            contents: [
                {
                    uri: uri.href,
                    mimeType: 'application/json',
                    text: JSON.stringify({ errores: await master.getErrors() }, null, 2),
                },
            ],
        }),
    )

    // The graph canvas annotations (region sticky notes), so the model can see
    // what's on the canvas before moving or relabelling regions.
    mcpServer.registerResource(
        'stickies',
        'telar://stickies',
        {
            title: 'Canvas sticky notes',
            description: 'The region sticky-note annotations on the graph canvas (.telar/stickies.json).',
            mimeType: 'application/json',
        },
        async (uri) => ({
            contents: [
                {
                    uri: uri.href,
                    mimeType: 'application/json',
                    text: JSON.stringify({ stickies: await master.getStickies() }, null, 2),
                },
            ],
        }),
    )

    // The saved x/y position of every needle — read it before repositioning so a
    // set_positions call can merge instead of guessing coordinates.
    mcpServer.registerResource(
        'layout',
        'telar://layout',
        {
            title: 'Saved needle positions',
            description: 'The saved { x, y } canvas position of each needle (.telar/layout.json).',
            mimeType: 'application/json',
        },
        async (uri) => ({
            contents: [
                {
                    uri: uri.href,
                    mimeType: 'application/json',
                    text: JSON.stringify({ posiciones: await master.getLayout() }, null, 2),
                },
            ],
        }),
    )

    // Roadmap arrows drawn on the canvas (free annotations, not relations).
    mcpServer.registerResource(
        'arrows',
        'telar://arrows',
        {
            title: 'Canvas roadmap arrows',
            description: 'The free-floating roadmap arrows drawn on the graph canvas (.telar/arrows.json).',
            mimeType: 'application/json',
        },
        async (uri) => ({
            contents: [
                {
                    uri: uri.href,
                    mimeType: 'application/json',
                    text: JSON.stringify({ flechas: await master.getArrows() }, null, 2),
                },
            ],
        }),
    )

    // Frames (regions) on the canvas: named containers that encapsulate a
    // subgraph. Each frame carries its derived `miembros` (the concept ids inside
    // its rect) — read this before building so you place new work in an empty
    // region and keep its relations within the frame.
    mcpServer.registerResource(
        'frames',
        'telar://frames',
        {
            title: 'Canvas frames (regions)',
            description:
                'The frames (regions) on the graph canvas (.telar/frames.json), each with its derived members (concept ids inside it). Use frames to keep a subgraph self-contained.',
            mimeType: 'application/json',
        },
        async (uri) => ({
            contents: [
                {
                    uri: uri.href,
                    mimeType: 'application/json',
                    text: JSON.stringify({ marcos: await master.getFrames() }, null, 2),
                },
            ],
        }),
    )

    // === Prompts (reusable learning workflows the user picks in their client) ==
    // Each returns guidance messages that point the model at Telar's resources
    // and tools — a one-click way to drive the common Telar tasks well.

    mcpServer.registerPrompt(
        'teach_concept',
        {
            title: 'Teach me a concept',
            description: 'Read a concept and its material, then teach it and check understanding.',
            argsSchema: { concepto: z.string().describe('the concept id or name to learn') },
        },
        ({ concepto }) => ({
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `Teach me the Telar concept "${concepto}".
1. If "${concepto}" is a name, read telar://graph to find its id.
2. Read telar://concept/{id} for its lessons/examples, then read those files (telar://concept/{id}/lessons/{file}).
3. Teach it clearly and progressively, grounded in that material and its prerequisites (the concept's relaciones).
4. Finish by checking my understanding with 2–3 quick questions.
If the concept has little or no material, offer to write a lesson with create_lesson (or run the fill_concept prompt).`,
                    },
                },
            ],
        }),
    )

    mcpServer.registerPrompt(
        'quiz_me',
        {
            title: 'Quiz me on a concept',
            description: 'Quiz me on a concept and record which items I miss.',
            argsSchema: { concepto: z.string().describe('the concept id or name to be quizzed on') },
        },
        ({ concepto }) => ({
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `Quiz me on the Telar concept "${concepto}".
1. Resolve its id via telar://graph if needed and read telar://concept/{id} plus its lesson files for grounding.
2. Ask me 5 questions one at a time, wait for each answer, then tell me if I was right and why.
3. Offer to save the good questions to the concept with add_questions so they persist.
Keep it focused on this concept and its prerequisites.`,
                    },
                },
            ],
        }),
    )

    mcpServer.registerPrompt(
        'build_roadmap',
        {
            title: 'Build a roadmap for a topic',
            description: 'Design a complete concept roadmap for a topic and create it in one pass.',
            argsSchema: {
                tema: z.string().describe('the topic to map, e.g. "Kubernetes" or "linear algebra"'),
                enfoque: z.string().optional().describe('optional angle/level, e.g. "for backend devs, hands-on"'),
            },
        },
        ({ tema, enfoque }) => ({
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `Build a complete Telar concept roadmap for "${tema}"${enfoque ? ` (focus: ${enfoque})` : ''}.
1. Read telar://graph (so you don't duplicate concepts) and telar://frames + telar://layout to see what's already on the canvas and where there's empty space. If unsure where to place the new map, call suggest_frame_region.
2. Design the map: each concept gets a short 1–2 sentence resumen and, for legibility, a SINGLE primary prerequisite where possible (a few defining concepts may take two).
3. Create it all in ONE call with build_subgraph, passing \`marco\` as a new frame spec in the empty region (titled "${tema}"): the concepts are auto-placed inside the frame, so the whole roadmap lands tidily in reserved space and reads as self-contained.
4. Keep relations WITHIN this frame. Only reuse an existing concept id as a prerequisite if the user explicitly wants to connect this new topic to an older one — otherwise let the roadmap stand on its own (this is what stops new maps tangling into old ones).
5. Optionally refine with set_positions (left→right by depth) and label sub-clusters with create_sticky.
Keep relations simple so the graph reads as a roadmap, not a web.`,
                    },
                },
            ],
        }),
    )

    mcpServer.registerPrompt(
        'expand_concept',
        {
            title: 'Expand a concept',
            description: 'Propose and add the missing prerequisites and sub-topics around a concept.',
            argsSchema: { concepto: z.string().describe('the concept id or name to expand around') },
        },
        ({ concepto }) => ({
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `Expand the Telar graph around "${concepto}".
1. Read telar://graph, telar://concept/{id} and telar://frames to see what already exists, how it connects, and whether the concept sits inside a frame (region).
2. Propose the missing prerequisites (what you should know before it) and sub-topics (what it leads to), each with a short resumen.
3. Show me the proposed additions, then create them with build_subgraph (or add_relation for links between existing concepts). If the concept lives inside a frame, pass that frame's id as \`marco\` so the new nodes join the same region, and keep the new relations within it.
Keep each new concept to one primary prerequisite so the graph stays legible.`,
                    },
                },
            ],
        }),
    )

    mcpServer.registerPrompt(
        'fill_concept',
        {
            title: 'Fill a concept with material',
            description: 'Draft and save a lesson, an example and a few test questions for a concept.',
            argsSchema: { concepto: z.string().describe('the concept id or name to fill with material') },
        },
        ({ concepto }) => ({
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `Write study material for the Telar concept "${concepto}".
1. Resolve its id via telar://graph and read telar://concept/{id} to see what's already there (don't duplicate).
2. Draft, and save each with its tool:
   - a clear lesson in markdown → create_lesson
   - one worked example → create_example
   - 3–5 multiple-choice questions with explanations → add_questions
Ground everything in the concept and its prerequisites; keep it accurate and concise.`,
                    },
                },
            ],
        }),
    )

    mcpServer.registerPrompt(
        'review_mistakes',
        {
            title: 'Review my mistakes',
            description: 'Go over my recorded mistakes across the project and re-quiz the missed items.',
        },
        () => ({
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `Help me review my Telar mistakes.
1. Read telar://errors (every recorded miss, newest first, with the solution that was given).
2. Group them by concept and, for each, restate the correct answer and why briefly.
3. Then re-quiz me on the concepts I most often get wrong, one question at a time.
If a pattern of errors suggests a concept is weak, offer to run quiz_me or fill_concept on it.`,
                    },
                },
            ],
        }),
    )

    // === Tools (writes — the model's "hands") ===============================

    mcpServer.registerTool(
        'create_concept',
        {
            title: 'Create concept',
            description:
                'Create ONE new concept (a needle in the graph) from a name + 1–2 sentence summary; the id is slugified from the name and returned. For several concepts at once — or to wire their relations in the same call — prefer build_subgraph.',
            inputSchema: {
                nombre: z.string().min(1).describe('the concept name, e.g. "Vector databases"'),
                resumen: z.string().default('').describe('1–2 sentence summary shown on the graph hover card'),
            },
        },
        async ({ nombre, resumen }) => runTool(() => master.createConcept(nombre, resumen)),
    )

    mcpServer.registerTool(
        'add_relation',
        {
            title: 'Add relation',
            description:
                'Add a prerequisite/related link, stored on `id`: it records that `id` depends on `target` ("`id` requiere `target`"). tipo "requiere" = strong prerequisite (solid thread); "relacionado_con" = weak related (dashed). Idempotent. For many links use add_relations; to also create the concepts use build_subgraph.',
            inputSchema: {
                id: z.string().min(1).describe('the dependent concept — the one that gains the link'),
                target: z.string().min(1).describe('its prerequisite / related concept id'),
                tipo: z.enum(['requiere', 'relacionado_con']),
            },
            annotations: { idempotentHint: true },
        },
        async ({ id, target, tipo }) => runTool(() => master.addRelation(id, { id: target, tipo })),
    )

    mcpServer.registerTool(
        'remove_relation',
        {
            title: 'Remove relation',
            description:
                'Drop the link from `id` to `target` (the inverse of add_relation). Idempotent — a no-op if the link is absent. The concepts themselves are untouched.',
            inputSchema: {
                id: z.string().min(1).describe('the concept that holds the relation'),
                target: z.string().min(1).describe('the prerequisite / related concept id to unlink'),
            },
            annotations: { destructiveHint: true, idempotentHint: true },
        },
        async ({ id, target }) => runTool(() => master.removeRelation(id, target)),
    )

    mcpServer.registerTool(
        'update_concept',
        {
            title: 'Update concept',
            description:
                "Edit a concept's display name and/or summary in place. The id (folder) and all its relations are preserved, so links stay valid — use this to fix a name or reword a resumen without recreating the node.",
            inputSchema: {
                id: z.string().min(1).describe('the concept id to edit'),
                nombre: z.string().min(1).optional().describe('new display name (optional)'),
                resumen: z.string().optional().describe('new 1–2 sentence summary (optional)'),
            },
            annotations: { idempotentHint: true },
        },
        async ({ id, nombre, resumen }) => runTool(() => master.updateConcept(id, { nombre, resumen })),
    )

    mcpServer.registerTool(
        'build_subgraph',
        {
            title: 'Build subgraph (batch)',
            description:
                'Create many concepts AND wire their relations in ONE call — the fast way to lay down a whole topic map. Each relation references concepts by their `ref` (from this call) or by an existing concept id. Pass `marco` to drop the whole batch into a frame (region): the created concepts are auto-placed inside it, so a fresh roadmap lands tidily in reserved space instead of piling on top of existing subgraphs — and it reads as self-contained.',
            inputSchema: {
                concepts: z
                    .array(
                        z.object({
                            ref: z
                                .string()
                                .optional()
                                .describe('local alias used by relations in this call (defaults to nombre)'),
                            nombre: z.string().min(1).describe('the concept name'),
                            resumen: z.string().default('').describe('1–2 sentence summary'),
                        }),
                    )
                    .default([]),
                relations: z
                    .array(
                        z.object({
                            from: z
                                .string()
                                .min(1)
                                .describe('the dependent concept — a ref from this call or an existing id'),
                            to: z
                                .string()
                                .min(1)
                                .describe('the prerequisite / related concept — a ref or an existing id'),
                            tipo: z.enum(['requiere', 'relacionado_con']),
                        }),
                    )
                    .default([]),
                marco: z
                    .union([
                        z.string().describe('the id of an existing frame to place the batch in'),
                        z.object({
                            nombre: z.string().optional().describe('the new frame’s title'),
                            x: z.number().optional().describe('frame centre x (canvas coords)'),
                            y: z.number().optional().describe('frame centre y (canvas coords)'),
                            ancho: z.number().optional().describe('frame width (200–40000)'),
                            alto: z.number().optional().describe('frame height (200–40000)'),
                            color: z.string().optional().describe('hex colour or preset name'),
                        }),
                    ])
                    .optional()
                    .describe(
                        'optional frame to encapsulate the batch: an existing frame id, or a spec to create one. Created concepts are auto-laid-out inside its rect.',
                    ),
            },
        },
        async ({ concepts, relations, marco }) =>
            runTool(() => master.buildSubgraph(concepts, relations, marco)),
    )

    mcpServer.registerTool(
        'add_relations',
        {
            title: 'Add relations (batch)',
            description: 'Add several relations between EXISTING concepts in one call.',
            inputSchema: {
                relations: z
                    .array(
                        z.object({
                            id: z.string().min(1).describe('the concept that gains the relation'),
                            target: z.string().min(1).describe('the prerequisite / related concept id'),
                            tipo: z.enum(['requiere', 'relacionado_con']),
                        }),
                    )
                    .min(1),
            },
        },
        async ({ relations }) =>
            runTool(async () => {
                for (const r of relations) await master.addRelation(r.id, { id: r.target, tipo: r.tipo })
                return { added: relations.length }
            }),
    )

    mcpServer.registerTool(
        'create_note',
        {
            title: 'Create note',
            description: 'Create a markdown note inside a concept.',
            inputSchema: {
                id: z.string().min(1).describe('the concept id the note belongs to'),
                title: z.string().min(1).describe('the note title (becomes the # heading and the filename)'),
                body: z.string().default('').describe('markdown body under the heading'),
            },
        },
        async ({ id, title, body }) => runTool(() => master.createNote(id, title, body)),
    )

    // === Tools: content generation (what the AI uses to fill a concept) =====

    mcpServer.registerTool(
        'create_lesson',
        {
            title: 'Create lesson',
            description:
                'Write a NEW lesson as its own markdown file in the concept’s lessons/ folder (call again for another lesson). To rewrite an existing lesson instead, use edit_lesson with its filename.',
            inputSchema: {
                id: z.string().min(1).describe('the concept id'),
                title: z.string().min(1).describe('lesson title (becomes the # heading and the filename)'),
                body: z.string().default('').describe('the lesson body in markdown'),
            },
        },
        async ({ id, title, body }) => runTool(() => master.createLesson(id, title, body)),
    )

    mcpServer.registerTool(
        'edit_lesson',
        {
            title: 'Edit lesson',
            description: 'Overwrite ONE existing lesson, addressed by its filename. Use the full markdown incl. heading.',
            inputSchema: {
                id: z.string().min(1).describe('the concept id'),
                file: z.string().min(1).describe('the lesson filename to overwrite, e.g. "what-is-rag.md"'),
                body: z.string().describe('the full new markdown content of the lesson'),
            },
        },
        async ({ id, file, body }) => runTool(() => master.saveLesson(id, file, body)),
    )

    mcpServer.registerTool(
        'create_example',
        {
            title: 'Create example',
            description: 'Write a worked example (markdown) as its own file in the concept’s examples/ folder.',
            inputSchema: {
                id: z.string().min(1),
                title: z.string().min(1),
                body: z.string().default(''),
            },
        },
        async ({ id, title, body }) => runTool(() => master.createExample(id, title, body)),
    )

    mcpServer.registerTool(
        'create_challenge',
        {
            title: 'Create challenge',
            description: 'Write a challenge/exercise (markdown) as its own file in the concept’s challenges/ folder.',
            inputSchema: {
                id: z.string().min(1),
                title: z.string().min(1),
                body: z.string().default(''),
            },
        },
        async ({ id, title, body }) => runTool(() => master.createChallenge(id, title, body)),
    )

    mcpServer.registerTool(
        'add_questions',
        {
            title: 'Add test questions',
            description: 'Append one or more multiple-choice questions to the concept’s tests.json (incremental).',
            inputSchema: {
                id: z.string().min(1),
                preguntas: z
                .array(
                    z.object({
                        enunciado: z.string().min(1).describe('the question text'),
                        opciones: z.array(z.string()).min(2).describe('the answer options'),
                        correcta: z.number().int().min(0).describe('index (0-based) of the correct option'),
                        explicacion: z.string().default('').describe('why the correct option is correct'),
                    }),
                )
                .min(1),
            },
        },
        async ({ id, preguntas }) => runTool(() => master.addQuestions(id, preguntas)),
    )

    mcpServer.registerTool(
        'add_flashcards',
        {
            title: 'Add flashcards',
            description: 'Append one or more flashcards to the concept’s flashcard.json (incremental).',
            inputSchema: {
                id: z.string().min(1),
                tarjetas: z
                .array(
                    z.object({
                    anverso: z.string().min(1).describe('front of the card (the prompt)'),
                    reverso: z.string().min(1).describe('back of the card (the answer)'),
                    }),
                )
                .min(1),
            },
        },
        async ({ id, tarjetas }) => runTool(() => master.addFlashcards(id, tarjetas)),
    )

    mcpServer.registerTool(
        'log_error',
        {
            title: 'Log a mistake',
            description: 'Record a mistake in the concept’s .errorlog (seeds spaced repetition). Date is filled in.',
            inputSchema: {
                id: z.string().min(1),
                fuente: z.enum(['test', 'challenge']).describe('where the mistake happened'),
                itemId: z.string().min(1).describe('the failed question id or challenge filename'),
                nota: z.string().optional().describe('optional note on what went wrong'),
            },
        },
        async ({ id, fuente, itemId, nota }) => runTool(() => master.logError(id, { fuente, itemId, nota })),
    )

    // === Tools: canvas (region stickies + needle positions) ================

    mcpServer.registerTool(
        'create_sticky',
        {
            title: 'Create sticky note',
            description:
                'Add a region sticky note to the graph canvas — a big titled label that sits under the needles. Ideal for framing a subgraph. Position/size are canvas coordinates (100–6000 px).',
            inputSchema: {
                titulo: z.string().default('').describe('the big title shown on the sticky'),
                texto: z.string().default('').describe('optional body text under the title'),
                color: z
                    .string()
                    .default('#eae0bf')
                    .describe('hex colour like "#7A2E3A", or a preset name (sand/moss/sky/rose)'),
                x: z.number().default(0).describe('canvas x of the top-left corner'),
                y: z.number().default(0).describe('canvas y of the top-left corner'),
                ancho: z.number().default(260).describe('width in px (100–6000)'),
                alto: z.number().default(170).describe('height in px (100–6000)'),
                fijado: z
                    .boolean()
                    .default(false)
                    .describe('pin it in place so a drag over it pans the canvas instead of moving it'),
            },
        },
        async ({ titulo, texto, color, x, y, ancho, alto, fijado }) =>
            runTool(() => master.createSticky({ titulo, texto, color, x, y, ancho, alto, fijado })),
    )

    mcpServer.registerTool(
        'update_sticky',
        {
            title: 'Update sticky note',
            description: 'Edit an existing sticky note (any subset of fields).',
            inputSchema: {
                id: z.string().min(1).describe('the sticky id, e.g. "s1"'),
                titulo: z.string().optional(),
                texto: z.string().optional(),
                color: z.string().optional().describe('hex colour or a preset name (sand/moss/sky/rose)'),
                x: z.number().optional(),
                y: z.number().optional(),
                ancho: z.number().optional(),
                alto: z.number().optional(),
                fijado: z.boolean().optional().describe('pin (true) or free (false) it on the canvas'),
            },
            annotations: { idempotentHint: true },
        },
        async ({ id, ...patch }) => runTool(() => master.updateSticky(id, patch)),
    )

    mcpServer.registerTool(
        'delete_sticky',
        {
            title: 'Delete sticky note',
            description: 'Remove a sticky note from the canvas. Idempotent — a no-op if it is already gone.',
            inputSchema: { id: z.string().min(1).describe('the sticky id, e.g. "s1"') },
            annotations: { destructiveHint: true, idempotentHint: true },
        },
        async ({ id }) => runTool(() => master.deleteSticky(id)),
    )

    mcpServer.registerTool(
        'set_positions',
        {
            title: 'Set needle positions',
            description:
                'Set the { x, y } canvas position of one or more needles. Merges into the saved layout — needles you omit keep their current spot.',
            inputSchema: {
                posiciones: z
                    .record(z.string(), z.object({ x: z.number(), y: z.number() }))
                    .describe('map of concept id → { x, y }'),
            },
            annotations: { idempotentHint: true },
        },
        async ({ posiciones }) =>
            runTool(async () => {
                const merged = { ...(await master.getLayout()), ...posiciones }
                await master.saveLayout(merged)
                return { updated: Object.keys(posiciones).length, total: Object.keys(merged).length }
            }),
    )

    mcpServer.registerTool(
        'create_arrow',
        {
            title: 'Create roadmap arrow',
            description:
                'Draw a free-floating roadmap arrow on the canvas (a thick directed line, like a sticker — not a concept relation). Endpoints are canvas coordinates; use it to show flow between regions.',
            inputSchema: {
                x1: z.number().describe('canvas x of the start (tail)'),
                y1: z.number().describe('canvas y of the start (tail)'),
                x2: z.number().describe('canvas x of the end (arrowhead)'),
                y2: z.number().describe('canvas y of the end (arrowhead)'),
                color: z.string().default('#7a2e3a').describe('hex colour (default burgundy)'),
                ancho: z.number().default(14).describe('stroke width in px (3–240; thick = roadmap)'),
            },
        },
        async ({ x1, y1, x2, y2, color, ancho }) =>
            runTool(() => master.createArrow({ x1, y1, x2, y2, color, ancho })),
    )

    mcpServer.registerTool(
        'update_arrow',
        {
            title: 'Update roadmap arrow',
            description: 'Edit an existing roadmap arrow (any subset: endpoints, colour, width).',
            inputSchema: {
                id: z.string().min(1).describe('the arrow id, e.g. "a1"'),
                x1: z.number().optional(),
                y1: z.number().optional(),
                x2: z.number().optional(),
                y2: z.number().optional(),
                color: z.string().optional(),
                ancho: z.number().optional(),
            },
            annotations: { idempotentHint: true },
        },
        async ({ id, ...patch }) => runTool(() => master.updateArrow(id, patch)),
    )

    mcpServer.registerTool(
        'delete_arrow',
        {
            title: 'Delete roadmap arrow',
            description: 'Remove a roadmap arrow from the canvas. Idempotent — a no-op if it is already gone.',
            inputSchema: { id: z.string().min(1).describe('the arrow id, e.g. "a1"') },
            annotations: { destructiveHint: true, idempotentHint: true },
        },
        async ({ id }) => runTool(() => master.deleteArrow(id)),
    )

    // === Tools: frames (regions that encapsulate a subgraph) ================

    mcpServer.registerTool(
        'create_frame',
        {
            title: 'Create frame (region)',
            description:
                'Add a frame — a named, bounded region drawn under the needles that encapsulates a subgraph. Place new concepts INSIDE its rect and keep their relations within it, so a topic reads as self-contained instead of wired into everything else. Position (x,y = centre) and size are canvas coordinates (200–40000 px). Tip: for a whole roadmap, prefer build_subgraph with `marco` so the concepts are auto-placed inside.',
            inputSchema: {
                nombre: z.string().default('').describe('the frame’s title, shown on its tab'),
                x: z.number().default(0).describe('canvas x of the frame centre'),
                y: z.number().default(0).describe('canvas y of the frame centre'),
                ancho: z.number().default(900).describe('width in px (200–40000)'),
                alto: z.number().default(600).describe('height in px (200–40000)'),
                color: z.string().default('#7a2e3a').describe('hex colour or a preset name (sand/moss/sky/rose)'),
                fijado: z
                    .boolean()
                    .default(false)
                    .describe('pin it in place so a drag over it pans the canvas instead of moving the region'),
            },
        },
        async ({ nombre, x, y, ancho, alto, color, fijado }) =>
            runTool(() => master.createFrame({ nombre, x, y, ancho, alto, color, fijado })),
    )

    mcpServer.registerTool(
        'update_frame',
        {
            title: 'Update frame (region)',
            description: 'Edit an existing frame (any subset: title, colour, position, size). Membership is derived from position, so moving/resizing a frame re-captures the needles inside it.',
            inputSchema: {
                id: z.string().min(1).describe('the frame id, e.g. "f1"'),
                nombre: z.string().optional(),
                x: z.number().optional(),
                y: z.number().optional(),
                ancho: z.number().optional(),
                alto: z.number().optional(),
                color: z.string().optional().describe('hex colour or a preset name'),
                fijado: z.boolean().optional().describe('pin (true) or free (false) the region on the canvas'),
            },
            annotations: { idempotentHint: true },
        },
        async ({ id, ...patch }) => runTool(() => master.updateFrame(id, patch)),
    )

    mcpServer.registerTool(
        'delete_frame',
        {
            title: 'Delete frame (region)',
            description:
                'Remove a frame from the canvas. Idempotent — a no-op if it is already gone. The concepts inside are untouched (membership is derived, not stored).',
            inputSchema: { id: z.string().min(1).describe('the frame id, e.g. "f1"') },
            annotations: { destructiveHint: true, idempotentHint: true },
        },
        async ({ id }) => runTool(() => master.deleteFrame(id)),
    )

    mcpServer.registerTool(
        'suggest_frame_region',
        {
            title: 'Suggest an empty region',
            description:
                'Return an empty rectangle (canvas coords) beside the existing content, so you can drop a new frame / subgraph there without overlapping what is already on the canvas. Read-only.',
            inputSchema: {
                ancho: z.number().default(1400).describe('desired region width (px)'),
                alto: z.number().default(900).describe('desired region height (px)'),
            },
            annotations: { readOnlyHint: true },
        },
        async ({ ancho, alto }) =>
            runTool(async () => {
                const layout = await master.getLayout()
                const pts = Object.values(layout)
                const gap = 400
                if (pts.length === 0) {
                    return { nombre: '', x: 0, y: 0, ancho, alto }
                }
                // Place the new region to the right of everything drawn so far.
                const maxX = Math.max(...pts.map((p) => p.x))
                const ys = pts.map((p) => p.y)
                const midY = Math.round((Math.min(...ys) + Math.max(...ys)) / 2)
                return {
                    nombre: '',
                    x: Math.round(maxX + gap + ancho / 2),
                    y: midY,
                    ancho,
                    alto,
                }
            }),
    )

    // === Connect over stdio =================================================
    const transport = new StdioServerTransport()
    await mcpServer.connect(transport)
    console.error(`telar mcp → serving ${masterDir} over stdio`) // stderr, not stdout!
}