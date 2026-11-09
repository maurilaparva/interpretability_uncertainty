import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base './' so the built dist/ works from any sub-path (GitHub Pages, Netlify, file server)
export default defineConfig({
  base: './',
  plugins: [react()],
})
