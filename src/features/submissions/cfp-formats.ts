export interface NormalizedCfpFormat {
  name: string
  durationMinutes: number
}

const DEFAULT_DURATION_MINUTES = 30

/** Keeps older persisted CFPs with string-only formats usable after schema upgrades. */
export function normalizeCfpFormats(value: unknown): NormalizedCfpFormat[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (typeof item === 'string') {
      const name = item.trim()
      return name ? [{ name, durationMinutes: DEFAULT_DURATION_MINUTES }] : []
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []

    const candidate = item as Record<string, unknown>
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
    if (!name) return []
    const duration = Number(candidate.durationMinutes)
    return [{
      name,
      durationMinutes: Number.isFinite(duration) && duration >= 5 && duration <= 240
        ? duration
        : DEFAULT_DURATION_MINUTES,
    }]
  })
}
