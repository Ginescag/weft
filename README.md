# Telar 🧵

**A loom for learning — weave concepts into a graph and study them with AI.**

[English](./README.md) · [Español](./README.es.md) — [HOWTO](./HOWTO.md) · [Contributing](./CONTRIBUTING.md)

![license: MIT](https://img.shields.io/badge/license-MIT-7A2E3A) ![node](https://img.shields.io/badge/node-%3E%3D20-3E6B54)

Telar is a **local-first learning tool**: an "AI harness to learn using AI". You
start a learning project and Telar renders its **concept graph** and its material
(lessons, examples, tests, challenges, flashcards) in your browser. An AI
assistant reads your graph and writes new material into it through an **MCP
server** — everything lands on disk as plain `.md` / `.json`, which is always the
source of truth.

The design language is **"bordado sobre lino" (embroidery on linen)**: the screen
is linen seen from above, concepts are **needle heads**, and prerequisites are
**taut burgundy threads**. Boldness is spent in one place — the graph; everything
else stays calm.

> Screenshots coming soon — run it locally to see the loom.

## Features

- **Graph canvas** — needle-head concepts on linen, threads for `requiere`
  (solid) and `relacionado_con` (dashed), smooth zoom, `Ctrl+K` search, add
  concepts, draw relations, box-select, **sticky-note regions** (free hex colour
  via a colour wheel) and thick **roadmap arrows**. Layout persists across loads.
- **Concept screens** — Lessons, Examples, Tests (with a recorded-mistakes
  timeline), Challenges (with a solution notepad), Flashcards and Notes.
- **PDFs in-app** — drop a `.pdf` into a concept's `lessons/` or `examples/` and
  read it rendered page-by-page (PDF.js), no download needed.
- **AI over MCP** — the `telar mcp` server lets an assistant (Claude Code / Claude
  Desktop) read the graph and write lessons, tests, flashcards, whole roadmaps and
  canvas layout — with the same validation the web app uses. Ships with reusable
  **prompts** and a **skill**.
- **Local-first** — no database. If the server dies, your work survives as files
  under `TELAR-MASTER/`.

## Quick start

**Prerequisites:** Node.js **20+**.

```bash
git clone <your-fork-url> telar
cd telar
npm install
npm run seed     # creates a starter TELAR-MASTER/ from examples/starter-master
npm run dev      # Vite on :5173, API on :3131
```

Open **http://localhost:5173**.

> On a machine whose HTTPS is intercepted by antivirus, plain `npm install` can
> fail with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. See [CONTRIBUTING.md](./CONTRIBUTING.md#installing-dependencies)
> for the `--cafile` workaround.

### Production (single process)

```bash
npm run build    # builds frontend + server into dist/
npm run serve    # or: node bin/telar.js — serves the built app + API on :3131
```

### Use it as a global command

Install `telar` once and run it from **any** folder — it remembers your project,
so you don't need the source checkout open to study. Telar isn't on npm yet, so
install from source:

```bash
npm install
npm run build
npm link            # puts `telar` on your PATH (or: npm install -g .)
```

Then, from anywhere:

```
telar               open the interactive menu (start · move project · quit)
telar serve         start the server directly
telar stop          stop a running server (alias: telar close)
telar path [dir]    show / change where your TELAR-MASTER lives
telar skill install install the Claude Code skill into ~/.claude/skills
telar mcp           start the MCP server (for AI tools)
telar help
```

The first `telar` with no saved project asks for a folder, creates
`TELAR-MASTER` there and remembers it. Full CLI guide (install, first run,
update, uninstall) in **[HOWTO.md §5](./HOWTO.md#5-use-telar-as-a-cli-install-once-use-it-anywhere)**.

## Drive it with AI (MCP)

Point an MCP client at `telar mcp`. In **Claude Code**:

```bash
claude mcp add telar -- node /absolute/path/to/telar/bin/telar.js mcp
```

In **Claude Desktop**, add a `telar` entry to `mcpServers` in
`claude_desktop_config.json`.

The assistant can then read your graph (`telar://graph`, `telar://errors`, …) and
write to it with tools (`build_subgraph`, `create_lesson`, `add_questions`, …). It
also ships:

- **Prompts** — one-click workflows: `build_roadmap`, `fill_concept`,
  `teach_concept`, `quiz_me`, `expand_concept`, `review_mistakes`. In Claude Code
  they're slash-commands (`/mcp__telar__build_roadmap`); in Claude Desktop they're
  under the **+** menu.
- **A Claude Code skill** — teaches the whole workflow and auto-loads in the repo;
  `telar skill install` makes it available in every session.

Full walkthrough (resources, tools, prompts, the skill) in
**[HOWTO.md §4](./HOWTO.md#4-drive-it-with-ai-mcp)**.

## Project structure

```
telar/
├── frontend/            Vite + React + TS (graph & concept screens)
├── server/              Hono backend + MCP server (filesystem layer in master.ts)
├── bin/telar.js         CLI entry point
├── examples/            starter-master/ — the seed for `npm run seed`
├── .claude/skills/      the bundled Telar skill (ships with the package)
├── IA-DOCS/             internal Spanish design docs (TELAR_PLAN, BACKEND_PLAN, MCP)
├── HOWTO.md             user guide (EN)   ·  HOWTO.es.md (ES)
└── CLAUDE.md            guidance for Claude Code working in this repo
```

`TELAR-MASTER/` (your actual learning project) is **git-ignored** — create it with
`npm run seed`, or point Telar at your own with `telar path <dir>`.

## Documentation

- **[HOWTO.md](./HOWTO.md)** / **[HOWTO.es.md](./HOWTO.es.md)** — the full user guide.
- **[IA-DOCS/](./IA-DOCS/README.md)** — the internal design & "how it was built"
  docs (Spanish).
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — dev setup, style, and how to send a PR.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) and our
[Code of Conduct](./CODE_OF_CONDUCT.md) first.

## License

[MIT](./LICENSE) © 2026 Ginés
