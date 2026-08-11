#!/usr/bin/env node
// npx reads "bin" from the root package.json and runs this file. It only loads
// the compiled server; all logic lives in server/. Run `npm run build` first,
// or you'll hit "Cannot find module ../server/dist/index.js" (BACKEND_PLAN §8.6).
// Production mode makes the single process also serve the built frontend.
process.env.NODE_ENV ||= 'production'
import('../server/dist/index.js')
