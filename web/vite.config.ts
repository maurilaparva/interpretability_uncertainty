import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'

// Release stamp saved with every study response: the nearest git tag, plus commits since it and
// "-dirty" for uncommitted changes (e.g. v0.2.0, v0.2.0-3-g1a2b3c4, v0.2.0-dirty).
function gitVersion(): string {
  try {
    return execSync('git describe --tags --always --dirty', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return 'unknown'
  }
}
process.env.VITE_APP_VERSION ??= gitVersion()

// base './' so the built dist/ works from any sub-path (GitHub Pages, Netlify, file server)
export default defineConfig({
  base: './',
  plugins: [react()],
})
