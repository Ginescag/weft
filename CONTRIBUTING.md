# Contributing to Telar

Thanks for your interest in Telar! This guide covers how to set up the project,
the conventions we follow, and how to send a change. By participating you agree to
our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug** or **request a feature** via the issue templates.
- **Improve docs** (README, HOWTO, the in-code comments).
- **Send a pull request** for a fix or feature.

If you're planning something bigger than a small fix, open an issue first so we can
agree on the approach.

## Getting started

```bash
# 1. Fork on GitHub, then clone your fork
git clone https://github.com/<you>/telar.git
cd telar

# 2. Install dependencies (see the note below if npm install fails with a TLS error)
npm install

# 3. Create your local learning project (git-ignored)
npm run seed

# 4. Run both dev servers
npm run dev
```

Open http://localhost:5173.

### Installing dependencies

On most machines `npm install` just works. **If it fails with
`UNABLE_TO_VERIFY_LEAF_SIGNATURE`**, your HTTPS is being intercepted (some
antivirus/corporate proxies do this). Don't disable `strict-ssl`; instead export
your machine's root CAs to a PEM and point npm (and any Node-based downloader) at
it:

```bash
# Windows (PowerShell) — export the Windows root store to a PEM, then:
npm install --cafile=C:\path\to\roots.pem
# For tools that spawn Node (e.g. Playwright browser installs):
#   set NODE_EXTRA_CA_CERTS=C:\path\to\roots.pem
```

## Running & checking

```bash
npm run dev         # Vite (:5173) + backend (:3131), hot reload
npm run build       # typecheck + production build of both workspaces
npm run typecheck   # type-check only (fast)
npm run serve       # run the production single process (after build)
```

Both **`npm run typecheck`** and **`npm run build`** must pass before you open a
PR (CI runs them on every PR).

There is no test runner or linter configured yet; end-to-end checks are done
manually (and, for the dev build only, `window.__cy` exposes the Cytoscape
instance for scripted checks).

## Project layout

```
frontend/   Vite + React + TS — screens/, components/, lib/
server/     Hono backend + MCP server
  src/master.ts   the filesystem layer — ALL reads/writes to TELAR-MASTER/ go here
  src/api.ts      thin HTTP routes
  src/mcp.ts      the MCP server (tools, resources, prompts)
  src/graph.ts    regenerates the derived .telar/graph.json
bin/telar.js       CLI entry
examples/          starter-master/ (the seed)
IA-DOCS/           internal Spanish design docs (read these for deep work)
```

For the *why* behind the architecture, read
[`IA-DOCS/`](./IA-DOCS/README.md) — the design spec (`TELAR_PLAN.md`), the backend
plan (`BACKEND_PLAN.md`) and the MCP guide (`MCP.md`).

## Conventions (please follow)

- **Language:** code, UI strings, comments and new docs are in **English**. The
  **on-disk data keys are Spanish** (`nombre`, `resumen`, `relaciones`, `nodos`,
  `aristas`, `errores`, `posiciones`, …) — match them exactly when reading/writing
  files under `TELAR-MASTER/`. README/HOWTO are bilingual.
- **The filesystem is the source of truth.** No database. Every write goes through
  `server/src/master.ts` (atomic, validated) and lands as `.md`/`.json`. If the
  server dies, everything survives on disk.
- **`graph.json` is a derived cache** — never treat it as primary; it's rebuilt
  from the per-concept `.meta` files.
- **TypeScript ESM** (Node 20+). Match the style of the surrounding code — comment
  density, naming, idioms.
- **Design language — "embroidery on linen".** UI changes must respect it: linen
  background, needle-head concepts, burgundy thread as the one saturated colour,
  motion kept calm, `prefers-reduced-motion` honoured. See the README and
  `CLAUDE.md`.

## Sending a pull request

1. Branch off `main`: `git checkout -b fix/short-description`.
2. Make your change; keep commits focused.
3. Run `npm run typecheck && npm run build` — both green.
4. Update docs if behavior changed (README / HOWTO / `CLAUDE.md`).
5. Push and open a PR; fill in the PR template and link any related issue.

## A note on packaging

The repo ships the built `dist/` and the bundled skill
(`.claude/skills/telar/`) via the `files` allowlist in the root `package.json`,
with `prepack` building first. `dist/` and `TELAR-MASTER/` are git-ignored. If you
change what ships, verify with `npm pack --dry-run` that `server/dist`,
`frontend/dist` and `.claude/skills/telar/SKILL.md` are still included and your
personal `TELAR-MASTER/` is not.

Thanks for helping weave Telar. 🧵
