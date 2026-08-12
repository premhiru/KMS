import { describe, expect, it } from 'vitest'
import { parseSpeakerCsv } from './speaker-import'

describe('speaker CSV import', () => {
  it('maps a full-name fixture and required fields', () => {
    const result = parseSpeakerCsv('name,email,title,company,bio\nPriya Shah,priya@example.com,CTO,Acme,Builder')
    expect(result.errors).toEqual([])
    expect(result.speakers[0]).toMatchObject({ firstName: 'Priya', lastName: 'Shah', email: 'priya@example.com', jobTitle: 'CTO', company: 'Acme' })
  })
})
