import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { nowIso, selectOnboardingPercent, selectTasksForSpeaker, speakerName, useAppDispatch, useAppState } from '../../core'
import type { AssetMetadata, OnboardingTask, Speaker } from '../../domain'
import './SpeakerPortal.css'

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function sanitizeHtml(source: string): string {
  if (typeof DOMParser === 'undefined') return ''
  const parsed = new DOMParser().parseFromString(source, 'text/html')
  const allowed = new Set(['A', 'B', 'BR', 'CODE', 'EM', 'H2', 'H3', 'LI', 'OL', 'P', 'STRONG', 'UL'])
  const elements = Array.from(parsed.body.querySelectorAll('*'))
  for (const element of elements) {
    if (!allowed.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes))
      continue
    }
    const href = element.tagName === 'A' ? element.getAttribute('href')?.trim() : undefined
    for (const attribute of Array.from(element.attributes)) element.removeAttribute(attribute.name)
    if (element.tagName === 'A' && href && (/^https?:\/\//i.test(href) || /^mailto:/i.test(href) || href.startsWith('#') || href.startsWith('/'))) {
      element.setAttribute('href', href)
      element.setAttribute('rel', 'noopener noreferrer')
    }
  }
  return parsed.body.innerHTML
}

function AcceptanceCard({ speaker, announce }: { speaker: Speaker; announce: (message: string) => void }) {
  const dispatch = useAppDispatch()
  const respond = (status: Speaker['status']) => {
    dispatch({ type: 'speaker/update', id: speaker.id, patch: { status }, at: nowIso() })
    announce(status === 'confirmed' ? 'Your invitation is accepted.' : 'Your invitation is declined. You can change this response later.')
  }

  return (
    <section className={`portal-card portal-acceptance is-${speaker.status}`} aria-labelledby="portal-response-heading">
      <div>
        <p className="portal-kicker">Invitation</p>
        <h2 id="portal-response-heading">
          {speaker.status === 'confirmed' ? 'You’re confirmed!' : speaker.status === 'declined' ? 'You declined this invitation' : 'Will you join us?'}
        </h2>
        <p>{speaker.status === 'invited' ? 'Let the event team know whether you can participate.' : 'Your response is saved in this browser.'}</p>
      </div>
      <div className="portal-response-actions">
        <button type="button" className="portal-button portal-button-primary" aria-pressed={speaker.status === 'confirmed'} onClick={() => respond('confirmed')}>Accept invitation</button>
        <button type="button" className="portal-button portal-button-secondary" aria-pressed={speaker.status === 'declined'} onClick={() => respond('declined')}>Decline</button>
      </div>
    </section>
  )
}

function ProfileForm({ speaker, announce }: { speaker: Speaker; announce: (message: string) => void }) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const [form, setForm] = useState({
    firstName: speaker.firstName,
    lastName: speaker.lastName,
    email: speaker.email,
    company: speaker.company,
    jobTitle: speaker.jobTitle,
    pronouns: speaker.pronouns ?? '',
    bio: speaker.bio,
  })

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
      },
      at,
    })
    const profileTask = selectTasksForSpeaker(state, speaker.id).find((task) => task.kind === 'profile')
    if (profileTask) dispatch({ type: 'task/toggle', id: profileTask.id, completed: true, at })
    announce('Profile saved and profile task marked complete.')
  }

  return (
    <form className="portal-card portal-form" onSubmit={save}>
      <div className="portal-card-heading"><div><p className="portal-kicker">Public information</p><h2>Your profile</h2></div><span>Shown to event organizers</span></div>
      <div className="portal-form-grid">
        <label>First name<input required value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} /></label>
        <label>Last name<input required value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} /></label>
        <label>Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label>Company<input value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} /></label>
        <label>Job title<input value={form.jobTitle} onChange={(event) => setForm({ ...form, jobTitle: event.target.value })} /></label>
        <label>Pronouns<input value={form.pronouns} onChange={(event) => setForm({ ...form, pronouns: event.target.value })} /></label>
      </div>
      <label>Biography<textarea required rows={5} maxLength={1200} value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} /><small>{form.bio.length} / 1,200 characters</small></label>
      <div className="portal-form-actions"><button className="portal-button portal-button-primary" type="submit">Save profile</button></div>
    </form>
  )
}

function UploadControl({ task, announce }: { task: OnboardingTask; announce: (message: string) => void }) {
  const dispatch = useAppDispatch()
  const isHeadshot = task.kind === 'headshot'
  const accept = isHeadshot ? 'image/jpeg,image/png,image/webp' : '.pdf,.ppt,.pptx,.key,application/pdf'
  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const at = nowIso()
    const asset: AssetMetadata = { name: file.name, type: file.type || 'application/octet-stream', size: file.size, selectedAt: at }
    dispatch({ type: 'task/toggle', id: task.id, completed: true, asset, at })
    announce(`${file.name} metadata saved. The file itself remains on this device and is not uploaded.`)
  }

  return (
    <div className="portal-upload">
      {task.asset && <p><strong>{task.asset.name}</strong><span>{formatBytes(task.asset.size)} · {task.asset.type} · selected {formatDate(task.asset.selectedAt)}</span></p>}
      <label className="portal-button portal-button-secondary">
        <span>{task.asset ? 'Choose a different file' : 'Choose file'}</span>
        <input type="file" accept={accept} onChange={chooseFile} />
      </label>
    </div>
  )
}

