// Original code-native tree mark. No Idle Slayer sprites or third-party artwork.
// Run with the reviewed Playwright Chromium installed; inspect outputs before commit.
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
const browser = await chromium.launch()
mkdirSync('public/pwa', { recursive: true })
for (const [file, size, scale] of [['icon-192.png', 192, 1], ['icon-512.png', 512, 1], ['apple-touch-icon.png', 180, 1], ['maskable-512.png', 512, 0.72]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await page.setContent(`<style>html,body{margin:0;overflow:hidden}svg{display:block;width:100vw;height:100vh}</style><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#231e19"/><g transform="translate(256 256) scale(${scale}) translate(-256 -256)"><path d="M256 356V260M256 260L150 154M256 260L362 154" fill="none" stroke="#b860af" stroke-width="22" stroke-linejoin="round"/><g fill="#15120f" stroke="#d6ae61" stroke-width="16"><path d="M256 304L308 356L256 408L204 356Z"/><path d="M256 208L308 260L256 312L204 260Z"/><path d="M150 102L202 154L150 206L98 154Z"/><path d="M362 102L414 154L362 206L310 154Z"/></g><path d="M256 244V276M240 260H272" stroke="#f1d79b" stroke-width="10"/></g></svg>`)
  await page.screenshot({ path: `public/pwa/${file}` })
  await page.close()
}
await browser.close()
