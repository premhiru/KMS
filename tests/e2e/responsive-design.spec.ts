import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { installApiStub } from './api-stub'

const organizerRoutes = ['dashboard', 'submissions', 'cfp-builder', 'reviews', 'speakers', 'crm', 'deliverables', 'agenda', 'communications', 'embeds', 'portal', 'settings', 'admin']
const publicRoutes = ['cfp', 'event/sessions', 'event/speakers', 'event/agenda', 'event/itinerary', 'event/gallery', 'docs']

async function expectNoPageOverflow(page: Page, route: string) {
  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    visibleHeading: Boolean(document.querySelector('h1, main h2')),
    mainCount: document.querySelectorAll('main').length,
  }))
  expect(layout.visibleHeading, `${route} should expose a visible page heading`).toBe(true)
  expect(layout.mainCount, `${route} should expose exactly one main landmark`).toBe(1)
  expect(layout.scrollWidth, `${route} should not create page-level horizontal scrolling`).toBeLessThanOrEqual(layout.clientWidth + 1)
}

test('every product surface reflows without page-level overflow', async ({ page }) => {
  test.setTimeout(120_000)
  await installApiStub(page, { role: 'owner' })

  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 901, height: 800 }, { width: 1024, height: 800 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport)
    for (const route of [...organizerRoutes, ...publicRoutes]) {
      await page.goto(`/#/${route}`)
      await page.locator('main').first().waitFor({ state: 'visible' })
      await expectNoPageOverflow(page, `${route} at ${viewport.width}px`)
    }
  }
})

