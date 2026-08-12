import { describe, expect, it } from 'vitest'
import type { CfpQuestion } from '../../domain'
import { validateCfpQuestions } from './CfpBuilder'

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
