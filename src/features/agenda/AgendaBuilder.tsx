import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type RefObject } from 'react'
import { CalendarDays, Download, GripVertical, List, MapPin, Plus, Sparkles, TriangleAlert, UploadCloud, X } from 'lucide-react'
import { agendaToIcs, createId, createSpeaker, createSubmission, downloadCsv, downloadIcs, nowIso, selectSubmissionSpeakers, selectUnscheduledSubmissions, speakerName, useApp } from '../../core'
import { canPublishAgenda, conflictsForSession, findScheduleConflicts, type AppState, type Session, type Submission } from '../../domain'
import { agendaToAcceleventsCsv } from '../public-event/accelevents'
import './agenda.css'
import './agenda-improvements.css'

type AgendaView = 'list' | 'day' | 'week' | 'track' | 'room'

function trapDialogFocus(event: KeyboardEvent, dialog: HTMLElement | null) {
  if (event.key !== 'Tab' || !dialog) return
  const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
  const first = controls[0]
  const last = controls.at(-1)
  if (!first || !last) return
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
}

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

function localDay(value: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value))
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function localHour(value: string, timezone: string): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(new Date(value)))
}

function endFor(startAt: string, durationMinutes: number): string {
  return new Date(Date.parse(startAt) + durationMinutes * 60_000).toISOString()
}

function sessionSubmission(state: AppState, session: Session): Submission | undefined {
  return state.submissions.find((submission) => submission.id === session.submissionId)
}

