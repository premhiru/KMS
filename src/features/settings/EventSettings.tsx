import { useMemo, useRef, useState, type FormEvent } from 'react'
import { createId, downloadCsv, downloadJson, nowIso, submissionsToCsv, useApp } from '../../core'
import type { ApprovalStatus, ResourceFile, ResourcePage } from '../../domain/types'
import './settings.css'

function dateTimeInput(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}

function zonedDateTime(value: string, timeZone: string): string {
  const [date, time] = value.split('T')
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const desired = Date.UTC(year, month - 1, day, hour, minute)
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(desired))
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0)
  const rendered = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'))
  return new Date(desired - (rendered - desired)).toISOString()
}

export function EventSettings() {
  const { state, dispatch, reset, importJson, exportJson, persistenceMode, syncStatus, uploadAsset } = useApp()
  const [message, setMessage] = useState('')
  const [draft, setDraft] = useState(() => ({ name: state.event.name, slug: state.event.slug, venue: state.event.venue, timezone: state.event.timezone, startAt: dateTimeInput(state.event.startAt, state.event.timezone), endAt: dateTimeInput(state.event.endAt, state.event.timezone), rooms: state.event.rooms.join(', '), tracks: state.event.tracks.join(', '), description: state.event.description ?? '' }))
  const importRef = useRef<HTMLInputElement>(null)
  const publicUrl = useMemo(() => `${window.location.origin}${window.location.pathname}#/event`, [])

  function save(event: FormEvent) {
    event.preventDefault()
    dispatch({ type: 'event/update', patch: { ...draft, startAt: zonedDateTime(draft.startAt, draft.timezone), endAt: zonedDateTime(draft.endAt, draft.timezone), rooms: draft.rooms.split(',').map((item) => item.trim()).filter(Boolean), tracks: draft.tracks.split(',').map((item) => item.trim()).filter(Boolean) }, at: new Date().toISOString() })
    setMessage('Event configuration saved.')
  }

  async function importFile(file?: File) {
    if (!file) return
    const result = importJson(await file.text())
    setMessage(result.ok ? 'State imported and persisted.' : result.errors.join(' '))
    if (result.ok) window.setTimeout(() => window.location.reload(), 250)
  }

  function updateResource(index: number, patch: Partial<ResourcePage>) {
    const resources = [...(state.event.resources ?? [])]
    const contentChanged = patch.title !== undefined || patch.body !== undefined || patch.embedUrl !== undefined
    resources[index] = { ...resources[index], ...patch, version: contentChanged ? (resources[index].version ?? 0) + 1 : resources[index].version, approvalStatus: contentChanged ? 'draft' : (patch.approvalStatus ?? resources[index].approvalStatus), updatedAt: nowIso() }
    dispatch({ type: 'event/update', patch: { resources }, at: new Date().toISOString() })
  }

  async function addResourceFile(index: number, file?: File) {
    if (!file) return
    const at = nowIso()
    let resourceFile: ResourceFile
    try {
      if (persistenceMode === 'remote') {
        const uploaded = await uploadAsset(file)
        resourceFile = { id: createId('resource-file'), name: uploaded.fileName, assetId: uploaded.id, contentType: uploaded.contentType, size: uploaded.sizeBytes, version: 1, approvalStatus: 'pending', uploadedAt: uploaded.createdAt }
      } else resourceFile = { id: createId('resource-file'), name: file.name, contentType: file.type || 'application/octet-stream', size: file.size, version: 1, approvalStatus: 'pending', uploadedAt: at }
      const resource = (state.event.resources ?? [])[index]
      updateResource(index, { files: [...(resource.files ?? []), resourceFile] })
      setMessage(`${file.name} ${persistenceMode === 'remote' ? 'uploaded' : 'recorded for preview'} and awaits approval.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Resource file upload failed.') }
  }

  return <div className="feature-page settings-page">
    <div className="feature-heading"><div><span className="eyebrow">EVENT CONFIGURATION</span><h1>Settings and data</h1><p>Configure the event and control its {persistenceMode === 'remote' ? 'shared, revisioned workspace' : 'browser-local preview dataset'}.</p></div><span className={`integration-chip ${syncStatus === 'saved' ? 'success' : ''}`}>● {persistenceMode === 'remote' ? `Shared persistence ${syncStatus}` : 'Local preview persistence'}</span></div>
    {message && <div className="alert success" role="status">{message}</div>}
    <div className="settings-grid">
      <form className="card settings-form" onSubmit={save}><div className="card-heading"><div><h2>Event details</h2><p>Used across the CFP, portal, agenda, and public pages.</p></div></div>
        <label>Event name<input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}/></label>
        <div className="form-grid"><label>Public slug<input required readOnly={persistenceMode === 'remote'} value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })}/>{persistenceMode === 'remote' && <small>Managed as a stable production route.</small>}</label><label>Venue<input required value={draft.venue} onChange={(e) => setDraft({ ...draft, venue: e.target.value })}/></label></div>
        <label>Description<textarea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })}/></label>
        <div className="form-grid"><label>Starts<input type="datetime-local" required value={draft.startAt} onChange={(e) => setDraft({ ...draft, startAt: e.target.value })}/></label><label>Ends<input type="datetime-local" required value={draft.endAt} onChange={(e) => setDraft({ ...draft, endAt: e.target.value })}/></label></div>
        <label>Timezone<input required value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}/></label>
        <label>Rooms (comma separated)<input required value={draft.rooms} onChange={(e) => setDraft({ ...draft, rooms: e.target.value })}/></label>
        <label>Tracks (comma separated)<textarea rows={2} required value={draft.tracks} onChange={(e) => setDraft({ ...draft, tracks: e.target.value })}/></label>
        <button className="button primary" type="submit">Save event</button>
      </form>
      <div className="settings-side">
        <section className="card"><div className="card-heading"><div><h2>Data portability</h2><p>Export or restore the complete dataset. Hosted revision rollback is available through the operations API.</p></div></div><div className="button-stack"><button className="button secondary" onClick={() => downloadJson('openspeaker-backup.json', JSON.parse(exportJson()))}>Export JSON backup</button><button className="button secondary" onClick={() => downloadCsv('openspeaker-submissions.csv', submissionsToCsv(state))}>Export submissions CSV</button><button className="button secondary" onClick={() => importRef.current?.click()}>Import JSON backup</button><input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(e) => void importFile(e.target.files?.[0])}/>{persistenceMode === 'local' && <button className="button danger" onClick={() => { if (window.confirm('Reset this local preview to the sample dataset?')) { reset(); setMessage('Local preview data restored.') } }}>Reset local preview</button>}</div></section>
        <section className="card"><div className="card-heading"><div><h2>Public endpoints</h2><p>Shareable static-host-compatible routes.</p></div></div><label>Public event URL<input readOnly value={publicUrl}/></label><button className="button secondary" onClick={() => navigator.clipboard.writeText(publicUrl).then(() => setMessage('Public URL copied.'))}>Copy public URL</button></section>
        <section className="card integration-list"><h2>Integration readiness</h2><div><b>Event repository</b><span className="status status-accepted">{persistenceMode === 'remote' ? 'D1 shared state' : 'local preview'}</span></div><div><b>Files</b><span className="status status-accepted">{persistenceMode === 'remote' ? 'private R2 storage' : 'metadata preview'}</span></div><div><b>Calendar</b><span className="status status-accepted">ICS export</span></div></section>
      </div>
    </div>
    <section className="card resource-editor"><div className="card-heading"><div><h2>Speaker resources, wiki, and files</h2><p>Versioned content appears in the participant portal only after approval. Embed URLs are HTTPS-only in the portal.</p></div><button className="button secondary" type="button" onClick={() => dispatch({ type: 'event/update', patch: { resources: [...(state.event.resources ?? []), { id: createId('resource'), title: 'New resource', body: '', version: 1, approvalStatus: 'draft', updatedAt: nowIso(), files: [] }] }, at: nowIso() })}>Add resource</button></div>{(state.event.resources ?? []).map((resource, index) => <article className="resource-edit-row" key={resource.id}><div className="resource-version"><strong>v{resource.version ?? 1}</strong><select aria-label={`Approval for ${resource.title}`} value={resource.approvalStatus ?? 'draft'} onChange={(event) => updateResource(index, { approvalStatus: event.target.value as ApprovalStatus })}><option value="draft">Draft</option><option value="pending">Pending review</option><option value="approved">Approved</option><option value="changes-requested">Changes requested</option><option value="archived">Archived</option></select></div><input aria-label={`Resource ${index + 1} title`} value={resource.title} onChange={(e) => updateResource(index, { title: e.target.value })}/><textarea aria-label={`Resource ${index + 1} body`} rows={3} value={resource.body} onChange={(e) => updateResource(index, { body: e.target.value })}/><input aria-label={`Resource ${index + 1} embed URL`} placeholder="Optional https:// embed URL" value={resource.embedUrl ?? ''} onChange={(e) => updateResource(index, { embedUrl: e.target.value || undefined })}/><div className="resource-files">{(resource.files ?? []).map((file) => <div key={file.id}><span><strong>{file.name}</strong><small>v{file.version} · {file.approvalStatus} · {Math.ceil(file.size / 1024)} KB</small></span><select aria-label={`Approval for ${file.name}`} value={file.approvalStatus} onChange={(event) => updateResource(index, { files: resource.files?.map((item) => item.id === file.id ? { ...item, approvalStatus: event.target.value as ApprovalStatus, approvedAt: event.target.value === 'approved' ? nowIso() : undefined } : item) })}><option value="pending">Pending</option><option value="approved">Approved</option><option value="changes-requested">Changes requested</option><option value="archived">Archived</option></select></div>)}<label className="button secondary">Attach file<input hidden type="file" onChange={(event) => { void addResourceFile(index, event.target.files?.[0]); event.target.value = '' }} /></label></div></article>)}</section>
    <PublicProgramSettings />
  </div>
}

function PublicProgramSettings() {
  const { state, dispatch } = useApp()
  const config = state.event.publicProgram ?? { defaultView: 'day' as const, enabledViews: ['list', 'day', 'week', 'track', 'room'] as const, showSpeakers: true, showItinerary: true, showCalendarDownloads: true, embedHeight: 720 }
  const views = ['list', 'day', 'week', 'track', 'room'] as const
  const update = (patch: Partial<typeof config>) => dispatch({ type: 'event/update', patch: { publicProgram: { ...config, ...patch, enabledViews: [...config.enabledViews] } }, at: nowIso() })
  return <section className="card public-program-settings"><div className="card-heading"><div><h2>Public schedule and embed</h2><p>Choose attendee views and itinerary/calendar behavior used by the public page and iframe.</p></div></div><div className="form-grid"><label>Default view<select value={config.defaultView} onChange={(event) => update({ defaultView: event.target.value as typeof config.defaultView })}>{views.filter((view) => config.enabledViews.includes(view)).map((view) => <option key={view}>{view}</option>)}</select></label><label>Embed height<input min="400" max="1600" type="number" value={config.embedHeight} onChange={(event) => update({ embedHeight: Number(event.target.value) })} /></label></div><fieldset><legend>Enabled views</legend>{views.map((view) => <label key={view}><input type="checkbox" checked={config.enabledViews.includes(view)} onChange={(event) => update({ enabledViews: event.target.checked ? [...config.enabledViews, view] : config.enabledViews.filter((item) => item !== view) })} />{view}</label>)}</fieldset><div className="public-program-flags"><label><input type="checkbox" checked={config.showSpeakers} onChange={(event) => update({ showSpeakers: event.target.checked })} />Speaker gallery</label><label><input type="checkbox" checked={config.showItinerary} onChange={(event) => update({ showItinerary: event.target.checked })} />Personal itinerary</label><label><input type="checkbox" checked={config.showCalendarDownloads} onChange={(event) => update({ showCalendarDownloads: event.target.checked })} />Per-session calendar downloads</label></div></section>
}
