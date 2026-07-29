// index.ts — process entry point: resolve the master directory (an explicit
// --master flag, or the managed first-run/config flow), build the app, serve the
// built frontend in production, listen, and shut down cleanly
// (BACKEND_PLAN §7 F1/F6, plus the first-run config UX).

import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Hono } from 'hono'
import { createApi } from './api.js'
import { enterAltScreen, leaveAltScreen, runningIndicator, type RunningIndicator } from './art.js'
import {
  configFilePath,
  loadConfig,
  pidFilePath,
  resolveManagedMaster,
  setMaster,
  stopManagedServer,
  writePidFile,
} from './config.js'
import { createMaster } from './master.js'
import { runInteractiveMenu } from './menu.js'
import { startMCPServer } from './mcp.js'

interface CliOptions {
  /** `menu` = bare `telar` (interactive picker); `serve` = start directly.
   *  `close` is an alias for `stop`. */
  command: 'menu' | 'serve' | 'path' | 'help' | 'mcp' | 'stop' | 'close' | 'skill'
  port: number
  /** serve: explicit master from --master/positional/$TELAR_MASTER (one-off, not saved). */
  explicitMaster?: string
  /** path: the new location to set; undefined ⇒ just show the current one. */
  pathArg?: string
  /** skill: the sub-action (`install`); undefined defaults to install. */
  skillArg?: string
}

const COMMANDS = new Set(['serve', 'path', 'help', 'mcp', 'stop', 'close', 'skill', 'skills'])

/**
 * Does this bare positional look like a filesystem path (so it may be a one-off
 * master), rather than a mistyped subcommand? A path has a separator, a Windows
 * drive, or starts with `.`/`~`. This stops `telar close` (or any typo) from
 * being silently treated as a master directory and starting a server.
 */
function looksLikePath(token: string): boolean {
  return /[\\/]/.test(token) || /^[A-Za-z]:/.test(token) || token.startsWith('.') || token.startsWith('~')
}

/**
 * Parse the CLI. Subcommands: `serve` (default), `path [dir]`, `help`. Flags:
 * `--port N`/`--port=N`, `--master PATH`/`--master=PATH`, `--help`/`-h`. A bare
 * positional (no subcommand) is treated as a one-off master path. With no master
 * given, `serve` enters managed mode (remembered location / first-run prompt).
 */
function parseArgs(argv: string[]): CliOptions {
  let port = 3131
  let masterArg: string | undefined
  let help = false
  const rest: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--port') port = Number(argv[++i])
    else if (arg.startsWith('--port=')) port = Number(arg.slice('--port='.length))
    else if (arg === '--master') masterArg = argv[++i]
    else if (arg.startsWith('--master=')) masterArg = arg.slice('--master='.length)
    else if (arg === '--help' || arg === '-h') help = true
    else rest.push(arg)
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid --port: ${port}`)
  }

  // Bare `telar` defaults to the interactive menu; an explicit subcommand or a
  // positional master path serves directly.
  let command: CliOptions['command'] = 'menu'
  let pathArg: string | undefined
  let skillArg: string | undefined
  if (rest[0] && COMMANDS.has(rest[0])) {
    // `skills` is a friendly alias for `skill`.
    command = (rest[0] === 'skills' ? 'skill' : rest[0]) as CliOptions['command']
    if (command === 'path') pathArg = rest[1]
    if (command === 'skill') skillArg = rest[1]
  } else if (rest[0]) {
    // A bare positional is a one-off master path — but only if it looks like a
    // path. Otherwise it is a mistyped command (`telar close`, `telar srve`),
    // which must error, not silently serve a nonexistent directory.
    if (!masterArg && !looksLikePath(rest[0])) {
      throw new Error(`Unknown command: ${rest[0]}. Run \`telar help\` to see the commands.`)
    }
    masterArg = masterArg ?? rest[0]
    command = 'serve'
  }
  if (help) command = 'help'

  return { command, port, explicitMaster: masterArg ?? process.env.TELAR_MASTER, pathArg, skillArg }
}

function printHelp(): void {
  console.log(`telar — local-first learning dashboard

Usage:
  telar                Open the interactive menu (start · move the project · quit)
  telar serve          Start Telar directly (skips the menu)
  telar stop           Stop a running Telar server (frees the port); alias: telar close
  telar path           Show where your project folder (TELAR-MASTER) lives
  telar path <dir>     Point Telar at <dir>/TELAR-MASTER (created empty if missing)
  telar skill install  Install the Telar skill into ~/.claude/skills (for Claude Code)
  telar help           Show this help
  telar mcp            Start the MCP server (for external tools to talk to Telar)

Options (serve):
  --port <n>           Port to listen on (default 3131)
  --master <dir>       Use <dir> for this run only, without changing the saved path`)
}

/** Locate the built frontend relative to this file (works from src via tsx and from dist). */
function frontendDist(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../frontend/dist')
}

/** The Telar skill that ships in the package's `.claude/skills/telar/`. Same
 *  `../../` package-root anchor as frontendDist (works from src and dist). */
function skillSourceDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../.claude/skills/telar')
}

/**
 * Copy the bundled skill into the user's personal Claude skills
 * (`~/.claude/skills/telar/`), so Claude Code / Claude Desktop can load it from
 * anywhere — not only when working inside this repo. Overwrites an older copy.
 */
