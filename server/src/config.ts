// config.ts — the persisted "where is my WEFT-MASTER?" pointer plus the
// interactive project actions behind the `weft` command (create, relocate,
// regenerate, move). "Managed mode" = no --master flag: the CLI remembers the
// chosen location so `weft` always reopens the same project. A generated master
// is always a folder literally named WEFT-MASTER, and empty (just `.weft/`).

import { access, cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'

export interface WeftConfig {
  /** Absolute path of the user's WEFT-MASTER directory. */
  masterDir: string
}

const MASTER_DIRNAME = 'WEFT-MASTER'
const toJson = (v: unknown): string => JSON.stringify(v, null, 2) + '\n'

/** Per-user config dir: %APPDATA%\weft on Windows, ~/.config/weft elsewhere. */
function configDir(): string {
  if (process.platform === 'win32' && process.env.APPDATA) {
    return join(process.env.APPDATA, 'weft')
  }
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, 'weft')
  return join(homedir(), '.config', 'weft')
}

/** Absolute path of the per-user config file that remembers the active project. */
export const configFilePath = (): string => join(configDir(), 'config.json')

export async function loadConfig(): Promise<WeftConfig | null> {
  try {
    const cfg = JSON.parse(await readFile(configFilePath(), 'utf8')) as Partial<WeftConfig>
    if (!cfg.masterDir) return null
    // Legacy configs (saved before resolveMasterPath existed) can point at a
    // bare parent like the Desktop — serving one would scan the whole folder as
    // a project. Normalise the stored value like any other user-supplied path;
    // if the resulting WEFT-MASTER doesn't exist, the callers' missing-master
    // flows take over (regenerate / relocate) instead of adopting the parent.
    return { masterDir: resolveMasterPath(cfg.masterDir) }
  } catch {
    return null // missing or corrupt → treat as first run
  }
}

export async function saveConfig(cfg: WeftConfig): Promise<void> {
  await mkdir(configDir(), { recursive: true })
  await writeFile(configFilePath(), toJson(cfg), 'utf8')
}

export async function masterExists(dir: string): Promise<boolean> {
  try {
    await access(dir)
    return true
  } catch {
    return false
  }
}

// --- runtime PID file (weft serve ↔ weft stop) ----------------------------
// A running `weft serve` records its pid + port here so `weft stop` can find
// and terminate it without the user hunting the port by hand. This is machine
// state like config.json — it lives beside it in the per-user config dir, and
// only the production single-process server writes it (dev is Ctrl+C in its own
// terminal).

const PID_FILENAME = 'server.json'

export interface RuntimeInfo {
  pid: number
  port: number
  startedAt: string
}

export const pidFilePath = (): string => join(configDir(), PID_FILENAME)

export async function writePidFile(info: RuntimeInfo): Promise<void> {
  await mkdir(configDir(), { recursive: true })
  await writeFile(pidFilePath(), toJson(info), 'utf8')
}

export async function readPidFile(): Promise<RuntimeInfo | null> {
  try {
    const raw = JSON.parse(await readFile(pidFilePath(), 'utf8')) as Partial<RuntimeInfo>
    if (typeof raw.pid !== 'number' || typeof raw.port !== 'number') return null
    return {
      pid: raw.pid,
      port: raw.port,
      startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : '',
    }
  } catch {
    return null // missing or corrupt → nothing recorded
  }
}

export async function clearPidFile(): Promise<void> {
  await rm(pidFilePath(), { force: true })
}

/** True if a process with this pid exists (EPERM = exists but not signalable). */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0) // signal 0 tests existence without touching the process
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export type StopResult =
  | { status: 'not-running' }
  | { status: 'stale'; pid: number; port: number }
  | { status: 'stopped'; pid: number; port: number; forced: boolean }

/**
 * Stop the managed `weft serve` recorded in the PID file. Sends SIGTERM
 * (graceful on POSIX, immediate on Windows), and escalates to SIGKILL if the
 * process lingers past a short grace period. A missing file ⇒ nothing to stop;
 * a dead pid ⇒ a stale record, which is simply cleaned up.
 */
export async function stopManagedServer(): Promise<StopResult> {
  const info = await readPidFile()
  if (!info) return { status: 'not-running' }
  if (!isProcessAlive(info.pid)) {
    await clearPidFile()
    return { status: 'stale', pid: info.pid, port: info.port }
  }

  try {
    process.kill(info.pid, 'SIGTERM')
  } catch {
    // Vanished between the liveness check and the signal — handled as stopped.
  }
  for (let i = 0; i < 30 && isProcessAlive(info.pid); i++) await delay(100)

  let forced = false
  if (isProcessAlive(info.pid)) {
    forced = true
    try {
      process.kill(info.pid, 'SIGKILL')
    } catch {
      // already gone
    }
    for (let i = 0; i < 10 && isProcessAlive(info.pid); i++) await delay(100)
  }

  await clearPidFile()
  return { status: 'stopped', pid: info.pid, port: info.port, forced }
}

/**
 * Normalise a user-supplied path to an actual WEFT-MASTER folder: given a parent
 * directory we place `WEFT-MASTER` inside it; given a path that already ends in
 * `WEFT-MASTER` we keep it. So the folder is always named consistently and the
 * user can never accidentally point Weft at a bare parent (e.g. the Desktop).
 */
export function resolveMasterPath(input: string): string {
  const abs = resolve(input)
  return basename(abs) === MASTER_DIRNAME ? abs : join(abs, MASTER_DIRNAME)
}

