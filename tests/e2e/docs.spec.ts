import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('public documentation supports navigation, search, examples, and accessible reading', async ({ page }) => {
  const apiCalls: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/')) apiCalls.push(request.url())
  })

  await page.goto('/#/docs')
  await expect(page.getByRole('heading', { name: /From first proposal/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Quickstart', exact: true })).toBeVisible()
  await expect(page.locator('pre').filter({ hasText: 'npm run dev' }).first()).toBeVisible()
  expect(apiCalls).toEqual([])

  await page.getByPlaceholder('Search the docs…').fill('Airtable')
  const sidebar = page.locator('.docs-sidebar')
  await expect(sidebar.getByRole('button', { name: /CRM & Airtable/ })).toBeVisible()
  await expect(sidebar.getByRole('button', { name: /Reviews/ })).toHaveCount(0)
  await sidebar.getByRole('button', { name: /CRM & Airtable/ }).click()
  await expect(page).toHaveURL(/#\/docs\/crm-airtable$/)
  await expect(page.getByRole('heading', { name: 'Cross-event CRM and Airtable' })).toBeVisible()
  await expect(page.getByText('/api/workspaces/:workspaceId/crm/integrations/airtable/sync')).toBeVisible()

  await page.getByRole('tab', { name: 'JavaScript' }).first().click()
  await expect(page.getByRole('tabpanel').first()).toContainText("fetch('/api/health')")

  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(result.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([])
})

test('documentation navigation works on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/docs/deployment')
  await expect(page.getByRole('heading', { name: 'Production setup' })).toBeVisible()
  await page.getByRole('button', { name: 'Open documentation navigation' }).click()
  await expect(page.getByRole('navigation', { name: 'Documentation sections' })).toBeVisible()
  await page.getByRole('button', { name: /Errors & troubleshooting/ }).click()
  await expect(page).toHaveURL(/#\/docs\/errors$/)
  await expect(page.getByRole('heading', { name: 'Errors and troubleshooting' })).toBeVisible()
})

test('documentation skip link, code tabs, and clipboard failure are keyboard and screen-reader accessible', async ({ page }) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))
  await page.goto('/#/docs')

  await page.getByRole('link', { name: 'Skip to documentation' }).focus()
  await expect(page.getByRole('link', { name: 'Skip to documentation' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#docs-content')).toBeFocused()
  await expect(page).toHaveURL(/#\/docs$/)

  const curlTab = page.getByRole('tab', { name: 'cURL' }).first()
  await curlTab.focus()
  await page.keyboard.press('End')
  await expect(page.getByRole('tab', { name: 'JavaScript' }).first()).toBeFocused()
  await expect(page.getByRole('tab', { name: 'JavaScript' }).first()).toHaveAttribute('aria-selected', 'true')

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: () => false })
  })
  await page.getByRole('button', { name: 'Copy code' }).first().click()
  await expect(page.getByRole('button', { name: 'Copy code' }).first()).toContainText('Copy failed')
  await expect(page.getByRole('status').filter({ hasText: 'Clipboard access is unavailable' }).first()).toBeAttached()
  expect(pageErrors).toEqual([])
})
