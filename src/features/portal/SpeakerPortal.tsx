import { useState, type ChangeEvent, type FormEvent } from 'react'
import { createId, nowIso, selectOnboardingPercent, selectTasksForSpeaker, speakerName, useApp, useAppDispatch, useAppState } from '../../core'
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
  const { state, session } = useApp()
  const dispatch = useAppDispatch()
  const [form, setForm] = useState({
    firstName: speaker.firstName,
    lastName: speaker.lastName,
    email: speaker.email,
    company: speaker.company,
    jobTitle: speaker.jobTitle,
    pronouns: speaker.pronouns ?? '',
    bio: speaker.bio,
    twitterUrl: speaker.twitterUrl ?? '',
    linkedinUrl: speaker.linkedinUrl ?? '',
    travelPreferences: speaker.travelPreferences ?? '',
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
        twitterUrl: form.twitterUrl.trim() || undefined,
        linkedinUrl: form.linkedinUrl.trim() || undefined,
        travelPreferences: form.travelPreferences.trim() || undefined,
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
        <label>Email<input required readOnly={session?.role === 'speaker'} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />{session?.role === 'speaker' && <small>Managed by your verified sign-in identity.</small>}</label>
        <label>Company<input value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} /></label>
        <label>Job title<input value={form.jobTitle} onChange={(event) => setForm({ ...form, jobTitle: event.target.value })} /></label>
        <label>Pronouns<input value={form.pronouns} onChange={(event) => setForm({ ...form, pronouns: event.target.value })} /></label>
        <label>LinkedIn URL<input type="url" value={form.linkedinUrl} onChange={(event) => setForm({ ...form, linkedinUrl: event.target.value })} /></label>
        <label>X / Twitter URL<input type="url" value={form.twitterUrl} onChange={(event) => setForm({ ...form, twitterUrl: event.target.value })} /></label>
        <label>Travel preferences<input value={form.travelPreferences} onChange={(event) => setForm({ ...form, travelPreferences: event.target.value })} /></label>
      </div>
      <label>Biography<textarea required rows={5} maxLength={1200} value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} /><small>{form.bio.length} / 1,200 characters</small></label>
      <div className="portal-form-actions"><button className="portal-button portal-button-primary" type="submit">Save profile</button></div>
    </form>
  )
}

