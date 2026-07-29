# Telar — HOWTO

A task-based guide to running and using Telar. For a quick overview, see the
[README](./README.md). Español: [HOWTO.es.md](./HOWTO.es.md).

---

## 1. Install & run

**Prerequisites:** Node.js 20+.

```bash
npm install
npm run seed     # first time only — scaffolds TELAR-MASTER/ from the starter example
```

### Development (two servers, hot reload)

```bash
npm run dev
```

- Frontend (Vite): **http://localhost:5173**
- Backend (Hono API): **http://localhost:3131**

The frontend proxies `/api` to the backend, and the dev backend reads
`../TELAR-MASTER`. Open :5173.

### Production (one process serves everything)

```bash
npm run build
npm run serve        # == node bin/telar.js
```

One process serves the built app **and** the API on :3131 (open that URL). Deep
links work on reload (SPA fallback).

---

## 2. Your learning project (`TELAR-MASTER/`)

A project is just a folder of concepts on disk. There are three ways to get one:

- **`npm run seed`** — copies `examples/starter-master/` to `TELAR-MASTER/` (a small
  RAG roadmap: embeddings → chunking / retrieval → rag). No-op if it already exists.
- **Managed first run** — run `telar` (no args) with no saved project and it asks
  for a **parent** folder, then creates `<parent>/TELAR-MASTER` and remembers it.
- **Point at your own** — `telar path <dir>` sets `<dir>/TELAR-MASTER` (created if
  missing, adopted if it already holds a project). `telar path` prints the current
  location.

Everything lives **inside** the master folder, so a project is self-contained and
portable (like `.git` in a repo):

```
TELAR-MASTER/
├── <concept>/
│   ├── .meta            id, nombre, resumen, relaciones (prerequisites)
│   ├── .errorlog        recorded mistakes
│   ├── tests.json       multiple-choice questions
│   ├── flashcard.json   flashcards
│   ├── lessons/  examples/  challenges/  notes/   (.md; lessons/examples also take .pdf)
│   └── <subconcept>/    nested, same structure
└── .telar/              graph.json (cache) + stickies.json, arrows.json, layout.json
```

> A concept's `relaciones` list **its own prerequisites**. `A requiere B` draws a
> solid thread `B → A`; `relacionado_con` draws a dashed one.

---

## 3. Using the graph

- **Explore** — pan (drag the linen), zoom (wheel), **Fit** to frame everything.
  Hover a needle for its summary; click to open the concept.
- **Search** — `Ctrl+K` opens the palette; type to jump to any concept.
- **Add a concept** — the *Add concept* button; give it a name and summary.
- **Draw a thread** — enter draw mode, drag needle → needle, then pick `requiere`
  or `relacionado_con`.
- **Select & edit** — `Shift`+drag box-selects needles / threads / stickies. Tap a
  thread to **cut** it (Del/Backspace). Group-drag moves a selection.
- **Sticky notes** — add a linen sticky from the canvas button to label a region;
  it's a big title + optional body, **resizable by the corner grip**, colour via a
  **colour wheel** (free hex). Double-click to edit. Stickies sit *under* the
  needles and never navigate.
- **Roadmap arrows** — add a thick directed arrow (`+ arrow`) as a free sticker
  between regions; drag its endpoints, double-click the mid dot to set
  colour/thickness, Del to remove.

Needle positions, stickies and arrows persist to `.telar/`, so your layout is
stable across reloads.

### Inside a concept

Six tabs: **Lessons**, **Examples**, **Tests**, **Challenges**, **Flashcards**,
**Notes**.

- **Tests** — answer and check; each miss is recorded to `.errorlog`. The graph's
  **Mistakes** timeline (`/errors`) shows every recorded mistake, newest first,
  with the correct answer + explanation.
- **Challenges** — read the prompt and write your attempt in the embedded solution
  notepad (saved to `challenges/.solutions/`).
- **Notes** — create your own markdown notes.

### Reading PDFs

Drop a `.pdf` into a concept's `lessons/` or `examples/` folder. Telar renders it
**in-app**, page by page (PDF.js), with a Download link. (Markdown files render as
formatted text as usual.)

---

## 4. Drive it with AI (MCP)

