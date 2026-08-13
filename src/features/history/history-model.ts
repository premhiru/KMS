import type { AppState } from '../../domain'

export interface RevisionSummary {
  speakers: number
  submissions: number
  acceptedSubmissions: number
  sessions: number
  publishedSessions: number
  tasks: number
  completedTasks: number
  resources: number
  messages: number
}

export interface RevisionChange {
  key: string
  label: string
  before: string
  after: string
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function countLabel(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`
}

function changedSubmissionLabel(from: AppState, to: AppState, side: 'from' | 'to'): string | undefined {
  const changed = from.submissions.flatMap((previous) => {
    const current = to.submissions.find((item) => item.id === previous.id)
    if (!current || same(previous, current)) return []
    const item = side === 'from' ? previous : current
    return [`Title: ${item.title} · Abstract: ${item.abstract}`]
  })
  if (changed.length === 1) return changed[0]
  if (changed.length > 1) return `${changed.length} submission records changed`
  return undefined
}

export function summarizeRevision(state: AppState): RevisionSummary {
  return {
    speakers: state.speakers.length,
    submissions: state.submissions.length,
    acceptedSubmissions: state.submissions.filter((item) => item.status === 'accepted').length,
    sessions: state.sessions.length,
    publishedSessions: state.sessions.filter((item) => item.published).length,
    tasks: state.tasks.length,
    completedTasks: state.tasks.filter((item) => item.completedAt).length,
    resources: state.event.resources?.length ?? 0,
    messages: state.communicationLog.length,
  }
}

export function revisionChanges(from: AppState, to: AppState): RevisionChange[] {
  const fromSummary = summarizeRevision(from)
  const toSummary = summarizeRevision(to)
  const candidates: Array<RevisionChange & { changed: boolean }> = [
    {
      key: 'event', label: 'Event details',
      before: from.event.name, after: to.event.name,
      changed: !same(
        { name: from.event.name, description: from.event.description, venue: from.event.venue, timezone: from.event.timezone, startAt: from.event.startAt, endAt: from.event.endAt },
        { name: to.event.name, description: to.event.description, venue: to.event.venue, timezone: to.event.timezone, startAt: to.event.startAt, endAt: to.event.endAt },
      ),
    },
    {
      key: 'cfp', label: 'Call for proposals',
      before: from.event.cfp?.open ? 'Open' : 'Closed', after: to.event.cfp?.open ? 'Open' : 'Closed',
      changed: !same(from.event.cfp, to.event.cfp),
    },
    {
      key: 'speakers', label: 'Speakers',
      before: countLabel(fromSummary.speakers, 'speaker'), after: countLabel(toSummary.speakers, 'speaker'),
      changed: !same(from.speakers, to.speakers),
    },
    {
      key: 'submissions', label: 'Submissions and decisions',
      before: changedSubmissionLabel(from, to, 'from') ?? `${countLabel(fromSummary.submissions, 'submission')} · ${fromSummary.acceptedSubmissions} accepted`,
      after: changedSubmissionLabel(from, to, 'to') ?? `${countLabel(toSummary.submissions, 'submission')} · ${toSummary.acceptedSubmissions} accepted`,
      changed: !same(from.submissions, to.submissions),
    },
    {
      key: 'reviews', label: 'Review workflow',
      before: countLabel(from.reviews.length, 'review'), after: countLabel(to.reviews.length, 'review'),
      changed: !same(
        [from.reviews, from.evaluationPlans, from.evaluationRounds, from.evaluationAssignments, from.evaluationAdvancements],
        [to.reviews, to.evaluationPlans, to.evaluationRounds, to.evaluationAssignments, to.evaluationAdvancements],
      ),
    },
    {
      key: 'agenda', label: 'Agenda and sessions',
      before: `${countLabel(fromSummary.sessions, 'session')} · ${fromSummary.publishedSessions} published`,
      after: `${countLabel(toSummary.sessions, 'session')} · ${toSummary.publishedSessions} published`,
      changed: !same(
        [from.sessions, from.event.rooms, from.event.tracks, from.event.agendaPublishedAt],
        [to.sessions, to.event.rooms, to.event.tracks, to.event.agendaPublishedAt],
      ),
    },
    {
      key: 'deliverables', label: 'Speaker deliverables',
      before: `${countLabel(fromSummary.tasks, 'task')} · ${fromSummary.completedTasks} complete`,
      after: `${countLabel(toSummary.tasks, 'task')} · ${toSummary.completedTasks} complete`,
      changed: !same(from.tasks, to.tasks),
    },
    {
      key: 'resources', label: 'Speaker wiki and files',
      before: countLabel(fromSummary.resources, 'resource'), after: countLabel(toSummary.resources, 'resource'),
      changed: !same(from.event.resources, to.event.resources),
    },
    {
      key: 'communications', label: 'Communications',
      before: countLabel(fromSummary.messages, 'message'), after: countLabel(toSummary.messages, 'message'),
      changed: !same(
        [from.templates, from.communicationLog, from.event.reminderSchedules],
        [to.templates, to.communicationLog, to.event.reminderSchedules],
      ),
    },
    {
      key: 'publishing', label: 'Public program and embeds',
      before: from.event.agendaPublishedAt ? 'Program published' : 'Program not published',
      after: to.event.agendaPublishedAt ? 'Program published' : 'Program not published',
      changed: !same([from.event.publicProgram, from.event.embeds], [to.event.publicProgram, to.event.embeds]),
    },
  ]
  return candidates.filter((item) => item.changed).map(({ changed: _changed, ...item }) => item)
}

export function historyReasonLabel(reason: string): string {
  if (!reason) return 'Saved change'
  if (reason === 'organizer write') return 'Organizer saved event content'
  if (reason === 'event created') return 'Event created'
  if (reason === 'pre-migration snapshot') return 'Imported historical snapshot'
  const rollback = reason.match(/^rollback:(\d+):(.*)$/)
  if (rollback) return `Restored revision ${rollback[1]}${rollback[2] ? ` — ${rollback[2]}` : ''}`
  return reason.charAt(0).toUpperCase() + reason.slice(1)
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}
