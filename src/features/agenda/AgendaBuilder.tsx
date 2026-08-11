import { useMemo, useState, type DragEvent } from 'react'
import { CalendarDays, Download, GripVertical, List, MapPin, Sparkles, TriangleAlert, UploadCloud, X } from 'lucide-react'
import { agendaToIcs, createId, downloadCsv, downloadIcs, nowIso, selectSubmissionSpeakers, selectUnscheduledSubmissions, speakerName, useApp } from '../../core'
import { canPublishAgenda, conflictsForSession, findScheduleConflicts, type AppState, type Session, type Submission } from '../../domain'
import { agendaToAcceleventsCsv } from '../public-event/accelevents'
import './agenda.css'

type AgendaView = 'list' | 'day' | 'track' | 'room'

function formatTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function formatDateTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function makeSlots(startAt: string, endAt: string, stepMinutes = 30): string[] {
  const slots: string[] = []
  for (let time = Date.parse(startAt); time < Date.parse(endAt); time += stepMinutes * 60_000) slots.push(new Date(time).toISOString())
  return slots
}

function endFor(startAt: string, durationMinutes: number): string {
  return new Date(Date.parse(startAt) + durationMinutes * 60_000).toISOString()
}

function sessionSubmission(state: AppState, session: Session): Submission | undefined {
  return state.submissions.find((submission) => submission.id === session.submissionId)
}

