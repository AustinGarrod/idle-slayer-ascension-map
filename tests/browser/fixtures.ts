import { test as base, expect, type Page } from '@playwright/test'

// Every test has its own error list, including tabs it opens during the scenario.
export const test = base.extend<{ browserErrors: void; appServiceWorkers: boolean }>({
  appServiceWorkers: [false, { option: true }],
  context: async ({ context, appServiceWorkers }, use) => {
    if (!appServiceWorkers) await context.addInitScript(() => {
      // Playwright's global worker blocker probes sandboxed iframes too. Keep
      // those frames opaque, and block only the app's top-level registration.
      if (window.self !== window.top || !['http:', 'https:'].includes(location.protocol) || !isSecureContext || !('serviceWorker' in navigator)) return
      navigator.serviceWorker.register = async () => { throw new DOMException('App workers are disabled in this isolated test.', 'SecurityError') }
    })
    await use(context)
  },
  browserErrors: [async ({ context }, use) => {
    const errors: string[] = []
    const watched = new Set<Page>()
    const record = (error: Error) => errors.push(error.message)
    const watch = (page: Page) => {
      if (watched.has(page)) return
      watched.add(page)
      page.on('pageerror', record)
    }
    context.pages().forEach(watch)
    context.on('page', watch)
    try { await use() } finally {
      context.off('page', watch)
      watched.forEach((page) => page.off('pageerror', record))
      expect(errors, 'Unhandled browser errors during this scenario').toEqual([])
    }
  }, { auto: true }],
})

export { expect } from '@playwright/test'