function installSkill(): void {
  const src = skillSourceDir()
  if (!existsSync(join(src, 'SKILL.md'))) {
    throw new Error(
      `Bundled Telar skill not found at ${src}. Reinstall telar, or copy .claude/skills/telar/ into ~/.claude/skills/ manually.`,
    )
  }
  const dest = join(homedir(), '.claude', 'skills', 'telar')
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(src, dest, { recursive: true })
  console.log(
    `Installed the Telar skill:\n  ${dest}\nStart a new Claude Code session (or reload) so it picks the skill up.`,
  )
}

/**
 * Serve the built SPA: real files (JS/CSS/fonts) from dist, and index.html for
 * every other non-/api route so React Router (BrowserRouter) handles deep links
 * on reload (BACKEND_PLAN §8.5). Mounted after the API routes and only in
 * production; in dev, Vite serves the app and proxies /api here.
 */
function serveFrontend(app: Hono): void {
  const distDir = frontendDist()
  const indexFile = join(distDir, 'index.html')
  if (!existsSync(indexFile)) {
    console.warn(`frontend build not found at ${distDir} — serving API only. Run "npm run build".`)
    return
  }
  // serveStatic resolves root relative to cwd and rejects absolute paths.
  const root = relative(process.cwd(), distDir).split(sep).join('/') || '.'
  app.use('/*', serveStatic({ root }))

  const indexHtml = readFileSync(indexFile, 'utf8')
  app.get('*', (c) => {
    // An unknown /api/* path must stay a JSON 404, not fall through to the SPA.
    if (c.req.path.startsWith('/api/')) {
      return c.json({ error: `No route for ${c.req.method} ${c.req.path}` }, 404)
    }
    return c.html(indexHtml)
  })
}

async function main(): Promise<void> {
  const { command, port, explicitMaster, pathArg, skillArg } = parseArgs(process.argv.slice(2))

  if (command === 'help') {
    printHelp()
    return
  }

  if (command === 'stop' || command === 'close') {
    const result = await stopManagedServer()
    if (result.status === 'not-running') {
      console.log('No running Telar server found (nothing recorded to stop).')
    } else if (result.status === 'stale') {
      console.log(`No running server — cleared a stale record (pid ${result.pid}).`)
    } else {
      console.log(
        `Stopped Telar${result.forced ? ' (forced)' : ''} — pid ${result.pid}, port ${result.port}.`,
      )
    }
    return
  }

  if (command === 'mcp') {
    const masterDir = explicitMaster
      ? resolve(process.cwd(), explicitMaster)
      : await resolveManagedMaster()
    await startMCPServer(masterDir)
    return
  }

  if (command === 'path') {
    if (pathArg) {
      const { dir, initialised } = await setMaster(pathArg)
      console.log(
        initialised
          ? `Created an empty project and pointed Telar at:\n  ${dir}`
          : `Telar now points at:\n  ${dir}`,
      )
    } else {
      const cfg = await loadConfig()
      console.log(`config file: ${configFilePath()}`)
      console.log(cfg ? `project:     ${cfg.masterDir}` : 'project:     (none yet — run `telar`)')
    }
    return
  }

  if (command === 'skill') {
    // `telar skill` / `telar skill install` both install; other sub-args error.
    if (skillArg && skillArg !== 'install') {
      throw new Error(`Unknown skill action: ${skillArg}. Use \`telar skill install\`.`)
    }
    installSkill()
    return
  }

  const dev = process.env.NODE_ENV !== 'production'
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)

  // Menu and serve both live on the alternate screen (Ctrl+C returns the user to
  // the exact terminal they launched from). No-op when piped / not a TTY.
  if (interactive) enterAltScreen()

  // Bare `telar` in a terminal opens the menu; everything else resolves directly.
  const masterDir = explicitMaster
    ? resolve(process.cwd(), explicitMaster)
    : command === 'menu' && interactive
      ? await runInteractiveMenu()
      : await resolveManagedMaster()

  const master = createMaster(masterDir)
  // On a TTY the dashboard owns the screen, so requests stream into its LOGS
  // panel via this sink (set once the dashboard exists) instead of the console.
  let indicator: RunningIndicator | undefined
  const app = createApi(master, {
    dev,
    ...(interactive ? { onLog: (line: string) => indicator?.log(line) } : {}),
  })
  if (!dev) serveFrontend(app)

  const server = serve({ fetch: app.fetch, port }, (info) => {
    // The "THREADING…" dashboard (a plain line when piped) marks the server as
    // alive and streams request logs; it replaces the old two log lines.
    indicator = runningIndicator(`http://localhost:${info.port}`, masterDir)
    // Record pid+port so `telar stop`/`telar close` can find us. Only the
    // production single process does this — dev runs in its own terminal.
    if (!dev) void writePidFile({ pid: process.pid, port: info.port, startedAt: new Date().toISOString() })
  })

  // Graceful shutdown: stop the animation, close the listener before exiting so
  // the port is freed and no write is left half-done (BACKEND_PLAN §10). Drop
  // the PID file first (sync, so it happens even if close hangs) — a stale
  // record would mislead the next `telar close`.
  const shutdown = (signal: string) => {
    indicator?.stop()
    leaveAltScreen() // restore the launching terminal immediately on Ctrl+C
    // Keep a log line for piped/dev runs; the alt-screen TTY just returns cleanly.
    if (!process.stdout.isTTY) console.log(`\n${signal} received — shutting down.`)
    if (!dev) rmSync(pidFilePath(), { force: true })
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 500).unref() // never hang on a lingering socket
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  leaveAltScreen() // surface the error in the real terminal, not the alt buffer
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
