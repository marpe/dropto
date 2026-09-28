import { execFileSync } from 'node:child_process'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** Short commit hash: Vercel/GitHub CI provide it; locally ask git; otherwise mark the build unknown. */
function resolveCommitHash(): string {
  const ciCommit = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA
  if (ciCommit) {
    return ciCommit.slice(0, 7)
  }
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    // Not a git checkout (e.g. a source tarball); the footer shows "unknown"
    return 'unknown'
  }
}

export default defineConfig({
  define: {
    __BUILD_COMMIT__: JSON.stringify(resolveCommitHash()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'dropto.space - 10GB P2P WebRTC Transfer',
        short_name: 'dropto.space',
        description: 'Direct browser-to-browser WebRTC file transfer supporting up to 10GB+ with zero memory bloat.',
        theme_color: '#2B7FFF',
        background_color: '#121212',
        display: 'standalone',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          }
        ]
      }
    })
  ],
})