export function AgendaBuilder() {
  const { state, dispatch, api, persistenceMode } = useApp()
  const [view, setView] = useState<AgendaView>('day')
  const [assigningId, setAssigningId] = useState<string>()
  const [room, setRoom] = useState(state.event.rooms[0] ?? '')
  const [startAt, setStartAt] = useState(state.event.startAt)
  const eventSlots = useMemo(() => makeSlots(state.event.startAt, state.event.endAt), [state.event.startAt, state.event.endAt])
  const eventDays = useMemo(() => [...new Set(eventSlots.map((slot) => localDay(slot, state.event.timezone)))], [eventSlots, state.event.timezone])
  const [selectedDay, setSelectedDay] = useState(eventDays[0] ?? '')
  const [notice, setNotice] = useState('')
  const [acceleventsConfigured, setAcceleventsConfigured] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [showProgramItem, setShowProgramItem] = useState(false)
  const [showIntegration, setShowIntegration] = useState(false)
  const assignmentOpen = Boolean(assigningId)
  const assignmentRoomRef = useRef<HTMLSelectElement>(null)
  const assignmentTriggerRef = useRef<HTMLElement | null>(null)
  const programOriginRef = useRef<HTMLSelectElement>(null)
  const programTriggerRef = useRef<HTMLElement | null>(null)
  const unscheduled = selectUnscheduledSubmissions(state)
  const conflicts = findScheduleConflicts(state)
  const firstHour = localHour(state.event.startAt, state.event.timezone)
  const lastHour = localHour(state.event.endAt, state.event.timezone)
  const slots = useMemo(() => eventSlots.filter((slot) => {
    const hour = localHour(slot, state.event.timezone)
    return hour >= firstHour && (lastHour <= firstHour || hour < lastHour)
  }), [eventSlots, firstHour, lastHour, state.event.timezone])
  const visibleSlots = slots.filter((slot) => localDay(slot, state.event.timezone) === selectedDay)
  const scheduled = [...state.sessions].sort((left, right) => left.startAt.localeCompare(right.startAt))

  useEffect(() => {
    if (!api || persistenceMode !== 'remote') return
    void api.getIntegrationStatus().then((status) => setAcceleventsConfigured(status.configured.accelevents)).catch(() => setAcceleventsConfigured(false))
  }, [api, persistenceMode])

  useEffect(() => {
    if (!assignmentOpen) return
    assignmentRoomRef.current?.focus()
    const handleDialogKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAssigningId(undefined)
      else trapDialogFocus(event, document.querySelector<HTMLElement>('[aria-label="Assign session"]'))
    }
    window.addEventListener('keydown', handleDialogKey)
    return () => { window.removeEventListener('keydown', handleDialogKey); assignmentTriggerRef.current?.focus() }
  }, [assignmentOpen])

  useEffect(() => {
    if (!showProgramItem) return
    programOriginRef.current?.focus()
    const handleDialogKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowProgramItem(false)
      else trapDialogFocus(event, document.querySelector<HTMLElement>('[aria-label="Add invited or manual session"]'))
    }
    window.addEventListener('keydown', handleDialogKey)
    return () => { window.removeEventListener('keydown', handleDialogKey); programTriggerRef.current?.focus() }
  }, [showProgramItem])

  const openAssignment = (submissionId: string, targetRoom: string, targetStart: string) => {
    assignmentTriggerRef.current = document.activeElement as HTMLElement | null
    setAssigningId(submissionId)
    setRoom(targetRoom)
    setStartAt(targetStart)
  }

  const openProgramItem = () => {
    programTriggerRef.current = document.activeElement as HTMLElement | null
    setShowProgramItem(true)
  }

  const syncAccelevents = async () => {
    if (!api) return
    setSyncing(true)
    if (state.event.accelevents) dispatch({ type: 'event/update', patch: { accelevents: { ...state.event.accelevents, lastStatus: 'running', lastError: undefined } }, at: nowIso() })
    try {
      const result = await api.syncAccelevents(`accelevents-${crypto.randomUUID()}`)
      setNotice(`Accelevents sync completed: ${result.synced?.sessions ?? 0} sessions and ${result.synced?.speakers ?? 0} speakers. Run ${result.runId}.`)
      if (state.event.accelevents) dispatch({ type: 'event/update', patch: { accelevents: { ...state.event.accelevents, lastStatus: 'succeeded', lastRunId: result.runId, lastSyncedAt: nowIso(), lastError: undefined } }, at: nowIso() })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Accelevents sync failed.')
      if (state.event.accelevents) dispatch({ type: 'event/update', patch: { accelevents: { ...state.event.accelevents, lastStatus: 'failed', lastError: error instanceof Error ? error.message : 'Sync failed.' } }, at: nowIso() })
    } finally {
      setSyncing(false)
    }
  }

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

  const conflictDescription = (conflict: (typeof conflicts)[number]) => {
    const first = state.sessions.find((session) => session.id === conflict.sessionId)
    const second = state.sessions.find((session) => session.id === conflict.otherSessionId)
    const titles = [first, second].map((session) => session && sessionSubmission(state, session)?.title).filter(Boolean)
    if (conflict.kind === 'speaker-overlap') {
      const names = (conflict.speakerIds ?? []).map((id) => state.speakers.find((speaker) => speaker.id === id)).filter(Boolean).map((speaker) => speakerName(speaker!))
      return `${names.join(', ') || 'A speaker'} is double-booked${titles.length ? ` across “${titles.join('” and “')}”` : ''}.`
    }
    if (conflict.kind === 'room-overlap' && titles.length > 1) return `${conflict.message} Clashing sessions: “${titles.join('” and “')}”.`
    return conflict.message
  }

  const renderSession = (session: Session) => {
    const submission = sessionSubmission(state, session)
    if (!submission) return null
    return <article draggable onDragStart={(event) => event.dataTransfer.setData('text/openspeaker-submission', submission.id)} className={`agenda-session ${conflicts.some((conflict) => conflict.sessionId === session.id || conflict.otherSessionId === session.id) ? 'has-conflict' : ''}`} key={session.id}>
      <div><span>{submission.track}</span><strong>{submission.title}</strong><small>{selectSubmissionSpeakers(state, submission.id).map(speakerName).join(', ')}</small></div>
      <p><MapPin size={14}/>{session.room}<CalendarDays size={14}/>{formatDateTime(session.startAt, state.event.timezone)}–{formatTime(session.endAt, state.event.timezone)}</p>
      <div className="agenda-session-actions"><button onClick={() => openAssignment(submission.id, session.room, session.startAt)}>Move</button><button onClick={() => dispatch({ type: 'session/delete', id: session.id, at: nowIso() })}>Unschedule</button></div>
    </article>
  }

  return <section className="agenda-feature">
    <header className="feature-heading"><div><p>PROGRAM OPERATIONS</p><h1>Agenda builder</h1><span>Assign accepted sessions, detect conflicts, and publish a trustworthy schedule.</span></div><div className="feature-actions">
      <button className="feature-button secondary" onClick={autoSchedule}><Sparkles size={16}/>Auto-schedule</button>
      <button className="feature-button secondary" onClick={openProgramItem}><Plus size={16}/>Add program item</button>
      <button className="feature-button secondary" onClick={() => downloadIcs(`${state.event.slug}.ics`, agendaToIcs(state, false))}><Download size={16}/>ICS</button>
      <button className="feature-button secondary" title="One-way CSV export; API sync requires Accelevents credentials." onClick={() => downloadCsv(`${state.event.slug}-accelevents.csv`, agendaToAcceleventsCsv(state))}><Download size={16}/>Accelevents-ready CSV</button>
      {persistenceMode === 'remote' && <button className="feature-button secondary" disabled={!acceleventsConfigured || syncing} title={acceleventsConfigured ? 'Sync accepted, published sessions and confirmed speakers one way.' : 'Configure ACCELEVENTS_API_KEY and ACCELEVENTS_EVENT_URL.'} onClick={syncAccelevents}><UploadCloud size={16}/>{syncing ? 'Syncing…' : 'Sync Accelevents'}</button>}
      <button className="feature-button secondary" aria-expanded={showIntegration} aria-controls="accelevents-mapping" onClick={() => setShowIntegration((open) => !open)}>Mapping</button>
      <button className="feature-button primary" disabled={conflicts.length > 0 || state.sessions.length === 0} onClick={publish}><UploadCloud size={16}/>Publish agenda</button>
    </div></header>

    {notice && <div className="feature-notice" role="status">{notice}<button aria-label="Dismiss notice" onClick={() => setNotice('')}><X size={14}/></button></div>}
    {showIntegration && <AcceleventsMappingPanel />}
    <div className="agenda-toolbar"><div className="view-switch" aria-label="Agenda view">{(['list', 'day', 'week', 'track', 'room'] as const).map((item) => <button className={view === item ? 'active' : ''} key={item} onClick={() => setView(item)}>{item}</button>)}</div><span>{state.sessions.length} scheduled · {unscheduled.length} unscheduled · {conflicts.length} conflicts</span></div>

    {conflicts.length > 0 && <aside className="conflict-panel" aria-label="Schedule conflicts"><h2><TriangleAlert size={18}/>Conflicts to resolve</h2>{conflicts.map((conflict, index) => <p key={`${conflict.kind}-${conflict.sessionId}-${index}`}><b>{conflict.kind.replaceAll('-', ' ')}</b>{conflictDescription(conflict)}</p>)}</aside>}

    <div className="agenda-workspace">
      <aside className="agenda-queue"><h2>Accepted & unscheduled <span>{unscheduled.length}</span></h2><p>Drag onto the day grid or use Assign.</p>{unscheduled.length === 0 && <div className="empty-state">Everything accepted is on the agenda.</div>}{unscheduled.map((submission) => <article key={submission.id} draggable onDragStart={(event) => event.dataTransfer.setData('text/openspeaker-submission', submission.id)}>
        <GripVertical size={17}/><div><strong>{submission.title}</strong><small>{submission.track} · {submission.durationMinutes} min</small><button onClick={() => openAssignment(submission.id, state.event.rooms[0] ?? '', slots[0] ?? state.event.startAt)}>Assign time and room</button></div>
      </article>)}</aside>

      <div className="agenda-board">
        {view === 'day' && <><div className="agenda-day-picker" aria-label="Agenda day">{eventDays.map((day) => <button className={selectedDay === day ? 'active' : ''} key={day} onClick={() => setSelectedDay(day)}>{new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</button>)}</div><div className="day-grid"><div className="day-grid-head"><span>Time</span>{state.event.rooms.map((item) => <strong key={item}>{item}</strong>)}</div>{visibleSlots.map((slot) => <div className="day-grid-row" key={slot}><time>{formatTime(slot, state.event.timezone)}</time>{state.event.rooms.map((item) => <div className="drop-slot" key={item} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, item, slot)}>{scheduled.filter((session) => session.room === item && session.startAt === slot).map(renderSession)}</div>)}</div>)}</div></>}
        {view === 'week' && <div className="agenda-groups agenda-week">{eventDays.map((day) => <section key={day}><h2>{new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</h2>{scheduled.filter((session) => localDay(session.startAt, state.event.timezone) === day).map(renderSession)}{scheduled.every((session) => localDay(session.startAt, state.event.timezone) !== day) && <div className="empty-state">No sessions scheduled.</div>}</section>)}</div>}
        {view === 'list' && <div className="agenda-list"><h2><List size={18}/>All scheduled sessions</h2>{scheduled.map(renderSession)}</div>}
        {view === 'track' && <div className="agenda-groups">{state.event.tracks.map((track) => { const items = scheduled.filter((session) => sessionSubmission(state, session)?.track === track); return items.length > 0 && <section key={track}><h2>{track}</h2>{items.map(renderSession)}</section> })}</div>}
        {view === 'room' && <div className="agenda-groups">{state.event.rooms.map((item) => <section key={item}><h2>{item}</h2>{scheduled.filter((session) => session.room === item).map(renderSession)}</section>)}</div>}
      </div>
    </div>

    {assigningId && <div className="assignment-panel" role="dialog" aria-modal="true" aria-label="Assign session"><form onSubmit={(event) => { event.preventDefault(); assign(assigningId, room, startAt) }}><button type="button" className="panel-close" aria-label="Close assignment" onClick={() => setAssigningId(undefined)}><X/></button><h2>Assign session</h2><p>{state.submissions.find((submission) => submission.id === assigningId)?.title}</p><label>Room<select ref={assignmentRoomRef} value={room} onChange={(event) => setRoom(event.target.value)}>{state.event.rooms.map((item) => <option key={item}>{item}</option>)}</select></label><label>Start time<select value={startAt} onChange={(event) => setStartAt(event.target.value)}>{slots.map((slot) => <option value={slot} key={slot}>{formatDateTime(slot, state.event.timezone)}</option>)}</select></label><button className="feature-button primary" type="submit">Save assignment</button></form></div>}
    {showProgramItem && <ProgramItemForm originRef={programOriginRef} onClose={() => setShowProgramItem(false)} />}
  </section>
}

