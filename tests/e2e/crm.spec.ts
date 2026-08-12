import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiStub } from './api-stub'

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(result.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious').map((violation) => ({ id: violation.id, targets: violation.nodes.flatMap((node) => node.target) }))).toEqual([])
}

test('CRM persists import, filtering, segment, outreach, pipeline, and add-to-event workflows', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  const api = await installApiStub(page, { role: 'owner' })
  await page.goto('/#/crm')

  await expect(page.getByRole('heading', { name: 'Speaker CRM' })).toBeVisible()
  await expect(page.getByLabel('Airtable connection')).toContainText('D1 CRM remains fully operational')
  await page.getByRole('button', { name: 'directory' }).click()

  await page.locator('input[type=file][accept*="csv"]').setInputFiles({
    name: 'speaker-import.csv', mimeType: 'text/csv',
    buffer: Buffer.from('first name,last name,email,company,title\nMaya,Chen,maya@example.com,Duplicate Co,CEO\nNina,Patel,nina@example.com,NewCo,CTO\n'),
  })
  await expect(page.getByRole('status')).toContainText('Imported 1 contacts; duplicates skipped.')
  await expect.poll(() => api.crm.contacts.some((contact) => contact.email === 'nina@example.com')).toBe(true)

  await page.getByLabel('Search contacts').fill('Nina')
  await expect(page.getByRole('row', { name: /Nina Patel/ })).toBeVisible()
  await page.getByPlaceholder('Segment name').fill('NewCo leaders')
  await page.getByRole('button', { name: 'Save dynamic segment' }).click()
  await expect(page.getByRole('status')).toContainText('Dynamic segment saved.')

  await page.getByLabel('Search contacts').fill('')
  await page.getByLabel('Select Maya Chen').check()
  await page.getByLabel('Select Nina Patel').check()
  await expect(page.getByRole('heading', { name: 'Bulk outreach (2)' })).toBeVisible()
  await page.getByLabel('Subject').fill('Invitation for {{first_name}}')
  await page.getByRole('button', { name: 'Queue campaign' }).click()
  await expect(page.getByRole('status')).toContainText('Queued outreach for 2 contacts.')
  expect(api.crm.campaigns.at(-1)?.preview).toContain('Nina Patel: Hi Nina')

  const ninaRow = page.getByRole('row', { name: /Nina Patel/ })
  await ninaRow.getByRole('button', { name: 'Enroll' }).click()
  await expect(page.getByRole('status')).toContainText('Contact enrolled in pipeline.')
  await ninaRow.getByRole('button', { name: /Nina Patel/ }).click()
  await page.getByRole('button', { name: 'Add to event' }).click()
  await expect(page.getByRole('status')).toContainText('Contact added to the event with profile data preserved.')
  await expect.poll(() => api.state.speakers.some((speaker) => speaker.email === 'nina@example.com')).toBe(true)

  await page.getByRole('button', { name: 'pipeline' }).click()
  await page.getByLabel('Move Nina Patel').selectOption({ label: 'Confirmed' })
  await expect(page.getByRole('status')).toContainText('Pipeline stage updated.')
  await page.getByText('Nina Patel', { exact: true }).locator('..').getByText('Notes and stage history').click()
  await page.getByText('Nina Patel', { exact: true }).locator('..').getByLabel('Internal note').fill('Strong fit for the keynote track.')
  await page.getByText('Nina Patel', { exact: true }).locator('..').getByRole('button', { name: 'Save note' }).click()
  await expect(page.getByRole('status')).toContainText('Pipeline note saved.')

  await page.reload()
  await page.getByRole('button', { name: 'segments' }).click()
  await expect(page.getByRole('heading', { name: 'NewCo leaders' })).toBeVisible()
  await page.getByRole('button', { name: 'history' }).click()
  await expect(page.getByText(/Invitation for \{\{first_name\}\}/)).toBeVisible()
  expect(api.crmWrites.length).toBeGreaterThanOrEqual(6)
  await expectNoSeriousAccessibilityViolations(page)
  expect(consoleErrors).toEqual([])
})
