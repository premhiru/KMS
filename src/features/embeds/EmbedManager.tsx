import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, Clipboard, Code2, Eye, Plus, Search } from 'lucide-react'
import { createId, useApp } from '../../core'
import { PublicWidget, type PublicWidgetOptions, type PublicWidgetType } from '../public-event'
import { embedCode, embedFields, type EmbedDefinition, type EmbedFormat } from './types'
import './embeds.css'

const widgetLabels: Record<PublicWidgetType, string> = { sessions: 'Sessions list', speakers: 'Speakers list', agenda: 'Agenda', itinerary: 'Schedule itinerary', gallery: 'Speaker gallery' }
const formatLabels: Record<EmbedFormat, string> = { 'styled-html': 'Styled HTML iframe', 'basic-html': 'Basic HTML iframe', json: 'JSON feed', xml: 'XML feed', ical: 'iCal feed' }

function blankDefinition(): Omit<EmbedDefinition, 'id' | 'createdAt' | 'updatedAt'> {
  return { name: 'Website sessions', type: 'sessions', format: 'styled-html', enabled: true, accentColor: '#bdff70', backgroundColor: '#f7f6f1', customCss: '', visibleFields: [...embedFields] }
}

export function EmbedManager() {
  const { state, dispatch } = useApp()
  const embeds = state.event.embeds ?? []
  const [editing, setEditing] = useState<EmbedDefinition | undefined>()
  const [draft, setDraft] = useState(blankDefinition)
  const [query, setQuery] = useState('')
  const [codeFor, setCodeFor] = useState<EmbedDefinition>()
  const [preview, setPreview] = useState<EmbedDefinition>()
  const [copied, setCopied] = useState(false)
  const dialogTriggerRef = useRef<HTMLElement | null>(null)
  const baseUrl = `${window.location.origin}${window.location.pathname}`
  const filtered = embeds.filter((embed) => `${embed.name} ${embed.type} ${embed.format}`.toLowerCase().includes(query.toLowerCase()))
  const tracks = state.event.tracks
  const formats = [...new Set(state.submissions.map((submission) => submission.format))]
  const rooms = state.event.rooms

  useEffect(() => {
    if (!preview && !codeFor) return
    const dialog = document.querySelector<HTMLElement>('.embed-preview[role="dialog"],.embed-code-dialog[role="dialog"]')
    const controls = () => [...(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? [])]
    controls()[0]?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setPreview(undefined); setCodeFor(undefined); return }
      if (event.key !== 'Tab') return
      const items = controls()
      if (!items.length) return
      if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus() }
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus() }
    }
    window.addEventListener('keydown', keydown)
    return () => { window.removeEventListener('keydown', keydown); dialogTriggerRef.current?.focus() }
  }, [codeFor, preview])

  const commit = (next: EmbedDefinition[]) => dispatch({ type: 'event/update', patch: { embeds: next }, at: new Date().toISOString() })
  const startNew = () => { setEditing(undefined); setDraft(blankDefinition()) }
  const edit = (embed: EmbedDefinition) => { setEditing(embed); setDraft({ name: embed.name, type: embed.type, format: embed.format, enabled: embed.enabled, accentColor: embed.accentColor, backgroundColor: embed.backgroundColor, customCss: embed.customCss, track: embed.track, sessionFormat: embed.sessionFormat, room: embed.room, visibleFields: [...embed.visibleFields] }) }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const now = new Date().toISOString()
    const definition: EmbedDefinition = { ...draft, name: draft.name.trim(), id: editing?.id ?? createId('embed'), createdAt: editing?.createdAt ?? now, updatedAt: now }
    commit(editing ? embeds.map((item) => item.id === editing.id ? definition : item) : [...embeds, definition])
    setEditing(definition)
  }
  const generated = codeFor ? embedCode(baseUrl, state.event.name, codeFor, state.event.publicProgram?.embedHeight) : ''
  const optionsFor = (embed: EmbedDefinition): PublicWidgetOptions => ({ accentColor: embed.accentColor, backgroundColor: embed.backgroundColor, track: embed.track, format: embed.sessionFormat, room: embed.room, visibleFields: embed.visibleFields, compact: true })
  return <section className="embed-manager"><header className="feature-heading"><div><p>WEBSITE & DISTRIBUTION</p><h1>Embed manager</h1><span>Create named, live public widgets and retrieve HTML or feed output.</span></div><button className="feature-button primary" onClick={startNew}><Plus/>New embed</button></header><div className="embed-local-note" role="note"><strong>Saved in this browser.</strong> Widget definitions are local configuration metadata; rendered widgets read live published event data. Shared definition storage needs a backend embed endpoint.</div><div className="embed-manager-layout"><aside className="embed-list"><label><Search/><span className="sr-only">Search embeds</span><input placeholder="Search saved embeds" value={query} onChange={(event) => setQuery(event.target.value)}/></label>{filtered.map((embed) => <article key={embed.id} className={editing?.id === embed.id ? 'active' : ''}><button className="embed-list-main" onClick={() => edit(embed)}><strong>{embed.name}</strong><span>{widgetLabels[embed.type]} · {formatLabels[embed.format]}</span></button><label className="embed-enable"><input type="checkbox" checked={embed.enabled} onChange={(event) => commit(embeds.map((item) => item.id === embed.id ? { ...item, enabled: event.target.checked, updatedAt: new Date().toISOString() } : item))}/><span>{embed.enabled ? 'Enabled' : 'Disabled'}</span></label><div><button onClick={(event) => { dialogTriggerRef.current = event.currentTarget; setPreview(embed) }}><Eye/>Preview</button><button onClick={(event) => { dialogTriggerRef.current = event.currentTarget; setCodeFor(embed) }}><Code2/>Get code</button></div></article>)}{!filtered.length && <p>No saved embeds match.</p>}</aside><form className="embed-builder" onSubmit={submit}><h2>{editing ? `Edit ${editing.name}` : 'Create embed'}</h2><label>Name<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/></label><div className="embed-form-grid"><label>Widget type<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as PublicWidgetType })}>{Object.entries(widgetLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Output format<select value={draft.format} onChange={(event) => setDraft({ ...draft, format: event.target.value as EmbedFormat })}>{Object.entries(formatLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Accent color<input type="color" value={draft.accentColor} onChange={(event) => setDraft({ ...draft, accentColor: event.target.value })}/></label><label>Background color<input type="color" value={draft.backgroundColor} onChange={(event) => setDraft({ ...draft, backgroundColor: event.target.value })}/></label><label>Track filter<select value={draft.track ?? ''} onChange={(event) => setDraft({ ...draft, track: event.target.value || undefined })}><option value="">All tracks</option>{tracks.map((item) => <option key={item}>{item}</option>)}</select></label><label>Format filter<select value={draft.sessionFormat ?? ''} onChange={(event) => setDraft({ ...draft, sessionFormat: event.target.value || undefined })}><option value="">All formats</option>{formats.map((item) => <option key={item}>{item}</option>)}</select></label><label>Location filter<select value={draft.room ?? ''} onChange={(event) => setDraft({ ...draft, room: event.target.value || undefined })}><option value="">All locations</option>{rooms.map((item) => <option key={item}>{item}</option>)}</select></label></div><fieldset><legend>Visible fields</legend>{embedFields.map((item) => <label key={item}><input type="checkbox" checked={draft.visibleFields.includes(item)} onChange={(event) => setDraft({ ...draft, visibleFields: event.target.checked ? [...draft.visibleFields, item] : draft.visibleFields.filter((field) => field !== item) })}/>{item}</label>)}</fieldset><label>Custom CSS<textarea rows={4} placeholder=".public-chip { border-radius: 2px; }" value={draft.customCss} onChange={(event) => setDraft({ ...draft, customCss: event.target.value })}/><small>Stored with the definition for downstream hosts. The safe in-app preview applies colors and fields only.</small></label><label className="embed-builder-enabled"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}/>Enabled for distribution</label><button className="feature-button primary" type="submit">Save embed</button></form></div>{preview && <div className="embed-preview" role="dialog" aria-modal="true" aria-label={`Preview ${preview.name}`}><div><header><h2>Preview · {preview.name}</h2><button onClick={() => setPreview(undefined)}>Close</button></header>{preview.enabled ? <PublicWidget type={preview.type} options={optionsFor(preview)}/> : <p>This embed is disabled.</p>}</div></div>}{codeFor && <div className="embed-code-dialog" role="dialog" aria-modal="true" aria-label={`Code for ${codeFor.name}`}><div><h2>Get code · {codeFor.name}</h2><p>{formatLabels[codeFor.format]} · {codeFor.enabled ? 'enabled' : 'disabled'}</p><pre>{generated}</pre><div><button className="feature-button" onClick={() => setCodeFor(undefined)}>Close</button><button className="feature-button primary" onClick={() => navigator.clipboard.writeText(generated).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800) })}>{copied ? <Check/> : <Clipboard/>}{copied ? 'Copied' : 'Copy'}</button></div></div></div>}</section>
}
