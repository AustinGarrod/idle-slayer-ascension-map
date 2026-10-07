import { test as base, expect, type Page } from '@playwright/test'

// Every test has its own error list, including tabs it opens during the scenario.
export const test = base.extend<{ browserErrors: void }>({
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
