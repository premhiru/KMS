import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiStub } from './api-stub'

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const violations = result.violations
    .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
    .map((violation) => ({ id: violation.id, impact: violation.impact, targets: violation.nodes.flatMap((node) => node.target) }))
  expect(violations).toEqual([])
}

test('organizer decision persists through the production remote-state path', async ({ page }) => {
  const api = await installApiStub(page, { role: 'owner' })
  await page.goto('/#/dashboard')

  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()
  await page.getByRole('button', { name: /Submissions/ }).first().click()
  await page.getByText('Developer experience for probabilistic software', { exact: true }).click()
  await page.getByRole('button', { name: 'Accept', exact: true }).click()

  await expect.poll(() => api.stateWrites.length).toBeGreaterThan(0)
  await expect.poll(() => api.state.submissions.find((submission) => submission.id === 'submission-tools')?.status).toBe('accepted')
  await expectNoSeriousAccessibilityViolations(page)
})

test('anonymous CFP validates, focuses the first error, and submits to the public API', async ({ page }) => {
  const api = await installApiStub(page)
  await page.goto('/#/cfp')

  await page.getByRole('button', { name: /Submit proposal/ }).click()
  await expect(page.getByLabel('Session title')).toBeFocused()
  await expect(page.getByRole('alert')).toContainText('correct the highlighted fields')

  await page.getByLabel('Session title').fill('Shipping reliable agent workflows')
  await page.getByLabel('Abstract').fill('A detailed production case study covering failure recovery, observability, human escalation, and the concrete lessons teams can apply immediately.')
  await page.getByLabel(/measurable result or hard-won lesson/i).fill('We reduced failed automated handoffs by more than forty percent in production.')
  await page.getByLabel(/What will attendees learn/i).fill('A repeatable method for testing and operating reliable agent workflows.')
  await page.getByLabel(/Audience experience level/i).selectOption('Intermediate')
  await page.getByLabel('First name').fill('Avery')
  await page.getByLabel('Last name').fill('Jordan')
  await page.getByLabel(/^Email/).fill('avery@example.com')
  await page.getByLabel('Short bio').fill('Avery builds and operates dependable automation systems for product teams worldwide.')
  await page.getByRole('button', { name: /Submit proposal/ }).click()

  await expect(page.getByRole('heading', { name: 'Thank you, Avery.' })).toBeVisible()
  await expect(page.getByText('Contact email')).toBeVisible()
  expect(api.cfpSubmissions).toHaveLength(1)
  expect(api.cfpSubmissions[0]).toMatchObject({ speakerEmail: 'avery@example.com', consent: true })
  await expectNoSeriousAccessibilityViolations(page)
})

