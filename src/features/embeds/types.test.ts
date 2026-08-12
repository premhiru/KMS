import { describe, expect, it } from 'vitest'
import { buildEmbedUrl, embedCode, loadEmbeds, saveEmbeds, type EmbedDefinition } from './types'

const definition: EmbedDefinition = { id: 'embed-1', name: 'Main sessions', type: 'sessions', format: 'styled-html', enabled: true, accentColor: '#00ff00', backgroundColor: '#ffffff', customCss: '', track: 'AI', visibleFields: ['track', 'format'], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }

describe('embed definitions', () => {
  it('builds a live widget URL and safe iframe snippet', () => {
    const url = buildEmbedUrl('https://event.example/app', definition)
    expect(url).toContain('track=AI')
    expect(url).toContain('#/event/sessions')
    expect(embedCode('https://event.example/app', 'Summit', definition)).toContain('<iframe')
  })

  it('round-trips browser-local definitions', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    saveEmbeds(storage, 'event-1', [definition])
    expect(loadEmbeds(storage, 'event-1')).toEqual([definition])
  })
})
