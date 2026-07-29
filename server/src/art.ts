// art.ts — the terminal's face: the big "TELAR" / "THREADING" banners in the
// ANSI Shadow block font, the Telar palette translated to ANSI, and the running
// indicator (an animated "THREADING…" that shows the server is alive). All of
// it degrades to plain text when stdout is not a TTY (piped, e.g. under
// concurrently in dev) or when NO_COLOR is set.

import { format } from 'node:util'

const RESET = '\x1b[0m'
const HIDE = '\x1b[?25l'
const SHOW = '\x1b[?25h'
const CLEAR = '\x1b[2J\x1b[H'
// The alternate screen buffer: switch to a clean full-screen canvas on enter,
// and restore the terminal exactly as it was (scrollback and all) on leave —
// the same trick vim/less/Claude Code use.
const ALT_ENTER = '\x1b[?1049h'
const ALT_LEAVE = '\x1b[?1049l'

let inAlt = false
let restoreInstalled = false
// While the running dashboard owns the screen it hijacks console/stderr into its
// LOGS panel; this releases that hijack. Held at module scope so *every* exit
// path (leaveAltScreen from a signal, crash, or normal stop) restores the real
// console before anything else prints — a crash message must reach the terminal,
// not vanish into a LOGS box that is being torn down.
let releaseCapture: (() => void) | null = null

/** Guarantee the terminal is restored on any exit path (normal, signal, crash),
 *  so a hidden cursor or the alternate buffer can never leak into the shell. */
function installRestore(): void {
  if (restoreInstalled) return
  restoreInstalled = true
  process.on('exit', () => leaveAltScreen())
  const bail = (err: unknown) => {
    leaveAltScreen() // back to the real terminal *first*, so the error is visible
    if (err !== undefined && err !== null) {
      console.error(err instanceof Error ? err.message : String(err))
    }
    process.exit(1)
  }
  process.on('uncaughtException', bail)
  process.on('unhandledRejection', bail)
}

/** Move Telar's UI onto the alternate screen (no-op when stdout isn't a TTY). */
export function enterAltScreen(): void {
  if (!process.stdout.isTTY || inAlt) return
  inAlt = true
  installRestore()
  process.stdout.write(ALT_ENTER + '\x1b[H')
}

/** Return to the terminal we were launched from, cursor shown. */
export function leaveAltScreen(): void {
  releaseCapture?.() // restore real console/stderr before anything prints
  if (!inAlt) return
  inAlt = false
  process.stdout.write(SHOW + ALT_LEAVE)
}

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR
// Truecolor lets us hit the exact linen/burgundy tones; assume it on modern
// Windows terminals / VS Code, else fall back to the 16-colour approximations.
const truecolor =
  useColor &&
  (/(truecolor|24bit)/.test(process.env.COLORTERM ?? '') ||
    Boolean(process.env.WT_SESSION) ||
    process.env.TERM_PROGRAM === 'vscode' ||
    process.platform === 'win32')

function fg(r: number, g: number, b: number, fallback: string): string {
  if (!useColor) return ''
  return truecolor ? `\x1b[38;2;${r};${g};${b}m` : fallback
}

/** The Telar palette as ANSI. Burgundy is the thread — the one saturated tone. */
export const C = {
  reset: useColor ? RESET : '',
  bold: useColor ? '\x1b[1m' : '',
  dim: useColor ? '\x1b[2m' : '',
  burgundy: fg(178, 58, 74, '\x1b[91m'), // the thread (brightened for dark terminals)
  muted: fg(150, 140, 128, '\x1b[90m'), // labels / body
  moss: fg(90, 150, 116, '\x1b[32m'), // the quiet "alive / correct" tone
}