function OnboardingChecklist({ speaker, announce }: { speaker: Speaker; announce: (message: string) => void }) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const tasks = selectTasksForSpeaker(state, speaker.id)
  const completion = selectOnboardingPercent(state, speaker.id)
  const toggle = (task: OnboardingTask, completed: boolean) => {
    dispatch({ type: 'task/toggle', id: task.id, completed, at: nowIso() })
    announce(`${task.title} ${completed ? 'completed' : 'reopened'}.`)
  }

  return (
    <section className="portal-card" aria-labelledby="portal-tasks-heading">
      <div className="portal-card-heading">
        <div><p className="portal-kicker">Onboarding</p><h2 id="portal-tasks-heading">Your checklist</h2></div>
        <strong>{completion}%</strong>
      </div>
      <progress className="portal-progress" value={completion} max="100">{completion}%</progress>
      <ul className="portal-task-list">
        {tasks.map((task) => {
          const hasUpload = task.kind === 'headshot' || task.kind === 'slides'
          const inputId = `portal-task-${task.id}`
          return (
            <li key={task.id} className={task.completedAt ? 'is-complete' : ''}>
              <div className="portal-task-main">
                <input id={inputId} type="checkbox" checked={Boolean(task.completedAt)} onChange={(event) => toggle(task, event.target.checked)} />
                <label htmlFor={inputId}>
                  <strong>{task.title}{task.kind === 'agreement' ? ' (agreement)' : ''}</strong>
                  <small>{task.completedAt ? `Completed ${formatDate(task.completedAt)}` : `Due ${formatDate(task.dueAt)}`}</small>
                </label>
              </div>
              {hasUpload && <UploadControl task={task} announce={announce} />}
            </li>
          )
        })}
      </ul>
      <p className="portal-storage-note"><strong>Browser-local demo:</strong> file name, type, size, and selection time are saved. File contents are not uploaded or retained.</p>
    </section>
  )
}

function Resources() {
  return (
    <section className="portal-card portal-resources" aria-labelledby="portal-resources-heading">
      <div className="portal-card-heading"><div><p className="portal-kicker">Speaker wiki</p><h2 id="portal-resources-heading">Event resources</h2></div></div>
      <details><summary>Venue and arrival guide</summary><p>Arrive at least 45 minutes before your session. Check in at the speaker desk near the main entrance.</p></details>
      <details><summary>AV and presentation tips</summary><p>Use 16:9 slides, bring a backup PDF, and avoid relying on embedded web demos without a recording.</p></details>
      <details><summary>Accessibility checklist</summary><p>Use high-contrast slides, describe meaningful visuals, and share terminology before using acronyms.</p></details>
      <details><summary>Speaker support contacts</summary><p>Email speakers@event.example for program questions. Visit the production desk for same-day AV support.</p></details>
    </section>
  )
}

function SafeEmbedPreview() {
  const [html, setHtml] = useState('<h3>Session links</h3><p>Read the <a href="https://example.com">speaker guide</a> before arrival.</p>')
  const sanitized = useMemo(() => sanitizeHtml(html), [html])
  return (
    <section className="portal-card portal-embed" aria-labelledby="portal-embed-heading">
      <div className="portal-card-heading"><div><p className="portal-kicker">Optional preview tool</p><h2 id="portal-embed-heading">Safe wiki embed preview</h2></div></div>
      <label>HTML snippet<textarea rows={5} value={html} onChange={(event) => setHtml(event.target.value)} /></label>
      <p className="portal-storage-note">Only headings, paragraphs, lists, emphasis, code, and safe links are retained. Scripts, styles, images, and event attributes are removed.</p>
      <div className="portal-safe-preview" aria-label="Sanitized HTML preview" dangerouslySetInnerHTML={{ __html: sanitized }} />
    </section>
  )
}

function PortalWorkspace({ speaker }: { speaker: Speaker }) {
  const state = useAppState()
  const [announcement, setAnnouncement] = useState('')
  const completion = selectOnboardingPercent(state, speaker.id)
  return (
    <>
      <p className="portal-live" role="status" aria-live="polite">{announcement}</p>
      <div className="portal-welcome">
        <div><p className="portal-kicker">{state.event.name}</p><h1>Welcome, {speaker.firstName}</h1><p>{state.event.venue} · {formatDate(state.event.startAt)}</p></div>
        <div className="portal-completion"><strong>{completion}%</strong><span>onboarding complete</span></div>
      </div>
      <AcceptanceCard speaker={speaker} announce={setAnnouncement} />
      <div className="portal-columns">
        <div><ProfileForm speaker={speaker} announce={setAnnouncement} /><SafeEmbedPreview /></div>
        <div><OnboardingChecklist speaker={speaker} announce={setAnnouncement} /><Resources /></div>
      </div>
    </>
  )
}

export function SpeakerPortal() {
  const state = useAppState()
  const [speakerId, setSpeakerId] = useState(state.speakers[0]?.id ?? '')
  const speaker = state.speakers.find((item) => item.id === speakerId) ?? state.speakers[0]
  return (
    <div className="participant-portal">
      <div className="portal-demo-switcher">
        <div><strong>Participant portal demo</strong><span>Choose a speaker to simulate their private sign-in.</span></div>
        <label>Signed in as<select value={speaker?.id ?? ''} onChange={(event) => setSpeakerId(event.target.value)}>{state.speakers.map((item) => <option key={item.id} value={item.id}>{speakerName(item)} · {item.email}</option>)}</select></label>
      </div>
      {speaker ? <PortalWorkspace key={speaker.id} speaker={speaker} /> : <div className="portal-card"><h1>No speakers yet</h1><p>An organizer must add a speaker before the portal can be previewed.</p></div>}
    </div>
  )
}
