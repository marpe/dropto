import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // dropto.space assets are swapped in by the boot script in index.html
      includeAssets: ['favicon.svg', 'favicon-dropto.svg', 'manifest-dropto.webmanifest'],
      manifest: {
        name: 'DropWave - 10GB P2P WebRTC Transfer',
        short_name: 'DropWave',
        description: 'Direct browser-to-browser WebRTC file transfer supporting up to 10GB+ with zero memory bloat.',
        theme_color: '#3ECF8E',
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
