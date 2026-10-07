import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { Catalog } from '../../src/domain/types'

const catalog = JSON.parse(readFileSync('public/catalog.json', 'utf8')) as Catalog

test('invalid source records fail recoverably before upgrade details can render', async ({ page }) => {
  const errors: Error[] = []
  page.on('pageerror', (error) => errors.push(error))
  const invalid = structuredClone(catalog)
  Object.assign(invalid.upgrades.find((node) => node.id === catalog.startId)!, { sources: [null] })
  await page.route('**/catalog.json', (route) => route.fulfill({ json: invalid }))
  await page.goto('./')
  await expect(page.getByRole('status')).toHaveText('The verified game catalog could not be loaded. Please try again.')
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
  await expect(page.getByRole('searchbox')).toHaveCount(0)
  expect(errors).toEqual([])
})