The MCP server (`telar mcp`) exposes your project to an AI assistant over stdio:
it can **read** the graph and **write** lessons, examples, tests, flashcards,
whole roadmaps, and canvas layout — all through the same validation as the web.

### Claude Code

```bash
claude mcp add telar -- node /absolute/path/to/telar/bin/telar.js mcp
```

Then, in a Claude Code session, the tools appear as `mcp__telar__*` and the
prompts as slash-commands (type `/` and filter `telar`). Install the skill so
Claude auto-loads the Telar workflow anywhere:

```bash
telar skill install      # copies the skill into ~/.claude/skills/telar
```

### Claude Desktop

Edit `claude_desktop_config.json` (Settings → Developer → Edit Config) and add:

```json
{
  "mcpServers": {
    "telar": {
      "command": "node",
      "args": ["/absolute/path/to/telar/bin/telar.js", "mcp",
               "--master", "/absolute/path/to/TELAR-MASTER"]
    }
  }
}
```

Use `node` + an absolute path (robust on Windows). Fully quit and reopen Claude
Desktop; the tools appear in the tools menu and the prompts under the **+** menu.

> **Note:** the MCP server runs the built `server/dist`, so run `npm run build`
> before using `telar mcp` from a clone.

### What the AI can see and do

Once connected, Telar gives the assistant:

- **Resources (read):** `telar://graph` (all concepts + relations),
  `telar://concept/{id}`, `telar://concept/{id}/{folder}/{file}` (one file),
  `telar://errors` (every recorded mistake), and the canvas — `telar://stickies`,
  `telar://layout`, `telar://arrows`.
- **Tools (write):** lay a whole topic in one call (`build_subgraph`); single
  concepts & relations (`create_concept`, `add_relation`, `add_relations`,
  `remove_relation`, `update_concept`); content (`create_lesson` /
  `create_example` / `create_challenge` / `create_note`, `edit_lesson`,
  `add_questions`, `add_flashcards`, `log_error`); and canvas layout
  (`set_positions`, `create_sticky` / `update_sticky` / `delete_sticky`,
  `create_arrow` / `update_arrow` / `delete_arrow`).

Every write lands as real `.md` / `.json` under `TELAR-MASTER/`, validated exactly
like the web app.

### Prompts (one-click workflows)

Prompts are **reusable workflows the server offers your client** — pick one and it
injects a ready-made instruction (which resources to read, which tools to call), so
the assistant runs the whole task for you.

**How to invoke them:**

- **Claude Code** — type `/` and pick `mcp__telar__<name>` (e.g.
  `/mcp__telar__build_roadmap`), then pass the argument (the topic or concept).
- **Claude Desktop** — click the **+** (attach) button → **telar** → choose the
  prompt → fill in its arguments.
- After you add or change prompts, **reconnect / restart the MCP server** in your
  client so it reloads them (run `/mcp` in Claude Code, or restart the app).

| Prompt | Argument(s) | What it does |
| --- | --- | --- |
| `build_roadmap` | `tema`, `enfoque?` | Designs and creates a whole topic map in one pass (`build_subgraph` + layout + region stickies). |
| `fill_concept` | `concepto` | Drafts and saves a lesson, a worked example and a few test questions. |
| `teach_concept` | `concepto` | Teaches the concept from its material and checks your understanding. |
| `quiz_me` | `concepto` | Quizzes you from the concept and saves the good questions. |
| `expand_concept` | `concepto` | Proposes and adds the missing prerequisites / sub-topics. |
| `review_mistakes` | — | Reviews `telar://errors` and re-quizzes what you missed. |

**What happens when you run one:** the prompt drops guidance into the chat, then
the assistant reads the relevant `telar://` resources and calls the write tools to
do the work — you just confirm. You don't even *need* the prompts: with the tools
connected, plain language works too ("build me a roadmap for Kafka", "fill in the
`rag` concept").

### The skill

A **skill** is a packaged set of instructions that **Claude Code auto-loads when
it's relevant** — here, the whole Telar-over-MCP workflow (read the graph first,
lay a topic with `build_subgraph`, fill concepts, curate relations, arrange the
canvas) plus the conventions that keep a graph clean (slugified ids, one primary
prerequisite per concept, hex colours). It means you don't have to re-explain how
to drive Telar every session.

