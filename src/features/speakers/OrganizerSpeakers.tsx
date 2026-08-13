import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { createId, createSpeaker, nowIso, selectOnboardingPercent, selectTasksForSpeaker, speakerName, useApp } from '../../core'
import type { OnboardingTask, Speaker, SpeakerInput, SpeakerStatus } from '../../domain'
import { parseSpeakerCsv } from './speaker-import'
import './OrganizerSpeakers.css'

const blankSpeaker: SpeakerInput = { firstName: '', lastName: '', email: '', company: '', jobTitle: '', bio: '', status: 'invited' }
const labels: Record<SpeakerStatus, string> = { invited: 'Awaiting response', confirmed: 'Confirmed', declined: 'Declined' }
const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))

function Sessions({ speaker }: { speaker: Speaker }) {
  const { state } = useApp()
  const submissions = state.submissions.filter((item) => item.speakerIds.includes(speaker.id))
  const sessions = submissions.flatMap((submission) => state.sessions.filter((session) => session.submissionId === submission.id).map((session) => ({ submission, session })))
  return <section><div className="spk-section-heading"><div><p className="spk-kicker">Program</p><h3>My sessions</h3></div></div>{sessions.length ? <ul className="spk-task-list">{sessions.map(({ submission, session }) => <li key={session.id}><strong>{submission.title}</strong><small>{formatDate(session.startAt)} · {new Date(session.startAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {session.room}</small></li>)}</ul> : <p className="spk-empty">No scheduled sessions yet.</p>}</section>
}

function TaskList({ speaker, tasks, announce }: { speaker: Speaker; tasks: OnboardingTask[]; announce: (value: string) => void }) {
  const { dispatch, downloadAsset, uploadAsset, persistenceMode } = useApp()
  void speaker
  const download = async (task: OnboardingTask) => { if (!task.asset?.id) return; const result = await downloadAsset(task.asset.id); const href = URL.createObjectURL(result.blob); const link = document.createElement('a'); link.href = href; link.download = result.fileName; link.click(); URL.revokeObjectURL(href) }
  const upload = async (task: OnboardingTask, event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const at = nowIso(); const remote = persistenceMode === 'remote' ? await uploadAsset(file) : undefined; dispatch({ type: 'task/toggle', id: task.id, completed: true, uploadedBy: 'Organizer', asset: remote ? { id: remote.id, name: remote.fileName, type: remote.contentType, size: remote.sizeBytes, selectedAt: remote.createdAt, storage: 'r2' } : { name: file.name, type: file.type, size: file.size, selectedAt: at, storage: 'local-metadata' }, at }); announce(`${file.name} added as a new immutable version.`) }
  return <ul className="spk-task-list">{tasks.map((task) => <li key={task.id}><label><input type="checkbox" checked={Boolean(task.completedAt)} onChange={(event) => dispatch({ type: 'task/toggle', id: task.id, completed: event.target.checked })} /><span><strong>{task.title}</strong><small>{task.instructions || `Due ${formatDate(task.dueAt)}`}</small></span></label>{task.asset && <div className="spk-file-row"><span>{task.asset.name} · v{task.assetVersion ?? 1} · {task.approvalStatus ?? 'pending'}</span>{task.asset.id && <button className="spk-button spk-button-secondary" type="button" onClick={() => void download(task)}>Download</button>}<label className="spk-button spk-button-secondary">Upload new version<input hidden type="file" onChange={(event) => void upload(task, event)} /></label></div>}</li>)}</ul>
}

function HeadshotEditor({ speaker, announce }: { speaker: Speaker; announce: (value: string) => void }) {
  const { state, dispatch, downloadAsset, uploadAsset, persistenceMode } = useApp()
  const headshot = selectTasksForSpeaker(state, speaker.id).find((task) => task.kind === 'headshot')
  const [preview, setPreview] = useState(speaker.photoUrl ?? '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!headshot?.asset?.id) { setPreview(speaker.photoUrl ?? ''); return }
    let active = true
    let objectUrl = ''
    void downloadAsset(headshot.asset.id).then((result) => {
      if (!active) return
      objectUrl = URL.createObjectURL(result.blob)
      setPreview(objectUrl)
    }).catch(() => setPreview(speaker.photoUrl ?? ''))
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [downloadAsset, headshot?.asset?.id, speaker.photoUrl])

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      announce('Choose a JPG, PNG, or WebP image no larger than 10 MB.')
      event.target.value = ''
      return
    }
    setBusy(true)
    try {
      const at = nowIso()
      const taskId = headshot?.id ?? createId('task')
      if (!headshot) dispatch({ type: 'task/upsert', task: { id: taskId, speakerId: speaker.id, kind: 'headshot', title: 'Upload headshot', instructions: 'JPG, PNG, or WebP · maximum 10 MB', dueAt: state.event.endAt, updatedAt: at }, at })
      const remote = persistenceMode === 'remote' ? await uploadAsset(file) : undefined
      const asset = remote ? { id: remote.id, name: remote.fileName, type: remote.contentType, size: remote.sizeBytes, selectedAt: remote.createdAt, storage: 'r2' as const } : { name: file.name, type: file.type, size: file.size, selectedAt: at, storage: 'local-metadata' as const }
      dispatch({ type: 'task/toggle', id: taskId, completed: true, asset, uploadedBy: 'Organizer', at })
      dispatch({ type: 'task/review', id: taskId, status: 'approved', note: 'Approved organizer profile headshot.', at })
      setPreview((current) => { if (current.startsWith('blob:')) URL.revokeObjectURL(current); return URL.createObjectURL(file) })
      announce(`${file.name} saved and approved as ${speakerName(speaker)}'s profile headshot.`)
    } catch (error) {
      announce(error instanceof Error ? error.message : 'The profile headshot could not be saved.')
    } finally {
      setBusy(false)
      event.target.value = ''
    }
  }

  return <section className="spk-headshot-editor" aria-labelledby={`headshot-${speaker.id}`}>
    <div className="spk-headshot-preview">{preview ? <img src={preview} alt={`${speakerName(speaker)} profile headshot`} /> : <span aria-hidden="true">{speaker.firstName[0]}{speaker.lastName[0]}</span>}</div>
    <div><h3 id={`headshot-${speaker.id}`}>Profile headshot</h3><p>{headshot?.asset ? `${headshot.asset.name} · approved · ${formatDate(headshot.asset.selectedAt)}` : 'No profile headshot uploaded.'}</p><small>Accepted: JPG, PNG, or WebP · maximum 10 MB.</small><label className="spk-button spk-button-secondary">{busy ? 'Uploading…' : headshot?.asset ? 'Replace headshot' : 'Upload headshot'}<input hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => void upload(event)} /></label></div>
  </section>
}

