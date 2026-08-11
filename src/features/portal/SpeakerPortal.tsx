import { useState, type ChangeEvent, type FormEvent } from 'react'
import { nowIso, selectOnboardingPercent, selectTasksForSpeaker, speakerName, useApp, useAppDispatch, useAppState } from '../../core'
import type { AssetMetadata, OnboardingTask, Speaker } from '../../domain'
import './SpeakerPortal.css'
import './portal-improvements.css'

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
        <p>{speaker.status === 'invited' ? 'Let the event team know whether you can participate.' : 'Your response is saved to the event workspace.'}</p>
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
  const { dispatch, persistenceMode, uploadAsset, downloadAsset } = useApp()
  const [uploading, setUploading] = useState(false)
  const isHeadshot = task.kind === 'headshot'
  const accept = isHeadshot ? 'image/jpeg,image/png,image/webp' : '.pdf,.ppt,.pptx,.key,application/pdf'
  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const at = nowIso()
    setUploading(true)
    try {
      if (persistenceMode === 'remote') {
        const uploaded = await uploadAsset(file)
        const asset: AssetMetadata = { id: uploaded.id, name: uploaded.fileName, type: uploaded.contentType, size: uploaded.sizeBytes, selectedAt: uploaded.createdAt, storage: 'r2' }
        dispatch({ type: 'task/toggle', id: task.id, completed: true, asset, at })
        announce(`${file.name} uploaded to durable private storage.`)
      } else {
        const asset: AssetMetadata = { name: file.name, type: file.type || 'application/octet-stream', size: file.size, selectedAt: at, storage: 'local-metadata' }
        dispatch({ type: 'task/toggle', id: task.id, completed: true, asset, at })
        announce(`${file.name} metadata saved locally.`)
      }
    } catch (error) {
      announce(error instanceof Error ? error.message : 'The file could not be uploaded.')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  const download = async () => {
    if (!task.asset?.id) return
    try {
      const result = await downloadAsset(task.asset.id)
      const href = URL.createObjectURL(result.blob)
      const anchor = document.createElement('a')
      anchor.href = href
      anchor.download = result.fileName
      anchor.click()
      URL.revokeObjectURL(href)
      announce(`${result.fileName} downloaded.`)
    } catch (error) {
      announce(error instanceof Error ? error.message : 'The file could not be downloaded.')
    }
  }

  return (
    <div className="portal-upload">
      {task.asset && <p><strong>{task.asset.name}</strong><span>{formatBytes(task.asset.size)} · {task.asset.type} · {task.asset.storage === 'r2' ? 'stored securely' : 'selected'} {formatDate(task.asset.selectedAt)}</span></p>}
      {task.asset?.id && <button className="portal-button portal-button-secondary" type="button" onClick={download}>Download</button>}
      <label className="portal-button portal-button-secondary">
        <span>{uploading ? 'Uploading…' : task.asset ? 'Choose a different file' : 'Choose file'}</span>
        <input type="file" accept={accept} disabled={uploading} onChange={chooseFile} />
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
                <input id={inputId} type="checkbox" checked={Boolean(task.completedAt)} disabled={hasUpload && !task.asset} onChange={(event) => toggle(task, event.target.checked)} />
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
      <StorageNotice />
    </section>
  )
}

function StorageNotice() {
  const { persistenceMode } = useApp()
  return <p className="portal-storage-note">{persistenceMode === 'remote' ? <><strong>Private durable storage:</strong> uploaded file bytes are retained in event-scoped object storage and require workspace access to download.</> : <><strong>Local preview:</strong> only file metadata is retained in this browser.</>}</p>
}

function Resources() {
  const state = useAppState()
  const resources = state.event.resources ?? []
  const safeEmbedUrl = (value?: string) => {
    if (!value) return undefined
    try {
      const url = new URL(value)
      return url.protocol === 'https:' ? url.toString() : undefined
    } catch {
      return undefined
    }
  }
  return (
    <section className="portal-card portal-resources" aria-labelledby="portal-resources-heading">
      <div className="portal-card-heading"><div><p className="portal-kicker">Speaker wiki</p><h2 id="portal-resources-heading">Event resources</h2></div></div>
      {resources.length === 0 && <p className="portal-storage-note">No resources have been published for this event.</p>}
      {resources.map((resource) => { const embedUrl = safeEmbedUrl(resource.embedUrl); return <details key={resource.id}><summary>{resource.title}</summary><div className="portal-safe-preview" dangerouslySetInnerHTML={{ __html: sanitizeHtml(resource.body) }} />{embedUrl && <iframe title={`${resource.title} embedded resource`} src={embedUrl} sandbox="allow-scripts allow-popups allow-presentation" loading="lazy" referrerPolicy="no-referrer" />}</details> })}
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
        <div><ProfileForm speaker={speaker} announce={setAnnouncement} /></div>
        <div><OnboardingChecklist speaker={speaker} announce={setAnnouncement} /><Resources /></div>
      </div>
    </>
  )
}

export function SpeakerPortal() {
  const { state, session } = useApp()
  const [speakerId, setSpeakerId] = useState(state.speakers[0]?.id ?? '')
  const speaker = state.speakers.find((item) => item.id === speakerId) ?? state.speakers[0]
  return (
    <div className="participant-portal">
      {session?.role !== 'speaker' && <div className="portal-demo-switcher">
        <div><strong>Participant portal demo</strong><span>Choose a speaker to simulate their private sign-in.</span></div>
        <label>Signed in as<select value={speaker?.id ?? ''} onChange={(event) => setSpeakerId(event.target.value)}>{state.speakers.map((item) => <option key={item.id} value={item.id}>{speakerName(item)} · {item.email}</option>)}</select></label>
      </div>}
      {speaker ? <PortalWorkspace key={speaker.id} speaker={speaker} /> : <div className="portal-card"><h1>No speakers yet</h1><p>An organizer must add a speaker before the portal can be previewed.</p></div>}
    </div>
  )
}