test('Speaker Wiki fields, attachments, and portal resources stay aligned', async ({ page }) => {
  await installApiStub(page, { role: 'owner' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/settings')
  const wiki = page.getByRole('region', { name: 'Speaker resources, wiki, and files' })
  await expect(wiki).toBeVisible()
  await expect(wiki.locator('.resource-edit-row')).toHaveCount(3)
  const bounds = await wiki.evaluate((element) => {
    const parent = element.getBoundingClientRect()
    return [...element.querySelectorAll('input, textarea, select, .resource-files')].filter((child) => getComputedStyle(child).display !== 'none').map((child) => {
      const box = child.getBoundingClientRect()
      return { left: box.left, right: box.right, parentLeft: parent.left, parentRight: parent.right }
    })
  })
  expect(bounds.every((box) => box.left >= box.parentLeft && box.right <= box.parentRight + 1)).toBe(true)

  await page.goto('/#/portal')
  const portalWiki = page.getByRole('region', { name: 'Event resources' })
  await expect(portalWiki).toBeVisible()
  const portalBounds = await page.locator('.participant-portal .portal-card').first().evaluate((element) => {
    const box = element.getBoundingClientRect()
    return { left: box.left, right: box.right, viewport: document.documentElement.clientWidth }
  })
  expect(portalBounds.left).toBeGreaterThanOrEqual(11)
  expect(portalBounds.right).toBeLessThanOrEqual(portalBounds.viewport - 11)
  await portalWiki.locator('summary').first().click()
  await expect(portalWiki.locator('.portal-safe-preview').first()).toBeVisible()
  await expectNoPageOverflow(page, 'speaker portal wiki at 390px')

  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(result.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([])
})

test('expanded speaker tools stay inside the mobile viewport', async ({ page }) => {
  await installApiStub(page, { role: 'owner' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/speakers')

  for (const tool of ['Import CSV', 'Assign a task']) {
    await page.getByText(tool, { exact: true }).click()
    await expectNoPageOverflow(page, `${tool} speaker disclosure at 390px`)
    const openTool = page.locator('.spk-tools[open]')
    const bounds = await openTool.evaluate((element) => {
      const viewport = document.documentElement.clientWidth
      const descendants = [...element.querySelectorAll<HTMLElement>('input, select, textarea, button, label')]
        .filter((child) => getComputedStyle(child).display !== 'none')
        .map((child) => {
          const box = child.getBoundingClientRect()
          return { left: box.left, right: box.right, viewport }
        })
      return descendants
    })
    expect(bounds.every((box) => box.left >= 0 && box.right <= box.viewport + 1)).toBe(true)
    await page.getByText(tool, { exact: true }).click()
  }
})

test('every product surface has no serious or critical axe violations on mobile', async ({ page }) => {
  test.setTimeout(120_000)
  await installApiStub(page, { role: 'owner' })
  await page.setViewportSize({ width: 390, height: 844 })

  for (const route of [...organizerRoutes, ...publicRoutes]) {
    await page.goto(`/#/${route}`)
    await page.locator('main').first().waitFor({ state: 'visible' })
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const severe = result.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    expect(severe, `${route} should have no serious or critical axe violations`).toEqual([])
  }
})

test('mobile navigation is inert when closed and restores focus after Escape', async ({ page }) => {
  await installApiStub(page, { role: 'owner' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/dashboard')
  const organizerNavigation = page.locator('#organizer-navigation')
  const organizerMenu = page.getByRole('button', { name: 'Open navigation' })
  await expect(organizerNavigation).toHaveAttribute('inert', '')
  await organizerMenu.click()
  await expect(organizerNavigation).not.toHaveAttribute('inert', '')
  await expect(page.getByRole('button', { name: 'Close navigation' }).last()).toBeFocused()
  const organizerTargets = await organizerNavigation.locator('button').evaluateAll((buttons) => buttons.map((button) => ({
    height: button.getBoundingClientRect().height,
    minHeight: Number.parseFloat(getComputedStyle(button).minHeight),
  })))
  expect(organizerTargets.every(({ height, minHeight }) => height >= 43.5 && minHeight >= 44)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(organizerMenu).toBeFocused()
  await expect(organizerNavigation).toHaveAttribute('inert', '')

  await page.goto('/#/docs')
  const docsNavigation = page.locator('#documentation-navigation')
  const docsMenu = page.getByRole('button', { name: 'Open documentation navigation' })
  await expect(docsNavigation).toHaveAttribute('inert', '')
  await docsMenu.click()
  await expect(page.getByRole('button', { name: 'Close documentation navigation' }).last()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(docsMenu).toBeFocused()
  await expect(docsNavigation).toHaveAttribute('inert', '')
  await expect(page.locator('.docs-endpoint').first()).toHaveAttribute('tabindex', '0')
})

test('primary embed actions remain visible outside the agenda theme', async ({ page }) => {
  await installApiStub(page, { role: 'owner' })
  await page.goto('/#/embeds')
  const action = page.getByRole('button', { name: /new embed/i })
  await expect(action).toBeVisible()
  const style = await action.evaluate((element) => {
    const computed = getComputedStyle(element)
    return { background: computed.backgroundColor, color: computed.color, border: computed.borderTopWidth }
  })
  expect(style.background).not.toBe('rgba(0, 0, 0, 0)')
  expect(style.background).not.toBe('transparent')
  expect(style.border).not.toBe('0px')
})

test('feature dialogs remain usable on short mobile screens', async ({ page }) => {
  await installApiStub(page, { role: 'owner' })
  await page.setViewportSize({ width: 390, height: 500 })
  await page.goto('/#/agenda')
  await expect(page.getByText('Swipe horizontally to see every room')).toBeVisible()
  await page.getByRole('button', { name: 'Add program item' }).click()
  const assignment = page.locator('.assignment-panel form')
  await expect(assignment).toBeVisible()
  const assignmentBox = await assignment.evaluate((element) => ({ height: element.getBoundingClientRect().height, viewport: window.innerHeight, overflow: getComputedStyle(element).overflowY }))
  expect(assignmentBox.height).toBeLessThanOrEqual(assignmentBox.viewport - 24)
  expect(assignmentBox.overflow).toBe('auto')

  await page.goto('/#/communications')
  await page.getByRole('button', { name: 'New template' }).click()
  const template = page.locator('.template-modal form')
  await expect(template).toBeVisible()
  const templateBox = await template.evaluate((element) => ({ height: element.getBoundingClientRect().height, viewport: window.innerHeight, overflow: getComputedStyle(element).overflowY }))
  expect(templateBox.height).toBeLessThanOrEqual(templateBox.viewport - 24)
  expect(templateBox.overflow).toBe('auto')
})
