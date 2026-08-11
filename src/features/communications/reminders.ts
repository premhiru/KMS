import type { ISODateTime, ReminderSchedule } from '../../domain'

export function nextReminderRun(schedule: Pick<ReminderSchedule, 'cadence' | 'sendAt' | 'nextRunAt'>, after: ISODateTime): ISODateTime | undefined {
  const base = schedule.nextRunAt ?? schedule.sendAt
  if (!base) return undefined
  let value = Date.parse(base)
  const afterTime = Date.parse(after)
  if (!Number.isFinite(value) || !Number.isFinite(afterTime)) return undefined
  if (schedule.cadence === 'once') return value >= afterTime ? new Date(value).toISOString() : undefined
  const step = schedule.cadence === 'daily' ? 86_400_000 : 7 * 86_400_000
  while (value < afterTime) value += step
  return new Date(value).toISOString()
}

export function dueReminderSchedules(schedules: ReminderSchedule[], at: ISODateTime): ReminderSchedule[] {
  const time = Date.parse(at)
  return schedules.filter((schedule) => schedule.enabled && schedule.nextRunAt && Date.parse(schedule.nextRunAt) <= time)
}