function UploadControl({ task, speaker, announce }: { task: OnboardingTask; speaker: Speaker; announce: (message: string) => void }) {
  const { dispatch, persistenceMode, uploadAsset, downloadAsset } = useApp()
  const [uploading, setUploading] = useState(false)
  const isHeadshot = task.kind === 'headshot'
  const isSlides = task.kind === 'slides'
  const accept = isHeadshot
    ? 'image/jpeg,image/png,image/webp'
    : isSlides
      ? '.pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation'
      : '.pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain'
  const constraint = isHeadshot
    ? 'Accepted files: JPG, PNG, or WebP images. Maximum file size: 10 MB.'
    : isSlides
      ? 'Accepted files: PDF, PPT, or PPTX presentations. Maximum file size: 10 MB.'
      : 'Accepted files: PDF, DOC, DOCX, or TXT. Maximum file size: 10 MB.'
  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const at = nowIso()
    setUploading(true)
    try {
      if (persistenceMode === 'remote') {
        const uploaded = await uploadAsset(file)
        const asset: AssetMetadata = { id: uploaded.id, name: uploaded.fileName, type: uploaded.contentType, size: uploaded.sizeBytes, selectedAt: uploaded.createdAt, storage: 'r2' }
        dispatch({ type: 'task/toggle', id: task.id, completed: true, asset, uploadedBy: speakerName(speaker), at })
        announce(`${file.name} uploaded to durable private storage.`)
      } else {
        const asset: AssetMetadata = { name: file.name, type: file.type || 'application/octet-stream', size: file.size, selectedAt: at, storage: 'local-metadata' }
        dispatch({ type: 'task/toggle', id: task.id, completed: true, asset, uploadedBy: speakerName(speaker), at })
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
      <p className="portal-upload-constraints"><strong>Upload requirements</strong><span>{constraint}</span></p>
      {task.asset && <p><strong>{task.asset.name}</strong><span>{formatBytes(task.asset.size)} · {task.asset.type} · v{task.assetVersion ?? 1} · {task.approvalStatus ?? 'pending review'} · {task.asset.storage === 'r2' ? 'stored securely' : 'selected'} {formatDate(task.asset.selectedAt)}</span>{task.reviewerNote && <span>Organizer note: {task.reviewerNote}</span>}</p>}
      {task.asset?.id && <button className="portal-button portal-button-secondary" type="button" onClick={download}>Download</button>}
      <label className="portal-button portal-button-secondary">
        <span>{uploading ? 'Uploading…' : task.asset ? 'Choose a different file' : 'Choose file'}</span>
        <input type="file" accept={accept} disabled={uploading} onChange={chooseFile} />
      </label>
      {(task.deliverableVersions?.length ?? 0) > 0 && <details><summary>Version history ({task.deliverableVersions?.length})</summary><ul>{task.deliverableVersions?.map((version) => <li key={version.id}>v{version.version} · {version.asset.name} · {version.uploadedBy} · {formatDate(version.uploadedAt)}</li>)}</ul></details>}
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
  const [comment, setComment] = useState<Record<string, string>>({})

  return (
    <section className="portal-card" aria-labelledby="portal-tasks-heading">
      <div className="portal-card-heading">
        <div><p className="portal-kicker">Onboarding</p><h2 id="portal-tasks-heading">Your checklist</h2></div>
        <strong>{completion}%</strong>
      </div>
      <progress className="portal-progress" value={completion} max="100">{completion}%</progress>
      <ul className="portal-task-list">
        {tasks.map((task) => {
          const hasUpload = task.kind === 'headshot' || task.kind === 'slides' || task.kind === 'supporting-document'
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
              {task.instructions && <p className="portal-task-instructions">{task.instructions}</p>}
              {hasUpload && <UploadControl task={task} speaker={speaker} announce={announce} />}
              {hasUpload && <form className="portal-comment" onSubmit={(event) => { event.preventDefault(); const body = comment[task.id]?.trim(); if (!body) return; dispatch({ type: 'task/comment', id: task.id, comment: { id: createId('comment'), authorName: speakerName(speaker), authorRole: 'speaker', body, createdAt: nowIso() } }); setComment({ ...comment, [task.id]: '' }); announce('Comment added.') }}><label>Comment for organizer<input value={comment[task.id] ?? ''} onChange={(event) => setComment({ ...comment, [task.id]: event.target.value })} /></label><button className="portal-button portal-button-secondary">Add comment</button>{task.comments?.map((item) => <p key={item.id}><strong>{item.authorName}:</strong> {item.body}</p>)}</form>}
            </li>
          )
        })}
      </ul>
      <StorageNotice />
    </section>
  )
}

function ProposalWorkspace({ speaker, announce }: { speaker: Speaker; announce: (message: string) => void }) {
  const { state, saveSpeakerProposal } = useApp()
  const proposals = state.submissions.filter((item) => item.speakerIds.includes(speaker.id) && item.origin === 'cfp')
  const [selectedId, setSelectedId] = useState(proposals[0]?.id ?? '')
  const selected = proposals.find((item) => item.id === selectedId)
  const [form, setForm] = useState(() => ({ title: selected?.title ?? '', abstract: selected?.abstract ?? '', track: selected?.track ?? state.event.tracks[0] ?? '', format: selected?.format ?? state.event.cfp?.formats?.[0]?.name ?? '', durationMinutes: selected?.durationMinutes ?? state.event.cfp?.formats?.[0]?.durationMinutes ?? 30, tags: selected?.tags.join(', ') ?? '', customAnswers: selected?.customAnswers ?? {} }))
  const [saving, setSaving] = useState(false)
  const cfp = state.event.cfp
  const closed = !cfp?.open || new Date(cfp.closeAt) <= new Date()
  const decided = selected ? ['accepted', 'waitlisted', 'declined'].includes(selected.status) : false
  const locked = closed || decided
  const choose = (id: string) => { const proposal = proposals.find((item) => item.id === id); setSelectedId(id); setForm({ title: proposal?.title ?? '', abstract: proposal?.abstract ?? '', track: proposal?.track ?? state.event.tracks[0] ?? '', format: proposal?.format ?? cfp?.formats?.[0]?.name ?? '', durationMinutes: proposal?.durationMinutes ?? cfp?.formats?.[0]?.durationMinutes ?? 30, tags: proposal?.tags.join(', ') ?? '', customAnswers: proposal?.customAnswers ?? {} }) }
  const save = async (action: 'save-draft'|'submit') => { setSaving(true); try { const result = await saveSpeakerProposal({ action, title: form.title, abstract: form.abstract, track: form.track, format: form.format, durationMinutes: form.durationMinutes, tags: form.tags.split(',').map((item) => item.trim()).filter(Boolean), customAnswers: form.customAnswers }, selected?.id); setSelectedId(result.id); announce(action === 'submit' ? 'Proposal submitted for review.' : 'Proposal draft saved.') } catch (error) { announce(error instanceof Error ? error.message : 'Proposal could not be saved.') } finally { setSaving(false) } }
  const participants = selected?.speakerIds.map((id) => state.speakers.find((item) => item.id === id)).filter((item) => item !== undefined) ?? [speaker]
  return <section className="portal-card portal-form" aria-labelledby="portal-proposals-heading"><div className="portal-card-heading"><div><p className="portal-kicker">Call for proposals</p><h2 id="portal-proposals-heading">My submissions</h2></div><span>{proposals.length} proposal{proposals.length === 1 ? '' : 's'}</span></div>{proposals.length > 0 && <label>Choose proposal<select value={selectedId} onChange={(event) => choose(event.target.value)}><option value="">New proposal</option>{proposals.map((proposal) => <option key={proposal.id} value={proposal.id}>{proposal.title} · {proposal.lifecycle ?? 'submitted'} · {proposal.status}</option>)}</select></label>}{selected && <div className="portal-participants" aria-label="Proposal participants">{participants.map((participant, index) => <span key={participant.id}><strong>{speakerName(participant)}</strong><small>{index === 0 ? 'Primary speaker' : 'Co-speaker'} · {participant.email}</small></span>)}</div>}{locked && <p className="portal-storage-note"><strong>Editing locked:</strong> {decided ? `This proposal is ${selected?.status}.` : 'The call for proposals is closed.'}</p>}<fieldset disabled={locked || saving}><div className="portal-form-grid"><label>Title<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label>Track<select value={form.track} onChange={(event) => setForm({ ...form, track: event.target.value })}>{state.event.tracks.map((track) => <option key={track}>{track}</option>)}</select></label><label>Format<select value={form.format} onChange={(event) => { const format=cfp?.formats?.find((item)=>item.name===event.target.value); setForm({ ...form, format: event.target.value, durationMinutes: format?.durationMinutes ?? form.durationMinutes }) }}>{cfp?.formats?.map((format) => <option key={format.name}>{format.name}</option>)}</select></label><label>Duration (minutes)<input min="5" type="number" value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })} /></label></div><label>Abstract<textarea required rows={5} value={form.abstract} onChange={(event) => setForm({ ...form, abstract: event.target.value })} /></label><label>Tags, comma separated<input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} /></label>{cfp?.questions.map((question) => <label key={question.id}>{question.label}{question.type === 'textarea' ? <textarea required={question.required} value={String(form.customAnswers[question.id] ?? '')} onChange={(event) => setForm({ ...form, customAnswers: { ...form.customAnswers, [question.id]: event.target.value } })} /> : question.type === 'select' ? <select required={question.required} value={String(form.customAnswers[question.id] ?? '')} onChange={(event) => setForm({ ...form, customAnswers: { ...form.customAnswers, [question.id]: event.target.value } })}><option value="">Choose…</option>{question.options?.map((option) => <option key={option}>{option}</option>)}</select> : <input required={question.required} value={String(form.customAnswers[question.id] ?? '')} onChange={(event) => setForm({ ...form, customAnswers: { ...form.customAnswers, [question.id]: event.target.value } })} />}</label>)}<p className="portal-storage-note"><strong>Signed-in participant:</strong> {speakerName(speaker)} ({speaker.email})</p><div className="portal-form-actions"><button className="portal-button portal-button-secondary" type="button" onClick={() => void save('save-draft')}>{saving ? 'Saving…' : 'Save draft'}</button><button className="portal-button portal-button-primary" type="button" onClick={() => void save('submit')}>{saving ? 'Submitting…' : 'Submit proposal'}</button></div></fieldset></section>
}