function SpeakerEditor({ speaker, announce }: { speaker: Speaker; announce: (value: string) => void }) {
  const { state, dispatch, api, persistenceMode } = useApp(); const tasks = selectTasksForSpeaker(state, speaker.id)
  const [form, setForm] = useState({ ...speaker })
  const [inviting, setInviting] = useState(false)
  const save = (event: FormEvent) => { event.preventDefault(); dispatch({ type: 'speaker/update', id: speaker.id, patch: { ...form, email: form.email.trim().toLowerCase() }, at: nowIso() }); announce('Speaker profile saved.') }
  const invite = async () => { if (!api || persistenceMode !== 'remote') return announce('Speaker invitation email is available on the deployed application.'); setInviting(true); try { const returnUrl = new URL(window.location.href); returnUrl.hash = '#/portal'; returnUrl.searchParams.delete('claimToken'); const receipt = await api.inviteSpeaker({ speakerId: speaker.id, returnUrl: returnUrl.toString() }); announce(`Secure portal invitation sent to ${receipt.email}.`) } catch (error) { announce(error instanceof Error ? error.message : 'Speaker invitation delivery failed.') } finally { setInviting(false) } }
  return <section className="spk-detail"><header className="spk-detail-head"><div className="spk-avatar spk-avatar-large">{speaker.firstName[0]}{speaker.lastName[0]}</div><div><p className="spk-kicker">Speaker profile</p><h2>{speakerName(speaker)}</h2><span className={`spk-status spk-status-${speaker.status}`}>{labels[speaker.status]}</span></div><button className="spk-button spk-button-secondary" type="button" disabled={inviting || speaker.status === 'declined'} onClick={() => void invite()}>{inviting ? 'Sending…' : 'Send portal invite'}</button></header><HeadshotEditor speaker={speaker} announce={announce} /><div className="spk-progress-group"><div><strong>Onboarding progress</strong><span>{selectOnboardingPercent(state, speaker.id)}%</span></div><progress value={selectOnboardingPercent(state, speaker.id)} max="100" /></div><form className="spk-form" onSubmit={save}><div className="spk-form-grid">{(['firstName','lastName','email','company','jobTitle','pronouns','twitterUrl','linkedinUrl','travelPreferences'] as const).map((field) => <label key={field}>{field.replace(/([A-Z])/g, ' $1')}<input type={field === 'email' ? 'email' : field.endsWith('Url') ? 'url' : 'text'} value={String(form[field] ?? '')} onChange={(e) => setForm({ ...form, [field]: e.target.value })} /></label>)}<label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as SpeakerStatus })}>{Object.entries(labels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><label>Biography<textarea rows={5} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></label><div className="spk-form-actions"><button className="spk-button spk-button-primary">Save profile</button></div></form><Sessions speaker={speaker} /><div className="spk-section-heading"><div><p className="spk-kicker">Deliverables</p><h3>Tasks and files</h3></div></div><TaskList speaker={speaker} tasks={tasks} announce={announce} /></section>
}

export function OrganizerSpeakers() {
  const { state, dispatch } = useApp(); const [query, setQuery] = useState(''); const [status, setStatus] = useState<'all'|SpeakerStatus>('all'); const [selectedId, setSelectedId] = useState(state.speakers[0]?.id ?? ''); const [announcement, setAnnouncement] = useState(''); const [newSpeaker, setNewSpeaker] = useState(blankSpeaker); const [csv, setCsv] = useState<ReturnType<typeof parseSpeakerCsv>>(); const [task, setTask] = useState({ title: '', instructions: '', dueAt: '', upload: false }); const [assignees, setAssignees] = useState<string[]>([])
  const speakers = useMemo(() => state.speakers.filter((item) => (status === 'all' || item.status === status) && `${speakerName(item)} ${item.email} ${item.company}`.toLowerCase().includes(query.toLowerCase())), [state.speakers, query, status]); const selected = state.speakers.find((item) => item.id === selectedId) ?? speakers[0]
  const add = (event: FormEvent) => { event.preventDefault(); if (state.speakers.some((item) => item.email.toLowerCase() === newSpeaker.email.toLowerCase())) return setAnnouncement('That email already belongs to a speaker.'); const speaker = createSpeaker(newSpeaker); dispatch({ type: 'speaker/create', speaker }); setSelectedId(speaker.id); setNewSpeaker(blankSpeaker); setAnnouncement('Speaker created.') }
  const importCsv = () => { if (!csv) return; const emails = new Set(state.speakers.map((item) => item.email.toLowerCase())); const unique = csv.speakers.filter((item) => !emails.has(item.email.toLowerCase()) && (emails.add(item.email.toLowerCase()) || true)); unique.forEach((input) => dispatch({ type: 'speaker/create', speaker: createSpeaker(input) })); setAnnouncement(`Imported ${unique.length} speakers; ${csv.speakers.length - unique.length} duplicates skipped.`) }
  const assign = (event: FormEvent) => { event.preventDefault(); const at = nowIso(); assignees.forEach((speakerId) => dispatch({ type: 'task/upsert', task: { id: createId('task'), speakerId, kind: task.upload ? 'supporting-document' : 'session-details', title: task.title.trim(), instructions: task.instructions.trim() || undefined, dueAt: new Date(task.dueAt).toISOString(), updatedAt: at }, at })); setAnnouncement(`Assigned task to ${assignees.length} speakers.`); setTask({ title: '', instructions: '', dueAt: '', upload: false }); setAssignees([]) }
  return <div className="speaker-admin"><div className="spk-page-head"><div><p className="spk-kicker">People</p><h1>Speaker CRM</h1><p>Create, import, filter, assign, and track speakers.</p></div><div className="spk-summary"><strong>{state.speakers.length}</strong><span>speakers</span></div></div><p className="spk-sr-live" role="status">{announcement}</p><details className="spk-tools"><summary>Add a speaker</summary><form className="spk-form" onSubmit={add}><div className="spk-form-grid">{(['firstName','lastName','email','company','jobTitle'] as const).map((field) => <label key={field}>{field}<input required={['firstName','lastName','email'].includes(field)} type={field === 'email' ? 'email' : 'text'} value={String(newSpeaker[field] ?? '')} onChange={(e) => setNewSpeaker({ ...newSpeaker, [field]: e.target.value })} /></label>)}</div><button className="spk-button spk-button-primary">Create speaker</button></form></details><details className="spk-tools"><summary>Import CSV</summary><label>CSV file<input type="file" accept=".csv,text/csv" onChange={async (e) => { const file=e.target.files?.[0]; if(file) setCsv(parseSpeakerCsv(await file.text())) }} /></label>{csv && <><p>{csv.speakers.length} valid rows. {csv.errors.length} errors.</p>{csv.errors.map((error) => <p key={error}>{error}</p>)}<button className="spk-button spk-button-primary" type="button" onClick={importCsv}>Import and deduplicate</button></>}</details><details className="spk-tools"><summary>Assign a task</summary><form className="spk-form" onSubmit={assign}><div className="spk-form-grid"><label>Task title<input required value={task.title} onChange={(e)=>setTask({...task,title:e.target.value})}/></label><label>Due date<input required type="datetime-local" value={task.dueAt} onChange={(e)=>setTask({...task,dueAt:e.target.value})}/></label></div><label>Instructions<textarea value={task.instructions} onChange={(e)=>setTask({...task,instructions:e.target.value})}/></label><label><input type="checkbox" checked={task.upload} onChange={(e)=>setTask({...task,upload:e.target.checked})}/> Requires a file upload</label><fieldset><legend>Assign to speakers</legend>{state.speakers.map((item)=><label key={item.id}><input type="checkbox" checked={assignees.includes(item.id)} onChange={(e)=>setAssignees(e.target.checked?[...assignees,item.id]:assignees.filter(id=>id!==item.id))}/>{speakerName(item)}</label>)}</fieldset><button className="spk-button spk-button-primary" disabled={!assignees.length}>Assign task</button></form></details><div className="spk-workspace"><aside className="spk-directory"><label className="spk-search">Search<input type="search" value={query} onChange={(e)=>setQuery(e.target.value)}/></label><label className="spk-search">Status<select value={status} onChange={(e)=>setStatus(e.target.value as typeof status)}><option value="all">All statuses</option>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><p className="spk-result-count">{speakers.length} speakers</p><div className="spk-directory-list">{speakers.map((item)=><button key={item.id} className={item.id===selected?.id?'is-selected':''} onClick={()=>setSelectedId(item.id)}><span className="spk-avatar">{item.firstName[0]}{item.lastName[0]}</span><span className="spk-person-copy"><strong>{speakerName(item)}</strong><small>{item.company||item.email}</small></span></button>)}</div></aside>{selected ? <SpeakerEditor key={selected.id} speaker={selected} announce={setAnnouncement}/> : <section className="spk-detail spk-empty">No speaker selected.</section>}</div></div>
}