- It ships in the repo at **`.claude/skills/telar/SKILL.md`** and auto-loads
  whenever you run Claude Code **inside the project**.
- To use it **anywhere** (any folder, not just the repo), install it into your
  personal skills:

  ```bash
  telar skill install     # copies it to ~/.claude/skills/telar/
  ```

  (Needed because `npm install` puts the file under `node_modules`, which Claude
  Code never scans — the skill has to live in `~/.claude/skills/`.)
- Start a **new** Claude Code session after installing so it's picked up.

> The skill is a **Claude Code** feature. **Claude Desktop** has its own, separate
> skills system and does *not* read `~/.claude/skills/` — there, the **prompts**
> above are the equivalent one-click workflows.

---

## 5. Use Telar as a CLI (install once, use it anywhere)

The nicest way to live with Telar is as the **`telar` command**: install it once,
and from then on you run it from *any* folder — it remembers your project, so you
never need the source checkout open just to study.

### Install the `telar` command globally

Telar isn't published to npm yet, so install it **from source**:

```bash
git clone <your-fork-url> telar
cd telar
npm install
npm run build          # build the app the CLI serves
npm link               # put `telar` on your PATH (symlinked to this clone)
```

- **`npm link`** symlinks the global `telar` to your clone, so a later
  `git pull` + `npm run build` updates it in place — best if you also hack on Telar.
- **`npm install -g .`** installs a standalone copy instead (its `prepack` builds
  for you). Use this if you just want the tool, not the source.

Check it works from anywhere:

```bash
telar help
```

> Once Telar is published to npm, this becomes a one-liner: `npm install -g telar`
> (or run it without installing via `npx telar`).

### First run — create a project anywhere

From **any** directory:

```bash
telar
```

With no saved project yet, Telar asks for a **parent** folder, creates
`<parent>/TELAR-MASTER` inside it, remembers the location, and opens the menu.
Pick **Start Telar** (or run `telar serve`) and open **http://localhost:3131**.

That location is saved per-user, so every future `telar` reopens the same project
— no `--master`, no being in the repo.

### Everyday commands (from any folder)

```
telar                 interactive menu: Start Telar · Move project · Quit
telar serve           start the server; open http://localhost:3131
  --port <n>            listen on a different port (default 3131)
  --master <dir>        use <dir> for this run only (not saved)
telar stop | close    stop a running server and free its port
telar path            show where your TELAR-MASTER currently lives
telar path <dir>      move / point Telar at <dir>/TELAR-MASTER
telar skill install   install the Claude Code skill into ~/.claude/skills
telar mcp             start the MCP server (your AI client usually launches this)
telar help
```

While serving, Telar takes over the terminal with a full-screen dashboard (like
`vim`/`less`); **Ctrl+C** returns you to the exact terminal you launched from,
scrollback intact. Your project pointer lives in `%APPDATA%/telar/config.json`
(Windows) or `~/.config/telar/config.json`.

### Update & uninstall

- **Linked from source:** `git pull && npm install && npm run build` — the link
  keeps working.
- **Standalone copy:** re-run `npm install -g .` (or `npm i -g telar` once published).
- **Remove:** `npm rm -g telar` (use `npm unlink -g telar` if you installed via `npm link`).

### Windows note

npm's global bin is on your PATH as a `.cmd` shim, so `telar` works in PowerShell
and CMD. If you get *"telar is not recognized"*, make sure npm's global bin folder
(`npm config get prefix`) is on your PATH, then open a **new** terminal.

---

## 6. Where things live / troubleshooting

- **Project pointer** (which project is active) — a per-user config at
  `%APPDATA%/telar/config.json` (Windows) or `~/.config/telar/config.json`.
- **Running-server record** — `%APPDATA%/telar/server.json` (used by `telar stop`).
- **Project data** — everything is under your `TELAR-MASTER/`. Delete the whole
  folder and you've deleted the project; nothing is stored anywhere else.
- **"frontend build not found"** — run `npm run build` before `npm run serve`.
- **Nothing renders in dev** — make sure the backend is up (`npm run dev` starts
  both); the frontend needs the API at :3131.
- **`npm install` TLS errors** — see [CONTRIBUTING.md](./CONTRIBUTING.md#installing-dependencies).