function MySessions({ speaker }: { speaker: Speaker }) {
  const state = useAppState()
  const submissions = state.submissions.filter((submission) => submission.speakerIds.includes(speaker.id))
  const sessions = submissions.flatMap((submission) => state.sessions.filter((session) => session.submissionId === submission.id).map((session) => ({ submission, session })))
  return <section className="portal-card"><div className="portal-card-heading"><div><p className="portal-kicker">Program</p><h2>My sessions</h2></div></div>{sessions.length ? <ul className="portal-task-list">{sessions.map(({ submission, session }) => <li key={session.id}><strong>{submission.title}</strong><small>{formatDate(session.startAt)} · {new Date(session.startAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {session.room}</small></li>)}</ul> : <p className="portal-storage-note">Your scheduled sessions will appear here.</p>}</section>
}

function StorageNotice() {
  const { persistenceMode } = useApp()
  return <p className="portal-storage-note">{persistenceMode === 'remote' ? <><strong>Private durable storage:</strong> uploaded file bytes are retained in event-scoped object storage and require workspace access to download.</> : <><strong>Local preview:</strong> only file metadata is retained in this browser.</>}</p>
}

function Resources() {
  const { state, downloadAsset } = useApp()
  const resources = (state.event.resources ?? []).filter((resource) => !resource.approvalStatus || resource.approvalStatus === 'approved')
  const safeEmbedUrl = (value?: string) => {
    if (!value) return undefined
    try {
      const url = new URL(value)
      return url.protocol === 'https:' ? url.toString() : undefined
    } catch {
      return undefined
    }
  }
  const downloadFile = async (assetId: string, name: string) => {
    const result = await downloadAsset(assetId)
    const href = URL.createObjectURL(result.blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = name || result.fileName
    anchor.click()
    URL.revokeObjectURL(href)
  }
  return (
    <section className="portal-card portal-resources" aria-labelledby="portal-resources-heading">
      <div className="portal-card-heading"><div><p className="portal-kicker">Speaker wiki</p><h2 id="portal-resources-heading">Event resources</h2></div></div>
      {resources.length === 0 && <p className="portal-storage-note">No resources have been published for this event.</p>}
      {resources.map((resource) => { const embedUrl = safeEmbedUrl(resource.embedUrl); const files = (resource.files ?? []).filter((file) => file.approvalStatus === 'approved'); return <details key={resource.id}><summary>{resource.title} <small>v{resource.version ?? 1}</small></summary><div className="portal-safe-preview" dangerouslySetInnerHTML={{ __html: sanitizeHtml(resource.body) }} />{files.length > 0 && <div className="portal-resource-files">{files.map((file) => <button className="portal-button portal-button-secondary" type="button" key={file.id} disabled={!file.assetId && !file.url} onClick={() => file.assetId ? void downloadFile(file.assetId, file.name) : window.open(file.url, '_blank', 'noopener,noreferrer')}><strong>{file.name}</strong><span>v{file.version} · {formatBytes(file.size)}</span></button>)}</div>}{embedUrl && <iframe title={`${resource.title} embedded resource`} src={embedUrl} sandbox="allow-scripts allow-popups allow-presentation" loading="lazy" referrerPolicy="no-referrer" />}</details> })}
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
        <div><ProfileForm speaker={speaker} announce={setAnnouncement} /><ProposalWorkspace speaker={speaker} announce={setAnnouncement} /></div>
        <div><MySessions speaker={speaker} /><OnboardingChecklist speaker={speaker} announce={setAnnouncement} /><Resources /></div>
      </div>
    </>
  )
}

export function SpeakerPortal() {
  const { state, session } = useApp()
  const preview = session?.role !== 'speaker'
  const [speakerId, setSpeakerId] = useState(state.speakers[0]?.id ?? '')
  const speaker = state.speakers.find((item) => item.id === speakerId) ?? state.speakers[0]
  return (
    <div className="participant-portal">
      {preview && <div className="portal-demo-switcher">
        <div><strong>Read-only participant preview</strong><span>Choose a speaker to inspect their portal. Sign in as that speaker to make changes.</span></div>
        <label>Signed in as<select value={speaker?.id ?? ''} onChange={(event) => setSpeakerId(event.target.value)}>{state.speakers.map((item) => <option key={item.id} value={item.id}>{speakerName(item)} · {item.email}</option>)}</select></label>
      </div>}
      {speaker ? <fieldset className="portal-preview-fieldset" disabled={preview} aria-label={preview ? 'Read-only participant portal preview' : undefined}><PortalWorkspace key={speaker.id} speaker={speaker} /></fieldset> : <div className="portal-card"><h1>No speakers yet</h1><p>An organizer must add a speaker before the portal can be previewed.</p></div>}
    </div>
  )
}
