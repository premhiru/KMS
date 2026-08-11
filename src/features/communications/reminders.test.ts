import { describe, expect, it } from 'vitest'
import type { ReminderSchedule } from '../../domain'
import { dueReminderSchedules, nextReminderRun } from './reminders'

const schedule: ReminderSchedule = { id: 'reminder-1', name: 'Reminder', templateId: 'template-1', audience: 'overdue-tasks', enabled: true, cadence: 'daily', nextRunAt: '2026-08-10T16:00:00.000Z', timezone: 'UTC', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }

describe('reminder schedules', () => {
  it('advances recurring reminders deterministically', () => expect(nextReminderRun(schedule, '2026-08-12T12:00:00.000Z')).toBe('2026-08-12T16:00:00.000Z'))
  it('returns only enabled schedules due by the supplied instant', () => expect(dueReminderSchedules([schedule, { ...schedule, id: 'disabled', enabled: false }], '2026-08-11T00:00:00.000Z')).toEqual([schedule]))
})
