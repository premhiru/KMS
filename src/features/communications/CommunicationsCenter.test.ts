import { describe, expect, it, vi } from 'vitest'
import { checkEmailIntegration, parseReminderDateTime } from './CommunicationsCenter'

describe('communications workflow guards', () => {
  it('distinguishes configured, unconfigured, and failed provider checks', async () => {
    await expect(checkEmailIntegration({ getIntegrationStatus: vi.fn().mockResolvedValue({ configured: { resend: true } }) }, 'remote')).resolves.toBe('configured')
    await expect(checkEmailIntegration({ getIntegrationStatus: vi.fn().mockResolvedValue({ configured: { resend: false } }) }, 'remote')).resolves.toBe('not-configured')
    await expect(checkEmailIntegration({ getIntegrationStatus: vi.fn().mockRejectedValue(new Error('offline')) }, 'remote')).resolves.toBe('check-failed')
    await expect(checkEmailIntegration(undefined, 'local')).resolves.toBe('not-configured')
  })

  it('does not throw or invent a timestamp when first run is cleared or invalid', () => {
    expect(parseReminderDateTime('')).toBeUndefined()
    expect(parseReminderDateTime('not-a-date')).toBeUndefined()
    expect(parseReminderDateTime('2026-08-12T09:30')).toMatch(/^2026-08-12T/)
  })
})