export function AgendaBuilder() {
  const { state, dispatch } = useApp()
  const [view, setView] = useState<AgendaView>('day')
  const [assigningId, setAssigningId] = useState<string>()
  const [room, setRoom] = useState(state.event.rooms[0] ?? '')
  const [startAt, setStartAt] = useState(state.event.startAt)
  const [notice, setNotice] = useState('')
  const unscheduled = selectUnscheduledSubmissions(state)
  const conflicts = findScheduleConflicts(state)
  const slots = useMemo(() => makeSlots(state.event.startAt, state.event.endAt), [state.event.startAt, state.event.endAt])
  const visibleSlots = slots.slice(0, 18)
  const scheduled = [...state.sessions].sort((left, right) => left.startAt.localeCompare(right.startAt))

  const assign = (submissionId: string, targetRoom: string, targetStart: string) => {
    const submission = state.submissions.find((item) => item.id === submissionId)
    if (!submission) return
    const existing = state.sessions.find((session) => session.submissionId === submissionId)
    const at = nowIso()
    const session: Session = {
      id: existing?.id ?? createId('session'),
      submissionId,
      room: targetRoom,
      startAt: targetStart,
      endAt: endFor(targetStart, submission.durationMinutes),
      published: false,
      updatedAt: at,
    }
    dispatch({ type: 'session/upsert', session, at })
    setAssigningId(undefined)
    setNotice(conflictsForSession(session, state).length > 0 ? 'Session scheduled with a conflict to resolve.' : 'Session scheduled.')
  }

  const handleDrop = (event: DragEvent, targetRoom: string, targetStart: string) => {
    event.preventDefault()
    const submissionId = event.dataTransfer.getData('text/openspeaker-submission')
    if (submissionId) assign(submissionId, targetRoom, targetStart)
  }

  const autoSchedule = () => {
    let draft = state
    let count = 0
    for (const submission of selectUnscheduledSubmissions(draft)) {
      let selected: Session | undefined
      for (const candidateStart of slots) {
        if (selected) break
        for (const candidateRoom of state.event.rooms) {
          const candidate: Session = {
            id: createId('session'), submissionId: submission.id, room: candidateRoom,
            startAt: candidateStart, endAt: endFor(candidateStart, submission.durationMinutes), published: false, updatedAt: nowIso(),
          }
          if (conflictsForSession(candidate, draft).length === 0) {
            selected = candidate
            break
          }
        }
      }
      if (selected) {
        dispatch({ type: 'session/upsert', session: selected, at: selected.updatedAt })
        draft = { ...draft, sessions: [...draft.sessions, selected] }
        count += 1
      }
    }
    setNotice(count > 0 ? `Auto-scheduled ${count} session${count === 1 ? '' : 's'}.` : 'No conflict-free unscheduled sessions were found.')
  }

  const publish = () => {
    if (!canPublishAgenda(state)) {
      setNotice('Resolve every conflict before publishing the agenda.')
      return
    }
    const at = nowIso()
    dispatch({ type: 'agenda/publish', published: true, at })
    setNotice('Agenda published to the public event page.')
  }

  const renderSession = (session: Session) => {
    const submission = sessionSubmission(state, session)
    if (!submission) return null
    return <article className={`agenda-session ${conflicts.some((conflict) => conflict.sessionId === session.id || conflict.otherSessionId === session.id) ? 'has-conflict' : ''}`} key={session.id}>
      <div><span>{submission.track}</span><strong>{submission.title}</strong><small>{selectSubmissionSpeakers(state, submission.id).map(speakerName).join(', ')}</small></div>
      <p><MapPin size={14}/>{session.room}<CalendarDays size={14}/>{formatDateTime(session.startAt, state.event.timezone)}–{formatTime(session.endAt, state.event.timezone)}</p>
      <div className="agenda-session-actions"><button onClick={() => { setAssigningId(submission.id); setRoom(session.room); setStartAt(session.startAt) }}>Move</button><button onClick={() => dispatch({ type: 'session/delete', id: session.id, at: nowIso() })}>Unschedule</button></div>
    </article>
  }

  return <section className="agenda-feature">
    <header className="feature-heading"><div><p>PROGRAM OPERATIONS</p><h1>Agenda builder</h1><span>Assign accepted sessions, detect conflicts, and publish a trustworthy schedule.</span></div><div className="feature-actions">
      <button className="feature-button secondary" onClick={autoSchedule}><Sparkles size={16}/>Auto-schedule</button>
      <button className="feature-button secondary" onClick={() => downloadIcs(`${state.event.slug}.ics`, agendaToIcs(state, false))}><Download size={16}/>ICS</button>
      <button className="feature-button secondary" title="One-way CSV export; API sync requires Accelevents credentials." onClick={() => downloadCsv(`${state.event.slug}-accelevents.csv`, agendaToAcceleventsCsv(state))}><Download size={16}/>Accelevents-ready CSV</button>
      <button className="feature-button primary" disabled={conflicts.length > 0 || state.sessions.length === 0} onClick={publish}><UploadCloud size={16}/>Publish agenda</button>
    </div></header>

    {notice && <div className="feature-notice" role="status">{notice}<button aria-label="Dismiss notice" onClick={() => setNotice('')}><X size={14}/></button></div>}
    <div className="agenda-toolbar"><div className="view-switch" aria-label="Agenda view">{(['list', 'day', 'track', 'room'] as const).map((item) => <button className={view === item ? 'active' : ''} key={item} onClick={() => setView(item)}>{item}</button>)}</div><span>{state.sessions.length} scheduled · {unscheduled.length} unscheduled · {conflicts.length} conflicts</span></div>

    {conflicts.length > 0 && <aside className="conflict-panel" aria-label="Schedule conflicts"><h2><TriangleAlert size={18}/>Conflicts to resolve</h2>{conflicts.map((conflict, index) => <p key={`${conflict.kind}-${conflict.sessionId}-${index}`}><b>{conflict.kind.replaceAll('-', ' ')}</b>{conflict.message}</p>)}</aside>}

    <div className="agenda-workspace">
      <aside className="agenda-queue"><h2>Accepted & unscheduled <span>{unscheduled.length}</span></h2><p>Drag onto the day grid or use Assign.</p>{unscheduled.length === 0 && <div className="empty-state">Everything accepted is on the agenda.</div>}{unscheduled.map((submission) => <article key={submission.id} draggable onDragStart={(event) => event.dataTransfer.setData('text/openspeaker-submission', submission.id)}>
        <GripVertical size={17}/><div><strong>{submission.title}</strong><small>{submission.track} · {submission.durationMinutes} min</small><button onClick={() => { setAssigningId(submission.id); setRoom(state.event.rooms[0] ?? ''); setStartAt(slots[0] ?? state.event.startAt) }}>Assign time and room</button></div>
      </article>)}</aside>

      <div className="agenda-board">
        {view === 'day' && <div className="day-grid"><div className="day-grid-head"><span>Time</span>{state.event.rooms.map((item) => <strong key={item}>{item}</strong>)}</div>{visibleSlots.map((slot) => <div className="day-grid-row" key={slot}><time>{formatTime(slot, state.event.timezone)}</time>{state.event.rooms.map((item) => <div className="drop-slot" key={item} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, item, slot)}>{scheduled.filter((session) => session.room === item && session.startAt === slot).map(renderSession)}</div>)}</div>)}</div>}
        {view === 'list' && <div className="agenda-list"><h2><List size={18}/>All scheduled sessions</h2>{scheduled.map(renderSession)}</div>}
        {view === 'track' && <div className="agenda-groups">{state.event.tracks.map((track) => { const items = scheduled.filter((session) => sessionSubmission(state, session)?.track === track); return items.length > 0 && <section key={track}><h2>{track}</h2>{items.map(renderSession)}</section> })}</div>}
        {view === 'room' && <div className="agenda-groups">{state.event.rooms.map((item) => <section key={item}><h2>{item}</h2>{scheduled.filter((session) => session.room === item).map(renderSession)}</section>)}</div>}
      </div>
    </div>

    {assigningId && <div className="assignment-panel" role="dialog" aria-modal="true" aria-label="Assign session"><form onSubmit={(event) => { event.preventDefault(); assign(assigningId, room, startAt) }}><button type="button" className="panel-close" aria-label="Close assignment" onClick={() => setAssigningId(undefined)}><X/></button><h2>Assign session</h2><p>{state.submissions.find((submission) => submission.id === assigningId)?.title}</p><label>Room<select value={room} onChange={(event) => setRoom(event.target.value)}>{state.event.rooms.map((item) => <option key={item}>{item}</option>)}</select></label><label>Start time<select value={startAt} onChange={(event) => setStartAt(event.target.value)}>{slots.map((slot) => <option value={slot} key={slot}>{formatDateTime(slot, state.event.timezone)}</option>)}</select></label><button className="feature-button primary" type="submit">Save assignment</button></form></div>}
  </section>
}
