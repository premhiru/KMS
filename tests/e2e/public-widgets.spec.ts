import { expect, test } from '@playwright/test'
import { createSeedState } from '../../src/domain'
import { installApiStub } from './api-stub'

test('five public widget surfaces expose rich browse, detail, search, filtering, and multi-day navigation', async ({ page }) => {
  const state = createSeedState()
  const secondDayStart = '2026-09-17T17:00:00.000Z'
  state.sessions.push({ ...state.sessions[0], id: 'session-agents-day-two', startAt: secondDayStart, endAt: '2026-09-17T17:30:00.000Z' })
  await installApiStub(page, { state })

  await page.goto('/#/event/sessions')
  await expect(page.getByRole('heading', { name: 'Sessions list' })).toBeVisible()
  await expect(page.locator('.public-rich-session-card')).toHaveCount(4)
  await page.getByPlaceholder('Search titles or speakers').fill('Chen')
  await expect(page.getByText('Showing 2 sessions')).toBeVisible()
  await page.getByPlaceholder('Search titles or speakers').fill('')
  await page.getByLabel('Filter sessions by format').selectOption({ label: 'Workshop' })
  await expect(page.locator('.public-rich-session-card')).toHaveCount(1)

  await page.goto('/#/event/speakers')
  await page.getByPlaceholder('Search speaker name').fill('Maya Chen')
  await expect(page.locator('.public-speaker-list .public-speaker-card')).toHaveCount(1)
  await page.locator('.public-speaker-list .public-speaker-card').click()
  await expect(page.getByRole('dialog', { name: /Maya Chen details/ })).toContainText('Sessions (2)')
  await page.getByRole('button', { name: /Close Maya Chen details/ }).click()

  await page.goto('/#/event/agenda')
  await expect(page.getByLabel('Event days').getByRole('button')).toHaveCount(2)
  await page.getByLabel('Event days').getByRole('button').nth(1).click()
  await expect(page.locator('.public-agenda-grid')).toContainText('Beyond the chatbot')

  await page.goto('/#/event/gallery')
  await expect(page.getByRole('heading', { name: 'Speaker gallery' })).toBeVisible()
  await expect(page.locator('.public-gallery-grid .public-speaker-card')).toHaveCount(3)
})

test('itinerary persists two selections and exports them in one calendar file', async ({ page }) => {
  await installApiStub(page)
  await page.goto('/#/event/itinerary')
  const add = page.getByRole('button', { name: /Add to itinerary/ })
  await add.nth(0).click()
  await add.nth(0).click()
  await expect(page.getByRole('button', { name: 'My itinerary (2)' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'My itinerary (2)' })).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export selected (.ics)' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toContain('my-itinerary.ics')
  const stream = await download.createReadStream()
  let body = ''
  for await (const chunk of stream) body += chunk.toString()
  expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(2)
})

test('organizer creates, saves, previews, and retrieves a configured embed', async ({ page }) => {
  const api = await installApiStub(page, { role: 'owner' })
  await page.goto('/#/embeds')
  await expect(page.getByRole('heading', { name: 'Embed manager' })).toBeVisible()
  await page.getByLabel('Name').fill('AI sessions feed')
  await page.getByLabel('Widget type').selectOption('sessions')
  await page.getByLabel('Output format').selectOption('json')
  await page.getByLabel('Track filter').selectOption('Agents & orchestration')
  await page.getByRole('button', { name: 'Save embed' }).click()
  await expect(page.locator('.embed-list')).toContainText('AI sessions feed')
  await expect.poll(() => api.state.event.embeds?.some((embed) => embed.name === 'AI sessions feed')).toBe(true)
  expect(api.stateWrites.length).toBeGreaterThan(0)
  await page.reload()
  await expect(page.locator('.embed-list')).toContainText('AI sessions feed')
  await page.getByRole('button', { name: /Get code/ }).click()
  await expect(page.getByRole('dialog', { name: /Code for AI sessions feed/ }).locator('pre')).toContainText('output=json')
})
