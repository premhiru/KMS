import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiStub } from './api-stub'

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(result.violations
    .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
    .map((violation) => ({ id: violation.id, targets: violation.nodes.flatMap((node) => node.target) })))
    .toEqual([])
}

test('bare root is a public gateway that performs no API authentication or event-data requests', async ({ page }) => {
  const api = await installApiStub(page, { role: 'owner' })
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('#organizer-navigation')).toHaveCount(0)
  await expect.poll(() => api.apiRequests).toEqual([])
})

test('gateway exposes accessible public destinations and secure role guidance', async ({ page }) => {
  const api = await installApiStub(page, { role: 'owner' })
  await page.goto('/')

  const organizer = page.getByRole('link', { name: 'Organizer sign in' })
  await expect(organizer).toHaveAttribute('href', /\/signin-with-chatgpt\?return_to=/)
  const organizerHref = await organizer.getAttribute('href')
  expect(decodeURIComponent(organizerHref ?? '')).toContain('#/dashboard')

  const cfp = page.getByRole('link', { name: /(?:submit|proposal|cfp)/i }).first()
  const program = page.getByRole('link', { name: /(?:program|agenda|schedule)/i }).first()
  const docs = page.getByRole('link', { name: /doc/i }).first()
  await expect(cfp).toHaveAttribute('href', /#\/cfp$/)
  await expect(program).toHaveAttribute('href', /#\/event$/)
  await expect(docs).toHaveAttribute('href', /#\/docs$/)

  const speakerRole = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Speaker' }) })
  const reviewerRole = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Reviewer' }) })
  await expect(speakerRole).toContainText(/private link sent to your verified email/i)
  await expect(reviewerRole).toContainText(/emailed one-time invitation/i)
  await expect(speakerRole.getByText(/open your secure email link/i)).toBeVisible()
  await expect(reviewerRole.getByText(/open your secure email link/i)).toBeVisible()
  expect(api.apiRequests).toEqual([])
  await expectNoSeriousAccessibilityViolations(page)
})

for (const destination of [
  { name: 'CFP', link: /(?:submit|proposal|cfp)/i, hash: '#/cfp', heading: /Share what you learned|call for proposals/i },
  { name: 'program', link: /(?:program|agenda|schedule)/i, hash: '#/event', heading: /AI Engineer Summit/i },
  { name: 'documentation', link: /doc/i, hash: '#/docs', heading: /documentation/i },
]) {
  test(`${destination.name} opens publicly without workspace sign-in`, async ({ page }) => {
    const api = await installApiStub(page)
    await page.goto('/')
    await page.getByRole('link', { name: destination.link }).first().click()
    await expect(page).toHaveURL(new RegExp(`${destination.hash.replace('/', '\\/')}$`))
    await expect(page.getByRole('heading', { name: destination.heading }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Organizer sign-in required' })).toHaveCount(0)
    expect(api.apiRequests.some((request) => request.path.endsWith('/session'))).toBe(false)
  })
}

test('gateway is overflow-safe and axe-clean at a 390px mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const api = await installApiStub(page)
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  expect(api.apiRequests).toEqual([])
  await expectNoSeriousAccessibilityViolations(page)
})

test('direct organizer dashboard remains protected rather than falling back to the public gateway', async ({ page }) => {
  const api = await installApiStub(page, { role: 'owner', hydrationFailure: true })
  await page.goto('/#/dashboard')

  await expect(page.getByRole('heading', { name: 'Workspace unavailable' })).toBeVisible()
  expect(api.apiRequests.some((request) => request.path.endsWith('/session'))).toBe(true)
  await expect(page.getByRole('heading', { name: /welcome/i })).toHaveCount(0)
})

test('speaker invitation bypasses the gateway and opens a standalone editable portal', async ({ page }) => {
  const api = await installApiStub(page, { role: 'owner' })
  await page.goto('/#/speakers')
  await page.getByRole('button', { name: 'Send portal invite' }).first().click()
  await expect.poll(() => api.speakerInvitationLinks.length).toBe(1)

  await page.goto(api.speakerInvitationLinks[0])
  await expect(page.getByRole('heading', { name: /Welcome,/ })).toBeVisible()
  await expect(page.locator('#organizer-navigation')).toHaveCount(0)
  await expect(page.getByText('Read-only participant preview')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Save profile' })).toBeEnabled()
  await expect(page).not.toHaveURL(/claimToken=/)
})
