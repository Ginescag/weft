---
name: weft
description: >-
  Use when working with a Weft learning project over its MCP server (`weft mcp`):
  reading the concept graph, building a topic roadmap, generating lessons/examples/
  tests/flashcards, curating relations, reviewing recorded mistakes, or arranging the
  graph canvas (positions, region frames, sticky labels, roadmap arrows). Triggers on mentions of
  Weft, "concept graph/roadmap", building or filling out a learning map, or the
  `weft://` resources and Weft MCP tools.
---

# Using Weft over MCP

Weft is a local-first learning tool: a project is a folder of **concepts** (needles
in a graph) with markdown material, rendered as an "embroidery on linen" graph in a
browser. You drive it through the **`weft mcp`** server — the filesystem under
`WEFT-MASTER/` is always the source of truth, so every write lands as real `.md`/
`.json` on disk.

## Read first, then act

Read resources before writing so you don't duplicate or mislink:

- `weft://graph` — every concept + relation. **Read this first**, always.
- `weft://concept/{id}` — one concept's name and its lesson/example/challenge/note files.
- `weft://concept/{id}/{folder}/{file}` — the markdown of one file.
- `weft://errors` — every recorded mistake across the project, newest first, joined
  with the solution that was given.
- `weft://stickies`, `weft://layout`, `weft://arrows` — canvas state (sticky
  labels, saved needle positions, roadmap arrows).
- `weft://frames` — the region **frames** (named containers), each with its derived
  `miembros` (the concept ids inside it). Read this before laying a new topic so you
  build it in **empty space**, not on top of an existing subgraph.

## The core loop

1. **Lay a topic** — `build_subgraph` creates many concepts *and* their relations in
   one call (reference new concepts by `ref`, or reuse existing ids). This is the fast
   way to build a roadmap; `create_concept` + `add_relation` are the single-item forms.
   Pass **`marco`** (a frame id, or a `{nombre,x,y,ancho,alto}` spec) to drop the whole
   batch into a frame — the created concepts are **auto-placed inside its rect**, so a
   fresh roadmap lands tidily in reserved space instead of piling over old graphs.
2. **Fill concepts** — `create_lesson` / `create_example` / `create_challenge` each
   write a new markdown file; `edit_lesson` overwrites one; `add_questions` /
   `add_flashcards` append to the concept's `tests.json` / `flashcard.json`.
3. **Curate** — `update_concept` fixes a name/summary in place (id + links kept);
   `remove_relation` drops a link; `add_relations` adds several at once.
4. **Arrange the canvas** — `create_frame` (or `suggest_frame_region` → a free rect)
   reserves a **region** for a subgraph; `set_positions` merges needle x/y into the
   layout (omit a needle to leave it put); `create_sticky` labels a cluster;
   `create_arrow` draws a free roadmap arrow between regions. A sticky or frame can
   be **pinned** (`fijado: true` on create/update) to lock it in place — a drag over
   a pinned item pans the canvas instead of moving it; pin a finished roadmap frame
   so the user can't nudge it while panning.
5. **Review** — read `weft://errors` and re-quiz the weak concepts.

## Frames: keep a topic self-contained

A **frame** is a named region that encapsulates a subgraph. Use it to stop a new
roadmap tangling into (or covering) what's already on the canvas:

- **Place in empty space.** Read `weft://frames` + `weft://layout`, or call
  `suggest_frame_region`, to find a rectangle that doesn't overlap existing content.
- **Build inside it.** Prefer `build_subgraph(..., marco)` (creates/uses the frame and
  auto-lays-out the batch inside). Or `create_frame` first, then `set_positions` inside
  its rect.
- **Keep relations within the frame.** Only wire a `requiere`/`relacionado_con` to a
  concept *outside* the frame when the user explicitly wants to connect the new topic to
  an existing one — otherwise let the roadmap stand on its own.
- **Membership is by containment** (the frame's rect), computed from positions — you
  don't set it, and moving a needle in/out changes it. `create_frame`/`update_frame`/
  `delete_frame` manage the frames themselves; deleting a frame never touches the
  concepts inside it.

## How relations work (get the direction right)

A concept's relations list **its own prerequisites**. `add_relation(id, target, tipo)`
records that **`id` requires `target`** (an edge `target → id`). `tipo`:
`requiere` = strong prerequisite (solid thread), `relacionado_con` = weak/related
(dashed). For a graph that reads as a **roadmap**, give each concept **one primary
prerequisite** where you can; only a few defining concepts should take two. Fewer,
cleaner edges beat a dense web.

## Conventions baked into the data

- **ids are slugs** derived from the name (`"Vector databases"` → `vector-databases`);
  `build_subgraph`/`create_concept` return the real id — use it for later calls.
- **Summaries are 1–2 sentences** (`resumen`), shown on the graph hover card and in search.
- **Colours are hex** (`#7A2E3A`); the four preset names (`sand`/`moss`/`sky`/`rose`)
  are still accepted and mapped to hex.
- **Canvas coordinates** are graph-space; stickies clamp 100–6000 px, frames 200–40000 px,
  arrow width 3–240. Frame position (`x`,`y`) is its **centre**.
- Keep everything in the project's language and match the on-disk Spanish keys when a
  tool exposes them (`nombre`, `resumen`, `relaciones`, `titulo`, `posiciones`).

## Prompts (one-click workflows)

The server also exposes prompts a user can pick in their client — invoke or suggest them:

- **`build_roadmap(tema, enfoque?)`** — design and create a whole topic map in one pass,
  inside its own frame (self-contained in empty space).
- **`fill_concept(concepto)`** — draft + save a lesson, an example and a few questions.
- **`teach_concept(concepto)`** / **`quiz_me(concepto)`** — teach or quiz from a concept's material.
- **`expand_concept(concepto)`** — propose and add the missing prerequisites/sub-topics.
- **`review_mistakes`** — go over `weft://errors` and re-quiz the missed items.

## A typical request

"Build me a roadmap for X and fill in the first concept": read `weft://graph` +
`weft://frames` (or `suggest_frame_region`) for empty space → `build_subgraph` the
concepts + relations for X with a **`marco`** (a new frame titled "X") so the whole map
lands inside its own region → optionally `set_positions` left→right by depth and
`create_sticky` per sub-cluster → pick the entry concept and `create_lesson` +
`add_questions` for it. Verify by re-reading `weft://graph` and `weft://frames`.
