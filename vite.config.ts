import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { runtimeNoticesPlugin } from './scripts/runtime-notices.ts'

export default defineConfig({
  base: '/idle-slayer-ascension-map/',
  plugins: [react(), runtimeNoticesPlugin(process.cwd())],
  server: {
    fs: {
      deny: [
        '.env',
        '.env.*',
        '*.{crt,pem}',
        '**/.git/**',
        '**/.local-game/**',
        '**/Idle Slayer_Data/**',
        '**/*.dll',
        '**/*.sav',
        '**/appmanifest_1353300.acf',
      ],
    },
  },
})
