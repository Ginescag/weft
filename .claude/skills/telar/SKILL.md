---
name: telar
description: >-
  Use when working with a Telar learning project over its MCP server (`telar mcp`):
  reading the concept graph, building a topic roadmap, generating lessons/examples/
  tests/flashcards, curating relations, reviewing recorded mistakes, or arranging the
  graph canvas (positions, region stickies, roadmap arrows). Triggers on mentions of
  Telar, "concept graph/roadmap", building or filling out a learning map, or the
  `telar://` resources and Telar MCP tools.
---

# Using Telar over MCP

Telar is a local-first learning tool: a project is a folder of **concepts** (needles
in a graph) with markdown material, rendered as an "embroidery on linen" graph in a
browser. You drive it through the **`telar mcp`** server — the filesystem under
`TELAR-MASTER/` is always the source of truth, so every write lands as real `.md`/
`.json` on disk.

## Read first, then act

Read resources before writing so you don't duplicate or mislink:

- `telar://graph` — every concept + relation. **Read this first**, always.
- `telar://concept/{id}` — one concept's name and its lesson/example/challenge/note files.
- `telar://concept/{id}/{folder}/{file}` — the markdown of one file.
- `telar://errors` — every recorded mistake across the project, newest first, joined
  with the solution that was given.
- `telar://stickies`, `telar://layout`, `telar://arrows` — canvas state (region
  labels, saved needle positions, roadmap arrows).

## The core loop

1. **Lay a topic** — `build_subgraph` creates many concepts *and* their relations in
   one call (reference new concepts by `ref`, or reuse existing ids). This is the fast
   way to build a roadmap; `create_concept` + `add_relation` are the single-item forms.
2. **Fill concepts** — `create_lesson` / `create_example` / `create_challenge` each
   write a new markdown file; `edit_lesson` overwrites one; `add_questions` /
   `add_flashcards` append to the concept's `tests.json` / `flashcard.json`.
3. **Curate** — `update_concept` fixes a name/summary in place (id + links kept);
   `remove_relation` drops a link; `add_relations` adds several at once.
4. **Arrange the canvas** — `set_positions` merges needle x/y into the layout (omit a
   needle to leave it put); `create_sticky` frames a cluster as a labelled region;
   `create_arrow` draws a free roadmap arrow between regions.
5. **Review** — read `telar://errors` and re-quiz the weak concepts.

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
- **Canvas coordinates** are graph-space; stickies clamp 100–6000 px, arrow width 3–240.
- Keep everything in the project's language and match the on-disk Spanish keys when a
  tool exposes them (`nombre`, `resumen`, `relaciones`, `titulo`, `posiciones`).

## Prompts (one-click workflows)

The server also exposes prompts a user can pick in their client — invoke or suggest them:

- **`build_roadmap(tema, enfoque?)`** — design and create a whole topic map in one pass.
- **`fill_concept(concepto)`** — draft + save a lesson, an example and a few questions.
- **`teach_concept(concepto)`** / **`quiz_me(concepto)`** — teach or quiz from a concept's material.
- **`expand_concept(concepto)`** — propose and add the missing prerequisites/sub-topics.
- **`review_mistakes`** — go over `telar://errors` and re-quiz the missed items.

## A typical request

"Build me a roadmap for X and fill in the first concept": read `telar://graph` →
`build_subgraph` the concepts + relations for X → `set_positions` left→right by depth →
`create_sticky` per cluster → pick the entry concept and `create_lesson` +
`add_questions` for it. Verify by re-reading `telar://graph`.
