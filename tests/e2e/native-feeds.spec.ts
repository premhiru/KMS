import { expect, test } from '@playwright/test'
import { installApiStub } from './api-stub'

test('native public feeds preserve MIME, caching, filters, CORS, HEAD, and privacy contracts', async ({ page }) => {
  const api = await installApiStub(page)
  await page.goto('/#/event')

  const result = await page.evaluate(async () => {
    const base = '/api/public/events/workspace-premhiru-kms/ai-engineer-summit/feeds/program'
    const jsonResponse = await fetch(`${base}.json`)
    const json = await jsonResponse.json()
    const etag = jsonResponse.headers.get('etag')!
    const cached = await fetch(`${base}.json`, { headers: { 'If-None-Match': etag } })
    const filtered = await fetch(`${base}.json?track=${encodeURIComponent('No matching track')}`).then((response) => response.json())
    const matchingFiltersResponse = await fetch(`${base}.json?track=${encodeURIComponent('Agents & orchestration')}&format=Talk&room=${encodeURIComponent('Main stage')}`)
    const matchingFilters = await matchingFiltersResponse.json()
    const wrongRoom = await fetch(`${base}.json?room=${encodeURIComponent('Private green room')}`).then((response) => response.json())
    const xmlResponse = await fetch(`${base}.xml`)
    const xml = await xmlResponse.text()
    const calendarResponse = await fetch(`${base}.ics`)
    const calendar = await calendarResponse.text()
    const head = await fetch(`${base}.ics`, { method: 'HEAD' })
    return {
      json, filtered, matchingFilters, wrongRoom, xml, calendar,
      jsonType: jsonResponse.headers.get('content-type'), xmlType: xmlResponse.headers.get('content-type'), calendarType: calendarResponse.headers.get('content-type'),
      cors: jsonResponse.headers.get('access-control-allow-origin'), cache: jsonResponse.headers.get('cache-control'), cachedStatus: cached.status,
      filteredEtag: matchingFiltersResponse.headers.get('etag'), etag,
      headStatus: head.status, headType: head.headers.get('content-type'), headBody: await head.text(),
    }
  })

  expect(result.jsonType).toContain('application/json')
  expect(result.xmlType).toContain('application/xml')
  expect(result.calendarType).toContain('text/calendar')
  expect(result.cors).toBe('*')
  expect(result.cache).toContain('max-age=300')
  expect(result.cachedStatus).toBe(304)
  expect(result.headStatus).toBe(200)
  expect(result.headType).toContain('text/calendar')
  expect(result.headBody).toBe('')
  expect(result.filtered.sessions).toEqual([])
  expect(result.matchingFilters.sessions).toHaveLength(1)
  expect(result.matchingFilters.sessions[0]).toMatchObject({ track: 'Agents & orchestration', format: 'Talk', room: 'Main stage' })
  expect(result.wrongRoom.sessions).toEqual([])
  expect(result.filteredEtag).not.toBe(result.etag)
  expect(result.xml).toContain('<?xml version="1.0"')
  expect(result.calendar).toContain('METHOD:PUBLISH')
  expect(result.json.sessions.length).toBeGreaterThan(0)
  const serialized = JSON.stringify(result)
  expect(serialized).not.toContain('@example.com')
  expect(serialized).not.toContain('Private committee')
  expect(api.feedRequests).toEqual(expect.arrayContaining([
    expect.objectContaining({ method: 'GET', format: 'json' }),
    expect.objectContaining({ method: 'HEAD', format: 'ics' }),
  ]))
})
