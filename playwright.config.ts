import { defineConfig, devices } from '@playwright/test'
const deployedURL = process.env.PLAYWRIGHT_BASE_URL

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  use: { baseURL: deployedURL ?? 'http://127.0.0.1:4173/idle-slayer-ascension-map/' },
  webServer: deployedURL ? undefined : {
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/idle-slayer-ascension-map/',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
