import { describe, expect, it } from 'vitest'
import type { CfpQuestion } from '../../domain'
import { validateCfpQuestions } from './CfpBuilder'
import { normalizeCfpFormats } from './cfp-formats'

describe('CFP question validation', () => {
  it('reports a select containing only empty comma-separated options', () => {
    const questions: CfpQuestion[] = [{ id: 'level', label: 'Level', type: 'select', required: true, options: ['', ' ', ''] }]
    expect(validateCfpQuestions(questions)).toEqual({ questionId: 'level', field: 'options', message: 'Add at least one option for “Level”.' })
  })

  it('accepts a select with at least one visible option', () => {
    const questions: CfpQuestion[] = [{ id: 'level', label: 'Level', type: 'select', required: true, options: ['', 'Advanced'] }]
    expect(validateCfpQuestions(questions)).toBeUndefined()
  })
})

describe('CFP format compatibility', () => {
  it('normalizes legacy string formats and validates duration values', () => {
    expect(normalizeCfpFormats(['Talk', { name: 'Workshop', durationMinutes: 60 }, { name: 'Panel', durationMinutes: 0 }, ' '])).toEqual([
      { name: 'Talk', durationMinutes: 30 },
      { name: 'Workshop', durationMinutes: 60 },
      { name: 'Panel', durationMinutes: 30 },
    ])
  })
})