function ProgramItemForm({ onClose, originRef }: { onClose: () => void; originRef: RefObject<HTMLSelectElement | null> }) {
  const { state, dispatch } = useApp()
  const [origin, setOrigin] = useState<'invited' | 'manual'>('invited')
  const [title, setTitle] = useState('')
  const [abstract, setAbstract] = useState('')
  const [track, setTrack] = useState(state.event.tracks[0] ?? 'General')
  const [format, setFormat] = useState('Talk')
  const [duration, setDuration] = useState('30')
  const [participantName, setParticipantName] = useState('')
  const [participantEmail, setParticipantEmail] = useState('')
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const at = nowIso()
    let speakerIds: string[] = []
    if (origin === 'invited') {
      const existing = state.speakers.find((speaker) => speaker.email.toLowerCase() === participantEmail.trim().toLowerCase())
      const names = participantName.trim().split(/\s+/)
      const speaker = existing ?? createSpeaker({ firstName: names[0] ?? '', lastName: names.slice(1).join(' '), email: participantEmail, status: 'invited' }, at)
      if (!existing) dispatch({ type: 'speaker/create', speaker, at })
      speakerIds = [speaker.id]
    }
    const created = createSubmission({ title, abstract, track, format, durationMinutes: Number(duration), speakerIds, status: 'accepted', tags: [] }, at)
    dispatch({ type: 'submission/create', submission: { ...created, origin, invitedAt: origin === 'invited' ? at : undefined }, at })
    onClose()
  }
  return <div className="assignment-panel" role="dialog" aria-modal="true" aria-label="Add invited or manual session"><form onSubmit={submit}><button type="button" className="panel-close" aria-label="Close" onClick={onClose}><X/></button><h2>Add program item</h2><p>Invited sessions create a speaker invitation. Manual items are schedule content without a portal participant.</p><label>Origin<select ref={originRef} value={origin} onChange={(event) => setOrigin(event.target.value as 'invited' | 'manual')}><option value="invited">Invited speaker session</option><option value="manual">Manual program item</option></select></label><label>Title<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Description<textarea required rows={3} value={abstract} onChange={(event) => setAbstract(event.target.value)} /></label><label>Track<select value={track} onChange={(event) => setTrack(event.target.value)}>{state.event.tracks.map((item) => <option key={item}>{item}</option>)}</select></label><label>Format<input required value={format} onChange={(event) => setFormat(event.target.value)} /></label><label>Minutes<input required min="5" type="number" value={duration} onChange={(event) => setDuration(event.target.value)} /></label>{origin === 'invited' && <><label>Speaker name<input required value={participantName} onChange={(event) => setParticipantName(event.target.value)} /></label><label>Speaker email<input required type="email" value={participantEmail} onChange={(event) => setParticipantEmail(event.target.value)} /></label></>}<button className="feature-button primary" type="submit">Create accepted item</button></form></div>
}

