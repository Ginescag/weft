import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Dev has two servers (Vite :5173, backend :3131). The page fetches its own
    // origin (/api/*) and Vite forwards it to the backend, sidestepping CORS.
    proxy: { '/api': 'http://localhost:3131' },
  },
})
