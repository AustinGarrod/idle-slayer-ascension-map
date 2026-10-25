import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { runtimeNoticesPlugin } from './scripts/runtime-notices.ts'
import { pwaPlugin } from './scripts/pwa.ts'
import { reportingBuildPlugin, reportingRelease, reportingCommit } from './scripts/reporting-build.ts'

const release = reportingRelease(process.cwd())

export default defineConfig({
  base: '/idle-slayer-companion/',
  define: { 'import.meta.env.VITE_REPORTING_RELEASE': JSON.stringify(release), 'import.meta.env.VITE_REPORTING_COMMIT': JSON.stringify(reportingCommit(process.cwd())) },
  build: { sourcemap: 'hidden' },
  plugins: [react(), runtimeNoticesPlugin(process.cwd()), reportingBuildPlugin(process.cwd(), release), pwaPlugin(process.cwd())],
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
