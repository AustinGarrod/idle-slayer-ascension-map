import { expect, test } from '@playwright/test'

test('sequential keyboard navigation skips backing file inputs while visible picker buttons work', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.toolbar')).toBeVisible()
  const footerPrivacy = page.locator('footer').getByRole('button', { name: 'Privacy & tracking', exact: true })
  const lastVisible = await footerPrivacy.isVisible() ? footerPrivacy : page.getByRole('button', { name: 'Map navigation', exact: true })
  await lastVisible.focus()
  const inputs = page.locator('input[type="file"]')
  expect(await inputs.count()).toBe(2)
  for (let count = 0; count < 2; count++) {
    await page.keyboard.press('Tab')
    for (const input of await inputs.all()) await expect(input).not.toBeFocused()
  }

  const progress = page.getByRole('button', { name: 'Progress', exact: true })
  if (!await progress.isVisible()) await page.getByRole('button', { name: 'Map options', exact: true }).click()
  await progress.click()
  const restorePicker = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Restore JSON backup…', exact: true }).click()
  expect((await restorePicker).isMultiple()).toBe(false)
  const gamePicker = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import game save…', exact: true }).click()
  expect((await gamePicker).isMultiple()).toBe(false)
})
