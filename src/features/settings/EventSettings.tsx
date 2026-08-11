import { useMemo, useRef, useState, type FormEvent } from 'react'
import { downloadCsv, downloadJson, submissionsToCsv, useApp } from '../../core'
import type { ResourcePage } from '../../domain/types'
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
  const { state, dispatch, reset, importJson, exportJson, persistenceMode, syncStatus } = useApp()
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
    resources[index] = { ...resources[index], ...patch }
    dispatch({ type: 'event/update', patch: { resources }, at: new Date().toISOString() })
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
        <section className="card"><div className="card-heading"><div><h2>Data portability</h2><p>Export, restore, or reset the complete dataset.</p></div></div><div className="button-stack"><button className="button secondary" onClick={() => downloadJson('openspeaker-backup.json', JSON.parse(exportJson()))}>Export JSON backup</button><button className="button secondary" onClick={() => downloadCsv('openspeaker-submissions.csv', submissionsToCsv(state))}>Export submissions CSV</button><button className="button secondary" onClick={() => importRef.current?.click()}>Import JSON backup</button><input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(e) => void importFile(e.target.files?.[0])}/><button className="button danger" onClick={() => { if (window.confirm('Reset all saved data to the demo dataset?')) { reset(); setMessage('Demo data restored.') } }}>Reset demo data</button></div></section>
        <section className="card"><div className="card-heading"><div><h2>Public endpoints</h2><p>Shareable static-host-compatible routes.</p></div></div><label>Public event URL<input readOnly value={publicUrl}/></label><button className="button secondary" onClick={() => navigator.clipboard.writeText(publicUrl).then(() => setMessage('Public URL copied.'))}>Copy public URL</button></section>
        <section className="card integration-list"><h2>Integration readiness</h2><div><b>Event repository</b><span className="status status-accepted">{persistenceMode === 'remote' ? 'D1 shared state' : 'local preview'}</span></div><div><b>Files</b><span className="status status-accepted">{persistenceMode === 'remote' ? 'private R2 storage' : 'metadata preview'}</span></div><div><b>Calendar</b><span className="status status-accepted">ICS export</span></div></section>
      </div>
    </div>
    <section className="card resource-editor"><div className="card-heading"><div><h2>Speaker resources and wiki</h2><p>Content appears in the participant portal. Embed URLs are allowlisted by the browser.</p></div></div>{(state.event.resources ?? []).map((resource, index) => <div className="resource-edit-row" key={resource.id}><input aria-label={`Resource ${index + 1} title`} value={resource.title} onChange={(e) => updateResource(index, { title: e.target.value })}/><textarea aria-label={`Resource ${index + 1} body`} rows={2} value={resource.body} onChange={(e) => updateResource(index, { body: e.target.value })}/><input aria-label={`Resource ${index + 1} embed URL`} placeholder="Optional https:// embed URL" value={resource.embedUrl ?? ''} onChange={(e) => updateResource(index, { embedUrl: e.target.value || undefined })}/></div>)}</section>
  </div>
}