/**
 * Create an empty WEFT-MASTER: just the `.weft/` folder with a starter project
 * `.config`. No concepts — the user adds them from the app; `graph.json` is
 * derived and written on the first GET /api/graph.
 */
export async function scaffoldEmptyMaster(dir: string): Promise<void> {
  await mkdir(join(dir, '.weft'), { recursive: true })
  await writeFile(
    join(dir, '.weft', '.config'),
    toJson({
      version: '0.1',
      idioma: 'en',
      proveedor: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      modelo: 'qwen3:8b',
    }),
    'utf8',
  )
}

/** Move a master folder to a new location (fast rename, cross-volume copy fallback). */
export async function moveMaster(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true })
  try {
    await rename(from, to)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    // Different drives: rename can't cross volumes, so copy then remove.
    await cp(from, to, { recursive: true })
    await rm(from, { recursive: true, force: true })
  }
}

// --- interactive helpers (used by resolveManagedMaster and the menu) --------

async function ask(question: string, def?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = (await rl.question(def ? `${question} [${def}] ` : `${question} `)).trim()
    return answer || def || ''
  } finally {
    rl.close()
  }
}

async function confirm(question: string): Promise<boolean> {
  const answer = (await ask(`${question} [Y/n]`)).toLowerCase()
  return answer === '' || answer === 'y' || answer === 'yes' || answer === 's' || answer === 'si'
}

/** First run: ask for a parent folder and create `<parent>/WEFT-MASTER` (empty). */
export async function createProjectInteractive(): Promise<string> {
  console.log('Welcome to Weft. Let’s create your project folder.')
  const parent = await ask('In which folder should WEFT-MASTER be created?', homedir())
  const dir = resolveMasterPath(parent)
  await scaffoldEmptyMaster(dir)
  await saveConfig({ masterDir: dir })
  console.log(`Created: ${dir}`)
  return dir
}

/** The saved project folder is gone: offer to regenerate in place or relocate. */
export async function handleMissingMaster(missing: string): Promise<string> {
  console.log(`WEFT-MASTER not found at:\n  ${missing}`)
  if (await confirm('Regenerate an empty project there? (No lets you pick another folder)')) {
    await scaffoldEmptyMaster(missing)
    await saveConfig({ masterDir: missing })
    console.log(`Regenerated: ${missing}`)
    return missing
  }
  const parent = await ask('In which folder should WEFT-MASTER be created?', dirname(missing))
  const dir = resolveMasterPath(parent)
  await scaffoldEmptyMaster(dir)
  await saveConfig({ masterDir: dir })
  console.log(`Created: ${dir}`)
  return dir
}

/**
 * Move the current project into `<parent>/WEFT-MASTER`. Returns the new dir, or
 * null if nothing changed (same place / destination already taken).
 */
export async function moveProjectInteractive(current: string): Promise<string | null> {
  // Safety: only ever move a real WEFT-MASTER folder. A legacy pointer at a bare
  // parent (e.g. the Desktop) must be repointed, never renamed wholesale.
  if (basename(current) !== MASTER_DIRNAME) {
    console.log(
      `The saved location isn't a WEFT-MASTER folder:\n  ${current}\n` +
        'Use `weft path <dir>` to point at a proper project first.',
    )
    return null
  }
  const parent = await ask('Move the project into which folder?', dirname(current))
  const dest = resolveMasterPath(parent)
  if (dest === current) {
    console.log('That is already the current location.')
    return null
  }
  if (await masterExists(dest)) {
    console.log(`A folder already exists at:\n  ${dest}\nPick another location.`)
    return null
  }
  if (await masterExists(current)) {
    await moveMaster(current, dest)
  } else {
    await scaffoldEmptyMaster(dest) // nothing to move — start fresh there
  }
  await saveConfig({ masterDir: dest })
  console.log(`Project now at:\n  ${dest}`)
  return dest
}

// --- setMaster (the `weft path <dir>` command) -----------------------------

/**
 * Point Weft at a master and remember it. The path is normalised to end in
 * WEFT-MASTER; a missing folder is initialised empty, an existing project is
 * adopted untouched. Never deletes the old location.
 */
export async function setMaster(input: string): Promise<{ dir: string; initialised: boolean }> {
  const dir = resolveMasterPath(input)
  const initialised = !(await masterExists(join(dir, '.weft')))
  if (initialised) await scaffoldEmptyMaster(dir)
  await saveConfig({ masterDir: dir })
  return { dir, initialised }
}

// --- resolveManagedMaster (serve path, non-interactive-safe) ----------------

/**
 * Resolve the master directory for `weft serve` / non-interactive runs:
 * saved-and-present → use it; saved-but-gone → regenerate/relocate; first run →
 * create. Non-interactive shells get a clear error instead of a hang. (Bare
 * `weft` in a terminal goes through the menu instead — see menu.ts.)
 */
export async function resolveManagedMaster(): Promise<string> {
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)
  const cfg = await loadConfig()

  if (cfg) {
    if (await masterExists(cfg.masterDir)) return cfg.masterDir
    if (!interactive) {
      throw new Error(
        `WEFT-MASTER is missing (${cfg.masterDir}). Run \`weft\` in a terminal to regenerate or relocate it, or pass --master PATH.`,
      )
    }
    return handleMissingMaster(cfg.masterDir)
  }

  if (!interactive) {
    throw new Error(
      'First run needs an interactive terminal to choose where WEFT-MASTER goes, or pass --master PATH.',
    )
  }
  return createProjectInteractive()
}