test('reviewer sees a failed save, then can retry successfully without a false success state', async ({ page }) => {
  const api = await installApiStub(page, { role: 'reviewer', email: 'sarah@example.com', failNextReviewWrite: true })
  await page.goto('/#/reviews')

  await expect(page.getByText(/Signed in as/)).toContainText('sarah@example.com')
  await page.getByText('Developer experience for probabilistic software', { exact: true }).click()
  await page.getByLabel('Private committee notes').fill('Clear practical evidence and an appropriate scope.')
  await page.getByRole('button', { name: 'Submit review' }).click()

  await expect(page.getByRole('heading', { name: 'Workspace unavailable' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('review service is temporarily unavailable')
  await expect(page.getByRole('button', { name: 'Review saved' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Retry' }).click()
  await page.getByText('Developer experience for probabilistic software', { exact: true }).click()
  await page.getByLabel('Private committee notes').fill('Clear practical evidence and an appropriate scope.')
  await page.getByRole('button', { name: 'Submit review' }).click()
  await expect.poll(() => api.reviewWrites.length).toBe(1)
  await expect(page.getByRole('button', { name: 'Review saved' })).toBeVisible()
  await expectNoSeriousAccessibilityViolations(page)
})

test('speaker response and profile changes persist and verified email stays read-only', async ({ page }) => {
  const api = await installApiStub(page, { role: 'speaker', email: 'priya@example.com' })
  await page.goto('/#/portal')

  await expect(page.getByRole('heading', { name: 'Welcome, Priya' })).toBeVisible()
  await expect(page.getByLabel('Email')).toHaveAttribute('readonly', '')
  await page.getByRole('button', { name: 'Accept invitation' }).click()
  await expect.poll(() => api.portalWrites.some((write) => (write.profile as { status?: string })?.status === 'confirmed')).toBe(true)

  await page.getByLabel('Company').fill('Edgeworks Release Lab')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect.poll(() => api.portalWrites.some((write) => (write.profile as { company?: string })?.company === 'Edgeworks Release Lab')).toBe(true)
  await expectNoSeriousAccessibilityViolations(page)
})

test('remote organizer safety controls cannot reset live data or mutate a portal preview', async ({ page }) => {
  const api = await installApiStub(page, { role: 'owner' })
  await page.goto('/#/settings')

  await expect(page.getByRole('button', { name: /Reset local preview/i })).toHaveCount(0)
  await page.goto('/#/portal')
  await expect(page.getByText('Read-only participant preview')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Welcome, Maya' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Accept invitation' })).toBeDisabled()
  await expect(page.getByLabel('Company')).toBeDisabled()
  await expect(page.locator('.portal-upload input[type="file"]').first()).toBeDisabled()
  expect(api.stateWrites).toHaveLength(0)
  await expectNoSeriousAccessibilityViolations(page)
})

test('public attendee flow is usable at mobile width, supports itinerary and exposes embed code', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await installApiStub(page)
  await page.goto('/#/event')

  await expect(page.getByRole('heading', { name: 'AI Engineer Summit' })).toBeVisible()
  await expect(page.getByText(/SAN FRANCISCO, CA/)).toBeVisible()
  const addButton = page.getByRole('button', { name: /Add to itinerary/ }).first()
  await addButton.click()
  await expect(page.getByRole('button', { name: /My itinerary \(1\)/ })).toBeVisible()
  await page.getByRole('button', { name: 'Embed' }).click()
  await expect(page.locator('.embed-panel pre')).toContainText('#/event')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  await expectNoSeriousAccessibilityViolations(page)
})

test('hydration failure fails closed instead of rendering bundled demo data', async ({ page }) => {
  await installApiStub(page, { hydrationFailure: true })
  await page.goto('/#/dashboard')

  await expect(page.getByRole('heading', { name: 'Workspace unavailable' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable')
  await expect(page.getByRole('heading', { name: 'Overview' })).toHaveCount(0)
  await expectNoSeriousAccessibilityViolations(page)
})

test('revision conflict rebases a local organizer edit over a disjoint remote change', async ({ page }) => {
  const api = await installApiStub(page, { role: 'owner', failNextStateWrite: true })
  await page.goto('/#/submissions')

  await page.getByText('Developer experience for probabilistic software', { exact: true }).click()
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await expect.poll(() => api.stateWrites.length).toBe(1)
  await expect.poll(() => api.state.event.venue).toBe('Remote collaborator venue')
  await expect.poll(() => api.state.submissions.find((submission) => submission.id === 'submission-tools')?.status).toBe('accepted')
  await expect(page.getByRole('heading', { name: 'Workspace unavailable' })).toHaveCount(0)
})

test('template editor supports keyboard entry, Escape close, and focus restoration', async ({ page }) => {
  await installApiStub(page, { role: 'owner' })
  await page.goto('/#/communications')

  const trigger = page.getByRole('button', { name: 'New template' })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Template editor' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Name')).toBeFocused()
  await dialog.getByRole('button', { name: 'Save template' }).focus()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Close editor' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('agenda program-item and assignment dialogs support keyboard open and close', async ({ page }) => {
  await installApiStub(page, { role: 'owner' })
  await page.goto('/#/agenda')

  const addProgramItem = page.getByRole('button', { name: 'Add program item' })
  await addProgramItem.focus()
  await page.keyboard.press('Enter')
  const programDialog = page.getByRole('dialog', { name: 'Add invited or manual session' })
  await expect(programDialog.getByLabel('Origin')).toBeFocused()
  await programDialog.getByRole('button', { name: 'Create accepted item' }).focus()
  await page.keyboard.press('Tab')
  await expect(programDialog.getByRole('button', { name: 'Close' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(programDialog).toHaveCount(0)
  await expect(addProgramItem).toBeFocused()

  await page.getByRole('button', { name: 'list', exact: true }).click()
  await page.getByRole('button', { name: 'Unschedule' }).first().click()
  const assign = page.getByRole('button', { name: 'Assign time and room' }).first()
  await assign.focus()
  await page.keyboard.press('Enter')
  const assignmentDialog = page.getByRole('dialog', { name: 'Assign session' })
  await expect(assignmentDialog.getByLabel('Room')).toBeFocused()
  await assignmentDialog.getByRole('button', { name: 'Save assignment' }).focus()
  await page.keyboard.press('Tab')
  await expect(assignmentDialog.getByRole('button', { name: 'Close assignment' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(assignmentDialog).toHaveCount(0)
  await expect(assign).toBeFocused()
})