function AcceleventsMappingPanel() {
  const { state, dispatch, persistenceMode } = useApp()
  const config = state.event.accelevents
  if (!config) return null
  const fields = config.destinationFields ?? { title: 'Session Name', description: 'Description', track: 'Track', type: 'Type', location: 'Location', speakers: 'Speakers' }
  const setConfig = (patch: Partial<typeof config>) => dispatch({ type: 'event/update', patch: { accelevents: { ...config, ...patch } }, at: nowIso() })
  const setField = (key: keyof typeof fields, value: string) => setConfig({ destinationFields: { ...fields, [key]: value } })
  return <section id="accelevents-mapping" className="integration-mapping"><div><h2>Accelevents mapping and status</h2><p>Mappings drive the downloadable CSV. {persistenceMode === 'remote' ? 'Native sync uses the server integration contract.' : 'Native sync requires deployed provider credentials.'}</p></div><div className="mapping-grid">{(Object.keys(fields) as Array<keyof typeof fields>).map((key) => <label key={key}>{key}<input value={fields[key]} onChange={(event) => setField(key, event.target.value)} /></label>)}</div><div className="mapping-flags"><label><input type="checkbox" checked={config.includeOnlyPublishedSessions} onChange={(event) => setConfig({ includeOnlyPublishedSessions: event.target.checked })} />Published sessions only</label><label><input type="checkbox" checked={config.includeOnlyConfirmedSpeakers} onChange={(event) => setConfig({ includeOnlyConfirmedSpeakers: event.target.checked })} />Confirmed speakers only</label></div><p className={`integration-status integration-status--${config.lastStatus ?? 'idle'}`}><strong>{config.lastStatus ?? 'idle'}</strong>{config.lastSyncedAt ? ` · ${new Date(config.lastSyncedAt).toLocaleString()}` : ' · no live sync recorded'}{config.lastRunId ? ` · run ${config.lastRunId}` : ''}{config.lastError ? ` · ${config.lastError}` : ''}</p></section>
}
