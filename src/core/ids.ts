import type { Id } from '../domain/types'

export function createId(prefix = 'id'): Id {
  const cryptoApi = globalThis.crypto
  const suffix = cryptoApi && 'randomUUID' in cryptoApi
    ? cryptoApi.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}-${suffix}`
}

export function nowIso(): string {
  return new Date().toISOString()
}
