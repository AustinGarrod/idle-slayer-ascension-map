import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/idle-slayer-ascension-map/',
  plugins: [react()],
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
        '**/appmanifest_1353300.acf',
      ],
    },
  },
})
