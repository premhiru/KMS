import { describe, expect, it } from 'vitest'
import { createZip } from './zip'

describe('deliverables ZIP', () => {
  it('writes a valid store-only archive with named entries', async () => {
    const blob = createZip([{ name: 'speaker/slides.txt', bytes: new TextEncoder().encode('deck') }])
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect(new TextDecoder().decode(bytes)).toContain('speaker/slides.txt')
  })
})
