#!/usr/bin/env node
// Seed a local TELAR-MASTER/ from the committed starter example, so a fresh
// clone has data to run against (`npm run dev` reads ../TELAR-MASTER). This is a
// no-op if TELAR-MASTER/ already exists, so it never overwrites your real
// project. TELAR-MASTER/ is gitignored — it's your working copy, not repo data.

import { cpSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'examples', 'starter-master')
const dest = join(root, 'TELAR-MASTER')

if (existsSync(dest)) {
  console.log(`TELAR-MASTER/ already exists — leaving it untouched:\n  ${dest}`)
  process.exit(0)
}
if (!existsSync(src)) {
  console.error(`Starter example not found at:\n  ${src}`)
  process.exit(1)
}

cpSync(src, dest, { recursive: true })
console.log(`Seeded TELAR-MASTER/ from examples/starter-master:\n  ${dest}\n\nRun \`npm run dev\` and open http://localhost:5173 to explore it.`)