// ANSI Shadow glyphs. T/E/L/A/R are lifted from the banner in the spec; the rest
// (H/D/I/N/G and the dot) complete "THREADING". Every row of a glyph is the same
// width so glyphs concatenate into aligned 6-row words.
const GLYPHS: Record<string, string[]> = {
  T: ['████████╗', '╚══██╔══╝', '   ██║   ', '   ██║   ', '   ██║   ', '   ╚═╝   '],
  E: ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '███████╗', '╚══════╝'],
  L: ['██╗     ', '██║     ', '██║     ', '██║     ', '███████╗', '╚══════╝'],
  A: [' █████╗ ', '██╔══██╗', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
  R: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██║  ██║', '╚═╝  ╚═╝'],
  H: ['██╗  ██╗', '██║  ██║', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
  D: ['██████╗ ', '██╔══██╗', '██║  ██║', '██║  ██║', '██████╔╝', '╚═════╝ '],
  I: ['██╗', '██║', '██║', '██║', '██║', '╚═╝'],
  N: ['███╗   ██╗', '████╗  ██║', '██╔██╗ ██║', '██║╚██╗██║', '██║ ╚████║', '╚═╝  ╚═══╝'],
  G: [' ██████╗ ', '██╔════╝ ', '██║  ███╗', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
  ' ': ['   ', '   ', '   ', '   ', '   ', '   '],
  '.': ['   ', '   ', '   ', '   ', '██╗', '╚═╝'],
}
const BLANK_DOT = ['   ', '   ', '   ', '   ', '   ', '   ']

/** Render a word into its six ANSI-Shadow rows (unknown chars become spaces). */
export function renderWord(word: string): string[] {
  const rows = ['', '', '', '', '', '']
  for (const ch of word.toUpperCase()) {
    const g = GLYPHS[ch] ?? GLYPHS[' ']
    for (let i = 0; i < 6; i++) rows[i] += g[i]
  }
  return rows
}

/** "THREADING" plus `dots` (0–3) trailing dots, the rest padded so the block
 *  keeps a constant width as the dots blink. */
function threadingFrame(dots: number): string[] {
  const rows = renderWord('THREADING')
  for (let d = 0; d < 3; d++) {
    const g = d < dots ? GLYPHS['.'] : BLANK_DOT
    for (let i = 0; i < 6; i++) rows[i] += ' ' + g[i]
  }
  return rows
}

const cols = (): number => process.stdout.columns || 80
const rows = (): number => process.stdout.rows || 24

/** Left-pad rows so the block is centred in the terminal. */
export function center(rows: string[]): string[] {
  const width = Math.max(...rows.map((r) => r.length))
  const pad = ' '.repeat(Math.max(0, Math.floor((cols() - width) / 2)))
  return rows.map((r) => pad + r)
}

/** Centre a single line given its visible length and its decorated form. */
function centerLine(visibleLen: number, decorated: string): string {
  return ' '.repeat(Math.max(0, Math.floor((cols() - visibleLen) / 2))) + decorated
}

/** The "TELAR" banner in burgundy, centred, with a muted tagline beneath. */
export function printBanner(): void {
  const art = center(renderWord('TELAR'))
  const banner = art.map((r) => C.burgundy + r + C.reset).join('\n')
  const tagline = 'a loom for learning — weave concepts into a graph'
  process.stdout.write('\n' + banner + '\n')
  process.stdout.write(centerLine(tagline.length, C.muted + tagline + C.reset) + '\n\n')
}

export interface RunningIndicator {
  stop: () => void
  /** Append a line to the LOGS panel (a request line, etc.). Plain text. */
  log: (line: string) => void
}

// Box-drawing pieces for the dashboard's burgundy frames.
const BOX = { h: '─', v: '│', tl: '┌', tr: '┐', bl: '└', br: '┘' }
const at = (row: number, col: number): string => `\x1b[${row};${col}H`

/** Truncate to a visible width, adding an ellipsis when cut (plain text only). */
function clip(s: string, width: number): string {
  if (width <= 0) return ''
  return s.length <= width ? s : s.slice(0, Math.max(0, width - 1)) + '…'
}

interface Rect {
  row: number
  col: number
  w: number
  h: number
}

/**
 * The `telar serve` dashboard: a full-screen TUI (on the alternate screen) with
 * three burgundy-framed panels — the animated "THREADING…" banner top-left, the
 * server info top-right, and a streaming LOGS panel across the bottom. Falls back
 * to two plain lines when stdout is not a TTY (dev under concurrently, or piped).
 */
export function runningIndicator(url: string, master: string): RunningIndicator {
  const out = process.stdout
  if (!out.isTTY) {
    out.write(`telar serve → ${url}\nmaster: ${master}\n`)
    return { stop: () => {}, log: (l) => out.write(l + '\n') }
  }

  const ART_W = renderWord('THREADING')[0].length + 12 // + 3 blinking dot slots
  const stopHint = 'Ctrl+C, or `telar close` in another terminal, to stop'
  // The "how to" for the bottom-left panel, as groups (title, then bullets) so
  // drawHowto can space them apart to fill the tall box. Plain text — colour and
  // clipping are applied at render time.
  const howtoGroups: string[][] = [
    ['Telar — learn by weaving a graph.'],
    ['▸ Open the URL above in your browser', '  to explore the graph, lessons & tests.'],
    ["▸ Drop a .pdf into a concept's", '  lessons/ folder to read it in-app.'],
    ['▸ The AI writes lessons, examples,', '  tests & flashcards via `telar mcp`.'],
    ['▸ Draw threads and add sticky notes', '  right on the graph canvas.'],
  ]

  let logs: string[] = []
  let dots = 0
  let art: Rect = { row: 1, col: 1, w: 0, h: 0 }
  let inf: Rect = { row: 1, col: 1, w: 0, h: 0 }
  let howBox: Rect = { row: 1, col: 1, w: 0, h: 0 }
  let logBox: Rect = { row: 1, col: 1, w: 0, h: 0 }

  const drawBox = (r: Rect, title?: string): void => {
    let top = BOX.tl + BOX.h.repeat(Math.max(0, r.w - 2)) + BOX.tr
    if (title) {
      const t = ` ${title} `
      const lead = Math.max(1, Math.floor((r.w - 2 - t.length) / 2))
      const tail = Math.max(0, r.w - 2 - lead - t.length)
      top = BOX.tl + BOX.h.repeat(lead) + t + BOX.h.repeat(tail) + BOX.tr
    }
    out.write(at(r.row, r.col) + C.burgundy + top + C.reset)
    for (let i = 1; i < r.h - 1; i++) {
      out.write(at(r.row + i, r.col) + C.burgundy + BOX.v + C.reset)
      out.write(at(r.row + i, r.col + r.w - 1) + C.burgundy + BOX.v + C.reset)
    }
    out.write(at(r.row + r.h - 1, r.col) + C.burgundy + BOX.bl + BOX.h.repeat(Math.max(0, r.w - 2)) + BOX.br + C.reset)
  }

  // The THREADING art, centred (horizontally + vertically) inside its box; a
  // one-line fallback when the box is too narrow for the full banner.
  const drawArt = (): void => {
    if (art.w >= ART_W + 2) {
      const startRow = art.row + Math.max(1, Math.floor((art.h - 6) / 2))
      const startCol = art.col + Math.max(1, Math.floor((art.w - ART_W) / 2))
      const frame = threadingFrame(dots)
      for (let i = 0; i < 6; i++) out.write(at(startRow + i, startCol) + C.burgundy + frame[i] + C.reset)
    } else {
      const word = 'THREADING' + '.'.repeat(dots) + ' '.repeat(3 - dots)
      const startCol = art.col + Math.max(1, Math.floor((art.w - word.length) / 2))
      out.write(at(art.row + Math.floor(art.h / 2), startCol) + C.burgundy + C.bold + word + C.reset)
    }
  }

  // The server info, centred inside its box. (Terminals use one font size, so
  // "bigger" here means bold + centred, not a larger glyph.)
  const drawInfo = (): void => {
    const maxw = Math.max(1, inf.w - 4)
    // The running line keeps its colours only while it fits; otherwise it is
    // clipped to the box like every other line so it can never spill past the
    // frame and wrap to column 1 (which used to leave a stray "…t:3131" on the
    // far left). master/stop are clipped defensively too.
    const runPlain = `● running · ${url}`
    const runDecorated =
      runPlain.length <= maxw
        ? `${C.moss}●${C.reset} ${C.bold}running${C.reset} · ${C.bold}${url}${C.reset}`
        : C.bold + clip(runPlain, maxw) + C.reset
    const masterPlain = `master: ${master}`
    const masterShown =
      masterPlain.length <= maxw ? masterPlain : 'master: …' + master.slice(-Math.max(0, maxw - 9))
    const stopShown = clip(stopHint, maxw)
    const lines: [string, number][] = [
      [runDecorated, Math.min(maxw, runPlain.length)],
      [`${C.muted}${clip(masterShown, maxw)}${C.reset}`, Math.min(maxw, masterShown.length)],
      [`${C.dim}${stopShown}${C.reset}`, stopShown.length],
    ]
    const blockW = Math.min(maxw, Math.max(...lines.map(([, w]) => w)))
    const startRow = inf.row + Math.max(1, Math.floor((inf.h - lines.length) / 2))
    const startCol = inf.col + Math.max(2, Math.floor((inf.w - blockW) / 2))
    lines.forEach(([line], i) => out.write(at(startRow + i, startCol) + line))
  }

  const drawHowto = (): void => {
    const innerW = howBox.w - 4
    const interiorH = howBox.h - 2
    const contentLines = howtoGroups.reduce((n, g) => n + g.length, 0)
    const slack = Math.max(0, interiorH - contentLines)
    // Space the groups apart (capped) so the text fills the tall box, then
    // centre the spaced block vertically.
    const gap = Math.min(3, Math.floor(slack / howtoGroups.length))
    const spaced = contentLines + gap * (howtoGroups.length - 1)
    let row = howBox.row + Math.max(1, Math.floor((interiorH - spaced) / 2))
    for (let gi = 0; gi < howtoGroups.length; gi++) {
      for (const raw of howtoGroups[gi]) {
        if (row > howBox.row + interiorH) return
        const line = clip(raw, innerW)
        const decorated =
          gi === 0
            ? C.bold + line + C.reset
            : line.startsWith('▸')
              ? C.burgundy + '▸' + C.reset + C.muted + line.slice(1) + C.reset
              : C.muted + line + C.reset
        out.write(at(row, howBox.col + 2) + decorated)
        row++
      }
      row += gap
    }
  }

  const drawLogs = (): void => {
    const innerH = logBox.h - 2
    const innerW = logBox.w - 4
    for (let i = 0; i < innerH; i++) {
      out.write(at(logBox.row + 1 + i, logBox.col + 2) + ' '.repeat(Math.max(0, innerW)))
    }
    if (logs.length === 0) {
      const hint = 'waiting for requests…'
      out.write(
        at(logBox.row + Math.max(1, Math.floor(innerH / 2)), logBox.col + 2 + Math.max(0, Math.floor((innerW - hint.length) / 2))) +
          C.dim + hint + C.reset,
      )
      return
    }
    logs.slice(-innerH).forEach((line, i) => {
      out.write(at(logBox.row + 1 + i, logBox.col + 2) + C.muted + clip(line, innerW) + C.reset)
    })
  }

  // A 2×2 grid with **aligned columns**: the left column (THREADING over HOW TO)
  // and the right column (info over LOGS) share one width each, so LOGS is as
  // wide as the info box and HOW TO as wide as THREADING.
  const relayout = (): void => {
    const w = cols()
    const h = rows()
    const gap = 2
    const MIN_BOTTOM = 4 // the LOGS/HOW-TO row never shrinks below this
    // The two box-rows plus one blank gap row must fit inside `h`, whatever the
    // terminal size: cap the top row so the bottom keeps its minimum on screen,
    // and let the bottom row take exactly the remaining height (ending at row h).
    const topH = Math.max(3, Math.min(10, h - 1 - MIN_BOTTOM))
    const bottomRow = topH + 2 // row topH+1 is the blank gap between the rows
    const bottomH = Math.max(MIN_BOTTOM, h - topH - 1)

    // Left column fits the THREADING banner; the right column takes the rest.
    // Both are clamped so left + gap + right never exceeds the terminal width.
    let leftW = ART_W + 6
    if (leftW + gap + 24 > w) leftW = Math.max(16, w - gap - 24)
    const rightCol = leftW + gap + 1
    const rightW = Math.max(12, w - leftW - gap)

    art = { row: 1, col: 1, w: leftW, h: topH }
    inf = { row: 1, col: rightCol, w: rightW, h: topH }
    howBox = { row: bottomRow, col: 1, w: leftW, h: bottomH }
    logBox = { row: bottomRow, col: rightCol, w: rightW, h: bottomH }
  }

  const drawAll = (): void => {
    out.write(CLEAR + HIDE)
    relayout()
    drawBox(art)
    drawBox(inf)
    drawBox(howBox, 'HOW TO')
    drawBox(logBox, 'LOGS')
    drawArt()
    drawInfo()
    drawHowto()
    drawLogs()
    out.write(at(rows(), 1)) // park the (hidden) cursor out of the way
  }

  // Append a line (a request log, or captured console/stderr output) to the LOGS
  // panel. drawLogs clips every line to the box, so nothing can spill outside it.
  const pushLog = (line: string): void => {
    logs.push(line)
    if (logs.length > 500) logs = logs.slice(-500)
    drawLogs()
    out.write(at(rows(), 1))
  }

  // Hijack console/stderr into the LOGS panel while the dashboard is up: a stray
  // stack trace (e.g. from the API error handler) or a library warning would
  // otherwise land at the cursor and shred the boxes. Each captured chunk is
  // split into lines and pushed like any other log. We never touch stdout.write
  // — the dashboard owns it — so drawing stays intact.
  const savedConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  }
  const savedStderrWrite = process.stderr.write.bind(process.stderr)
  let released = false
  let funneling = false // re-entrancy guard (a write triggered while we log)
  const funnel = (...args: unknown[]): void => {
    if (funneling) return
    funneling = true
    try {
      for (const l of format(...args).split('\n')) pushLog(l)
    } finally {
      funneling = false
    }
  }
  const restore = (): void => {
    if (released) return
    released = true
    releaseCapture = null
    Object.assign(console, savedConsole)
    process.stderr.write = savedStderrWrite
  }
  const capture = (): void => {
    console.log = funnel
    console.info = funnel
    console.warn = funnel
    console.error = funnel
    console.debug = funnel
    process.stderr.write = ((chunk: unknown, enc?: unknown, cb?: unknown): boolean => {
      if (!funneling) {
        funneling = true
        try {
          const s = typeof chunk === 'string' ? chunk : String(chunk)
          for (const l of s.replace(/\n$/, '').split('\n')) if (l) pushLog(l)
        } finally {
          funneling = false
        }
      }
      const done = typeof enc === 'function' ? enc : typeof cb === 'function' ? cb : undefined
      ;(done as (() => void) | undefined)?.()
      return true
    }) as typeof process.stderr.write
    releaseCapture = restore
  }

  // Force Node to re-query the real terminal size. `columns`/`rows` are only a
  // cache refreshed on the 'resize' event, and on some Windows terminals that
  // event doesn't fire when the window is widened — leaving the boxes stuck at
  // the startup size with dead space to the right. `_refreshSize()` (what the
  // resize handler calls internally) pulls the live size; guarded so a Node
  // build without it just falls back to the cached values.
  const refreshSize = (): void => {
    try {
      ;(out as unknown as { _refreshSize?: () => void })._refreshSize?.()
    } catch {
      /* not available — cached columns/rows are the best we have */
    }
  }

  let lastW = cols()
  let lastH = rows()
  const redraw = (): void => {
    lastW = cols()
    lastH = rows()
    drawAll()
  }

  redraw()
  capture()
  // One timer drives both the blinking dots and resize detection: each tick we
  // re-read the live size and, if it changed, do a full redraw at the new
  // dimensions; otherwise we just advance the animation. This makes the layout
  // track the terminal even when the 'resize' event never arrives.
  const timer = setInterval(() => {
    refreshSize()
    if (cols() !== lastW || rows() !== lastH) {
      redraw()
      return
    }
    dots = (dots + 1) % 4
    drawArt()
    out.write(at(rows(), 1))
  }, 350)
  timer.unref?.() // never keep the process alive just for the animation

  // The 'resize' event, where it does fire, gives an instant redraw (the poll is
  // the fallback). Both funnel through redraw(), so they can't double-draw.
  const onResize = (): void => redraw()
  out.on('resize', onResize)

  return {
    stop: () => {
      clearInterval(timer)
      out.removeListener('resize', onResize)
      restore()
      out.write(SHOW)
    },
    log: pushLog,
  }
}
