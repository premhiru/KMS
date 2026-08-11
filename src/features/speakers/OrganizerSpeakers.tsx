import { useMemo, useState, type FormEvent } from 'react'
import { createId, nowIso, selectOnboardingPercent, selectTasksForSpeaker, speakerName, useAppDispatch, useAppState } from '../../core'
import type { OnboardingTask, Speaker, SpeakerStatus } from '../../domain'
import './OrganizerSpeakers.css'

const statusLabels: Record<SpeakerStatus, string> = {
  invited: 'Awaiting response',
  confirmed: 'Confirmed',
  declined: 'Declined',
}

function initials(speaker: Speaker): string {
  return `${speaker.firstName[0] ?? ''}${speaker.lastName[0] ?? ''}`.toUpperCase()
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function TaskList({ speaker, tasks, announce }: { speaker: Speaker; tasks: OnboardingTask[]; announce: (message: string) => void }) {
  const dispatch = useAppDispatch()
  const toggleTask = (task: OnboardingTask, completed: boolean) => {
    const at = nowIso()
    dispatch({ type: 'task/toggle', id: task.id, completed, at })
    announce(`${task.title} ${completed ? 'completed' : 'reopened'} for ${speakerName(speaker)}.`)
  }

  if (tasks.length === 0) return <p className="spk-empty">No onboarding tasks have been assigned yet.</p>

  return (
    <ul className="spk-task-list" aria-label={`Onboarding tasks for ${speakerName(speaker)}`}>
      {tasks.map((task) => (
        <li key={task.id} className={task.completedAt ? 'is-complete' : ''}>
          <label>
            <input
              type="checkbox"
              checked={Boolean(task.completedAt)}
              onChange={(event) => toggleTask(task, event.target.checked)}
            />
            <span>
              <strong>{task.title}</strong>
              <small>
                {task.completedAt ? `Completed ${formatDate(task.completedAt)}` : `Due ${formatDate(task.dueAt)}`}
                {task.asset ? ` · ${task.asset.name}` : ''}
              </small>
            </span>
          </label>
        </li>
      ))}
    </ul>
  )
}

function SpeakerEditor({ speaker, announce }: { speaker: Speaker; announce: (message: string) => void }) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const tasks = selectTasksForSpeaker(state, speaker.id)
  const completion = selectOnboardingPercent(state, speaker.id)
  const [form, setForm] = useState({
    firstName: speaker.firstName,
    lastName: speaker.lastName,
    email: speaker.email,
    company: speaker.company,
    jobTitle: speaker.jobTitle,
    pronouns: speaker.pronouns ?? '',
    bio: speaker.bio,
    status: speaker.status,
  })
  const [documentRequest, setDocumentRequest] = useState({ title: '', dueAt: '' })

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const at = nowIso()
    dispatch({
      type: 'speaker/update',
      id: speaker.id,
      patch: {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        company: form.company.trim(),
        jobTitle: form.jobTitle.trim(),
        pronouns: form.pronouns.trim() || undefined,
        bio: form.bio.trim(),
        status: form.status,
      },
      at,
    })
    announce(`Saved ${form.firstName.trim()} ${form.lastName.trim()}.`)
  }

  const sendReminder = () => {
    const incompleteTasks = tasks.filter((task) => !task.completedAt)
    const at = nowIso()
    dispatch({
      type: 'communication/log',
      entry: {
        id: createId('communication'),
        recipientSpeakerIds: [speaker.id],
        subject: `Your ${state.event.name} onboarding checklist`,
        body: incompleteTasks.length > 0
          ? `Hi ${speaker.firstName},\n\nPlease complete: ${incompleteTasks.map((task) => task.title).join(', ')}.`
          : `Hi ${speaker.firstName},\n\nYour onboarding checklist is complete. Thank you!`,
        channel: 'in-app-outbox',
        status: 'sent',
        sentAt: at,
      },
      at,
    })
    announce(`Reminder recorded in the outbox for ${speakerName(speaker)}.`)
  }

  const addDocumentRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = documentRequest.title.trim()
    if (!title || !documentRequest.dueAt) return
    const at = nowIso()
    dispatch({ type: 'task/upsert', task: {
      id: createId('task-document'), speakerId: speaker.id, kind: 'supporting-document', title,
      dueAt: new Date(documentRequest.dueAt).toISOString(), updatedAt: at,
    }, at })
    setDocumentRequest({ title: '', dueAt: '' })
    announce(`Assigned “${title}” to ${speakerName(speaker)}.`)
  }

  return (
    <section className="spk-detail" aria-labelledby="speaker-editor-heading">
      <header className="spk-detail-head">
        <div className="spk-avatar spk-avatar-large" aria-hidden="true">{initials(speaker)}</div>
        <div>
          <p className="spk-kicker">Speaker profile</p>
          <h2 id="speaker-editor-heading">{speakerName(speaker)}</h2>
          <span className={`spk-status spk-status-${speaker.status}`}>{statusLabels[speaker.status]}</span>
        </div>
        <button className="spk-button spk-button-secondary" type="button" onClick={sendReminder}>
          Record reminder
        </button>
      </header>

      <div className="spk-progress-group">
        <div><strong>Onboarding progress</strong><span>{completion}%</span></div>
        <progress value={completion} max="100">{completion}%</progress>
      </div>

      <form className="spk-form" onSubmit={save}>
        <div className="spk-form-grid">
          <label>First name<input required value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} /></label>
          <label>Last name<input required value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} /></label>
          <label>Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label>Company<input value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} /></label>
          <label>Job title<input value={form.jobTitle} onChange={(event) => setForm({ ...form, jobTitle: event.target.value })} /></label>
          <label>Pronouns<input value={form.pronouns} onChange={(event) => setForm({ ...form, pronouns: event.target.value })} /></label>
          <label>
            Invitation status
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as SpeakerStatus })}>
              <option value="invited">Awaiting response</option>
              <option value="confirmed">Confirmed</option>
              <option value="declined">Declined</option>
            </select>
          </label>
        </div>
        <label>Biography<textarea rows={5} value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} /></label>
        <div className="spk-form-actions"><button className="spk-button spk-button-primary" type="submit">Save profile</button></div>
      </form>

      <div className="spk-section-heading">
        <div><p className="spk-kicker">Organizer controls</p><h3>Onboarding tasks</h3></div>
        <span>{tasks.filter((task) => task.completedAt).length} of {tasks.length} complete</span>
      </div>
      <TaskList speaker={speaker} tasks={tasks} announce={announce} />
      <form className="spk-form" onSubmit={addDocumentRequest}>
        <div className="spk-form-grid">
          <label>Document request<input required placeholder="e.g. Signed release or worksheet" value={documentRequest.title} onChange={(event) => setDocumentRequest({ ...documentRequest, title: event.target.value })} /></label>
          <label>Due date<input required type="datetime-local" value={documentRequest.dueAt} onChange={(event) => setDocumentRequest({ ...documentRequest, dueAt: event.target.value })} /></label>
        </div>
        <div className="spk-form-actions"><button className="spk-button spk-button-secondary" type="submit">Assign document upload</button></div>
      </form>
    </section>
  )
}

