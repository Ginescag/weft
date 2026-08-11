// menu.ts — the interactive `weft` menu: a tiny arrow-key single-select (no
// dependency, hand-rolled with raw-mode keypress events) plus the top-level
// menu loop. Only reached from a real terminal; non-interactive runs serve
// directly (see index.ts / resolveManagedMaster).

import { emitKeypressEvents } from 'node:readline'
import {
  createProjectInteractive,
  handleMissingMaster,
  loadConfig,
  masterExists,
  moveProjectInteractive,
} from './config.js'
import { C, printBanner } from './art.js'

interface Choice<T> {
  label: string
  /** One-line explanation shown, muted, next to the option. */
  desc: string
  value: T
}

interface Key {
  name?: string
  ctrl?: boolean
}

const HIDE_CURSOR = '\x1b[?25l'
const SHOW_CURSOR = '\x1b[?25h'

const cols = (): number => process.stdout.columns || 80

/**
 * Render an arrow-navigable list — each option with a muted explanation, the
 * whole block centred and coloured in the Weft palette — and resolve with the
 * chosen value. ↑/↓ (or k/j) move, Enter selects; q/Esc and Ctrl-C exit.
 */
function select<T>(choices: Choice<T>[]): Promise<T> {
  return new Promise((resolvePromise) => {
    const { stdin, stdout } = process
    let index = 0

    const maxLabel = Math.max(...choices.map((c) => c.label.length))
    const blockW = Math.max(...choices.map((c) => 2 + maxLabel + 3 + c.desc.length))
    const hint = '↑ ↓ move · Enter choose · q quit'
    const indent = (): string =>
      ' '.repeat(Math.max(0, Math.floor((cols() - blockW) / 2)))

    emitKeypressEvents(stdin)
    if (stdin.isTTY) stdin.setRawMode(true)
    stdin.resume()
    stdout.write(HIDE_CURSOR)

    const draw = (first: boolean) => {
      if (!first) stdout.write(`\x1b[${choices.length + 1}A`) // back up over the last render
      stdout.write('\x1b[0J') // clear from cursor down
      const pad = indent()
      stdout.write(`${pad}${C.dim}${hint}${C.reset}\n`)
      for (let i = 0; i < choices.length; i++) {
        const on = i === index
        const c = choices[i]
        const pointer = on ? `${C.burgundy}❯${C.reset} ` : '  '
        const label = on ? `${C.burgundy}${C.bold}${c.label}${C.reset}` : c.label
        const gap = ' '.repeat(maxLabel - c.label.length)
        stdout.write(`${pad}${pointer}${label}${gap}   ${C.muted}${c.desc}${C.reset}\n`)
      }
    }

    const cleanup = () => {
      stdout.write(SHOW_CURSOR)
      stdin.off('keypress', onKey)
      if (stdin.isTTY) stdin.setRawMode(false)
      stdin.pause()
    }

    const onKey = (_str: string, key: Key) => {
      if (key.ctrl && key.name === 'c') {
        cleanup()
        stdout.write('\n')
        process.exit(130)
      } else if (key.name === 'q' || key.name === 'escape') {
        cleanup()
        stdout.write('\n')
        process.exit(0)
      } else if (key.name === 'up' || key.name === 'k') {
        index = (index - 1 + choices.length) % choices.length
        draw(false)
      } else if (key.name === 'down' || key.name === 'j') {
        index = (index + 1) % choices.length
        draw(false)
      } else if (key.name === 'return' || key.name === 'enter') {
        cleanup()
        stdout.write('\n')
        resolvePromise(choices[index].value)
      }
    }

    stdin.on('keypress', onKey)
    draw(true)
  })
}

type Action = 'serve' | 'move' | 'quit'

/**
 * The bare-`weft` menu: make sure a project exists (create / regenerate /
 * relocate as needed), then loop Start / Move / Quit. Returns the master dir to
 * serve once the user chooses Start.
 */
export async function runInteractiveMenu(): Promise<string> {
  const cfg = await loadConfig()
  if (!cfg) return createProjectInteractive() // nothing to serve yet → set up, then serve

  let master = (await masterExists(cfg.masterDir))
    ? cfg.masterDir
    : await handleMissingMaster(cfg.masterDir)

  for (;;) {
    process.stdout.write('\x1b[2J\x1b[H') // fresh canvas each time we land here
    printBanner()
    const loc = `${C.dim}project · ${master}${C.reset}`
    process.stdout.write(
      ' '.repeat(Math.max(0, Math.floor((cols() - (10 + master.length)) / 2))) + loc + '\n\n',
    )
    const action = await select<Action>([
      { label: 'Start Weft', desc: 'open the dashboard in your browser', value: 'serve' },
      { label: 'Move project', desc: 'relocate your WEFT-MASTER folder', value: 'move' },
      { label: 'Quit', desc: 'close this menu', value: 'quit' },
    ])
    if (action === 'serve') return master
    if (action === 'quit') process.exit(0)
    const moved = await moveProjectInteractive(master)
    if (moved) master = moved
  }
}