export function OrganizerSpeakers() {
  const state = useAppState()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(state.speakers[0]?.id ?? '')
  const [announcement, setAnnouncement] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const speakers = useMemo(() => state.speakers.filter((speaker) => (
    `${speakerName(speaker)} ${speaker.email} ${speaker.company} ${speaker.jobTitle} ${speaker.status}`
      .toLowerCase()
      .includes(normalizedQuery)
  )), [state.speakers, normalizedQuery])
  const selected = state.speakers.find((speaker) => speaker.id === selectedId) ?? speakers[0]

  return (
    <div className="speaker-admin">
      <div className="spk-page-head">
        <div><p className="spk-kicker">People</p><h1>Speaker CRM</h1><p>Manage contact details, responses, and onboarding from one workspace.</p></div>
        <div className="spk-summary" aria-label="Speaker summary">
          <strong>{state.speakers.filter((speaker) => speaker.status === 'confirmed').length}</strong>
          <span>confirmed of {state.speakers.length}</span>
        </div>
      </div>
      <p className="spk-sr-live" role="status" aria-live="polite">{announcement}</p>
      <div className="spk-workspace">
        <aside className="spk-directory" aria-label="Speaker directory">
          <label className="spk-search">
            <span>Search speakers</span>
            <input type="search" placeholder="Name, email, company…" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <p className="spk-result-count">{speakers.length} {speakers.length === 1 ? 'speaker' : 'speakers'}</p>
          <div className="spk-directory-list">
            {speakers.map((speaker) => {
              const percent = selectOnboardingPercent(state, speaker.id)
              return (
                <button key={speaker.id} type="button" className={speaker.id === selected?.id ? 'is-selected' : ''} aria-pressed={speaker.id === selected?.id} onClick={() => setSelectedId(speaker.id)}>
                  <span className="spk-avatar" aria-hidden="true">{initials(speaker)}</span>
                  <span className="spk-person-copy"><strong>{speakerName(speaker)}</strong><small>{speaker.company || speaker.email}</small></span>
                  <span className="spk-percent">{percent}%</span>
                </button>
              )
            })}
            {speakers.length === 0 && <p className="spk-empty">No speakers match “{query}”.</p>}
          </div>
        </aside>
        {selected ? <SpeakerEditor key={selected.id} speaker={selected} announce={setAnnouncement} /> : <section className="spk-detail spk-empty">Select a speaker to manage their profile.</section>}
      </div>
    </div>
  )
}
