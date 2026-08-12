import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { CalendarCheck, CalendarPlus, Check, ChevronLeft, Clipboard, Clock3, Code2, MapPin, Search, Star, X } from 'lucide-react'
import { agendaToIcs, downloadIcs, speakerName, useApp } from '../../core'
import type { AppState, PublicProgramConfig, Speaker } from '../../domain'
import { localDay, matchesSession, publicSessionRecords, publicSpeakerRecords, recordsForSpeaker, type PublicSessionRecord, type PublicWidgetType } from './public-model'
import './public-event.css'

export interface PublicWidgetOptions {
  accentColor?: string
  backgroundColor?: string
  track?: string
  format?: string
  room?: string
  visibleFields?: string[]
  compact?: boolean
}

const widgetLabels: Record<PublicWidgetType, string> = {
  sessions: 'Sessions list', speakers: 'Speakers list', agenda: 'Agenda', itinerary: 'Schedule itinerary', gallery: 'Speaker gallery',
}

function dayLabel(day: string, timezone: string, long = false) {
  return new Intl.DateTimeFormat(undefined, { timeZone: timezone, weekday: long ? 'long' : 'short', month: 'short', day: 'numeric' }).format(new Date(`${day}T12:00:00Z`))
}

function dateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, { timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function timeOnly(value: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function field(options: PublicWidgetOptions | undefined, value: string) {
  return !options?.visibleFields?.length || options.visibleFields.includes(value)
}

function SpeakerAvatar({ speaker }: { speaker: Speaker }) {
  return <div className="public-speaker-avatar">{speaker.photoUrl ? <img src={speaker.photoUrl} alt="" /> : <span aria-hidden="true">{speaker.firstName[0]}{speaker.lastName[0]}</span>}</div>
}

function Dialog({ label, children, onClose }: { label: string; children: ReactNode; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      if (!focusable.length) return
      if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus() }
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus() }
    }
    window.addEventListener('keydown', keydown)
    return () => { window.removeEventListener('keydown', keydown); prior?.focus() }
  }, [onClose])
  return <div className="public-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div ref={dialogRef} role="dialog" aria-modal="true" aria-label={label} className="public-dialog"><button ref={closeRef} className="public-dialog-close" aria-label={`Close ${label}`} onClick={onClose}><X /></button>{children}</div></div>
}

function SessionDetail({ record, state, onClose }: { record: PublicSessionRecord; state: AppState; onClose: () => void }) {
  const { session, submission, speakers } = record
  return <Dialog label={`${submission.title} details`} onClose={onClose}><span className="public-chip">{submission.track}</span><h2>{submission.title}</h2><p className="public-dialog-lede">{submission.abstract}</p><dl className="public-detail-list"><div><dt>Date and time</dt><dd>{dateTime(session.startAt, state.event.timezone)}–{timeOnly(session.endAt, state.event.timezone)}</dd></div><div><dt>Room</dt><dd>{session.room}</dd></div><div><dt>Format</dt><dd>{submission.format}</dd></div><div><dt>Track</dt><dd>{submission.track}</dd></div></dl><h3>Speakers</h3>{speakers.map((speaker) => <div className="public-inline-speaker" key={speaker.id}><SpeakerAvatar speaker={speaker}/><span><strong>{speakerName(speaker)}</strong><small>{speaker.jobTitle}{speaker.company ? ` · ${speaker.company}` : ''}</small></span></div>)}</Dialog>
}

function SpeakerDetail({ speaker, records, state, onClose }: { speaker: Speaker; records: PublicSessionRecord[]; state: AppState; onClose: () => void }) {
  const sessions = recordsForSpeaker(records, speaker.id)
  return <Dialog label={`${speakerName(speaker)} details`} onClose={onClose}><div className="public-speaker-detail-head"><SpeakerAvatar speaker={speaker}/><div><span className="public-chip">Speaker</span><h2>{speakerName(speaker)}</h2><p>{speaker.jobTitle}{speaker.company ? ` · ${speaker.company}` : ''}</p></div></div><p className="public-dialog-lede">{speaker.bio || 'Biography coming soon.'}</p><h3>Sessions ({sessions.length})</h3><div className="public-speaker-session-list">{sessions.map(({ session, submission }) => <article key={session.id}><strong>{submission.title}</strong><span>{dateTime(session.startAt, state.event.timezone)}–{timeOnly(session.endAt, state.event.timezone)} · {session.room}</span></article>)}</div></Dialog>
}

function RichSessionCard({ record, state, options, saved, onToggle, onOpen }: { record: PublicSessionRecord; state: AppState; options?: PublicWidgetOptions; saved?: boolean; onToggle?: () => void; onOpen?: () => void }) {
  const { session, submission, speakers } = record
  const [expanded, setExpanded] = useState(false)
  const descriptionLong = submission.abstract.length > 150
  return <article className="public-rich-session-card">
    <div className="public-card-top"><div>{field(options, 'track') && <span className="public-chip">{submission.track}</span>}{field(options, 'format') && <span className="public-chip neutral">{submission.format}</span>}</div>{onToggle && <button className={saved ? 'saved' : ''} aria-label={`${saved ? 'Remove from' : 'Add to'} itinerary: ${submission.title}`} onClick={onToggle}><Star fill={saved ? 'currentColor' : 'none'}/></button>}</div>
    <button className="public-card-title" onClick={onOpen}><h3>{submission.title}</h3></button>
    {field(options, 'description') && <div className="public-card-description"><p>{expanded || !descriptionLong ? submission.abstract : `${submission.abstract.slice(0, 150).trim()}…`}</p>{descriptionLong && <button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'Show more'}</button>}</div>}
    <div className="public-card-facts">{field(options, 'dateTime') && <span><Clock3/>{dateTime(session.startAt, state.event.timezone)}–{timeOnly(session.endAt, state.event.timezone)}</span>}{field(options, 'room') && <span><MapPin/>{session.room}</span>}</div>
    {field(options, 'speakers') && <div className="public-card-speakers">{speakers.map((speaker) => <div key={speaker.id}><SpeakerAvatar speaker={speaker}/><span><strong>{speakerName(speaker)}</strong><small>{speaker.jobTitle}{speaker.company ? ` · ${speaker.company}` : ''}</small></span></div>)}</div>}
  </article>
}

function SessionsWidget({ records, state, options }: { records: PublicSessionRecord[]; state: AppState; options?: PublicWidgetOptions }) {
  const [query, setQuery] = useState('')
  const [track, setTrack] = useState(options?.track ?? 'all')
  const [format, setFormat] = useState(options?.format ?? 'all')
  const [room, setRoom] = useState(options?.room ?? 'all')
  const [selected, setSelected] = useState<PublicSessionRecord>()
  const tracks = [...new Set(records.map((item) => item.submission.track))]
  const formats = [...new Set(records.map((item) => item.submission.format))]
  const rooms = [...new Set(records.map((item) => item.session.room))]
  const filtered = records.filter((record) => matchesSession(record, query) && (track === 'all' || record.submission.track === track) && (format === 'all' || record.submission.format === format) && (room === 'all' || record.session.room === room))
  return <section className="public-widget" aria-labelledby="sessions-widget-title"><WidgetHeading eyebrow="EXPLORE THE PROGRAM" id="sessions-widget-title" title="Sessions list" description={`${filtered.length} of ${records.length} sessions`} /><div className="public-widget-filters"><label><Search/><span className="sr-only">Search sessions or speakers</span><input placeholder="Search titles or speakers" value={query} onChange={(event) => setQuery(event.target.value)}/></label><select aria-label="Filter sessions by track" value={track} onChange={(event) => setTrack(event.target.value)}><option value="all">All tracks</option>{tracks.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter sessions by format" value={format} onChange={(event) => setFormat(event.target.value)}><option value="all">All formats</option>{formats.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter sessions by location" value={room} onChange={(event) => setRoom(event.target.value)}><option value="all">All locations</option>{rooms.map((item) => <option key={item}>{item}</option>)}</select></div><p className="public-result-count" aria-live="polite">Showing {filtered.length} session{filtered.length === 1 ? '' : 's'}</p><div className="public-card-grid">{filtered.map((record) => <RichSessionCard key={record.session.id} record={record} state={state} options={options} onOpen={() => setSelected(record)}/>)}</div>{!filtered.length && <Empty/>}{selected && <SessionDetail record={selected} state={state} onClose={() => setSelected(undefined)}/>}</section>
}

function SpeakersWidget({ records, state, gallery = false }: { records: PublicSessionRecord[]; state: AppState; gallery?: boolean }) {
  const speakers = publicSpeakerRecords(records)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Speaker>()
  const filtered = speakers.filter((speaker) => `${speaker.firstName} ${speaker.lastName}`.toLowerCase().includes(query.toLowerCase()))
  return <section className="public-widget" aria-labelledby={gallery ? 'gallery-widget-title' : 'speakers-widget-title'}><WidgetHeading eyebrow={gallery ? 'MEET THE PEOPLE' : 'SPEAKER DIRECTORY'} id={gallery ? 'gallery-widget-title' : 'speakers-widget-title'} title={gallery ? 'Speaker gallery' : 'Speakers list'} description={`${filtered.length} confirmed speaker${filtered.length === 1 ? '' : 's'}, alphabetized by surname`} /><div className="public-widget-filters"><label><Search/><span className="sr-only">Search speakers by name</span><input placeholder="Search speaker name" value={query} onChange={(event) => setQuery(event.target.value)}/></label></div><div className={gallery ? 'public-gallery-grid' : 'public-speaker-list'}>{filtered.map((speaker) => <button key={speaker.id} className="public-speaker-card" onClick={() => setSelected(speaker)}><SpeakerAvatar speaker={speaker}/><span><strong>{speakerName(speaker)}</strong><small>{speaker.jobTitle || 'Speaker'}{speaker.company ? ` · ${speaker.company}` : ''}</small>{!gallery && <p>{speaker.bio || 'Biography coming soon.'}</p>}</span></button>)}</div>{!filtered.length && <Empty/>}{selected && <SpeakerDetail speaker={selected} records={records} state={state} onClose={() => setSelected(undefined)}/>}</section>
}

function AgendaWidget({ records, state }: { records: PublicSessionRecord[]; state: AppState }) {
  const days = useMemo(() => [...new Set(records.map((record) => localDay(record.session.startAt, state.event.timezone)))], [records, state.event.timezone])
  const [day, setDay] = useState(days[0] ?? '')
  const [selected, setSelected] = useState<PublicSessionRecord>()
  useEffect(() => { if (days.length && !days.includes(day)) setDay(days[0]) }, [day, days])
  const current = records.filter((record) => localDay(record.session.startAt, state.event.timezone) === day)
  const times = [...new Set(current.map((record) => timeOnly(record.session.startAt, state.event.timezone)))]
  return <section className="public-widget" aria-labelledby="agenda-widget-title"><WidgetHeading eyebrow="LIVE SCHEDULE" id="agenda-widget-title" title="Agenda" description="Browse the program by day, time, and room."/><DayTabs days={days} selected={day} timezone={state.event.timezone} onSelect={setDay}/><div className="public-agenda-grid">{times.map((time) => <section key={time}><h3>{time}</h3><div>{current.filter((record) => timeOnly(record.session.startAt, state.event.timezone) === time).map((record) => <button key={record.session.id} onClick={() => setSelected(record)}><span>{record.session.room}</span><strong>{record.submission.title}</strong><small>{record.submission.track} · {record.submission.format}</small></button>)}</div></section>)}</div>{!current.length && <Empty/>}{selected && <SessionDetail record={selected} state={state} onClose={() => setSelected(undefined)}/>}</section>
}

function ItineraryWidget({ records, state }: { records: PublicSessionRecord[]; state: AppState }) {
  const storageKey = `openspeaker:itinerary:${state.event.id}`
  const [saved, setSaved] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(storageKey) ?? '[]') as string[] } catch { return [] } })
  const [mine, setMine] = useState(false)
  const [message, setMessage] = useState('')
  const days = useMemo(() => [...new Set(records.map((record) => localDay(record.session.startAt, state.event.timezone)))], [records, state.event.timezone])
  const [day, setDay] = useState(days[0] ?? '')
  const [selected, setSelected] = useState<PublicSessionRecord>()
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(saved)) } catch { /* optional browser preference */ } }, [saved, storageKey])
  useEffect(() => { if (days.length && !days.includes(day)) setDay(days[0]) }, [day, days])
  const visible = records.filter((record) => localDay(record.session.startAt, state.event.timezone) === day && (!mine || saved.includes(record.session.id)))
  const exportCalendar = () => {
    const selectedSessions = records.filter((record) => saved.includes(record.session.id)).map((record) => record.session)
    if (!selectedSessions.length) return
    downloadIcs(`${state.event.slug}-my-itinerary.ics`, agendaToIcs({ ...state, sessions: selectedSessions }))
    setMessage(`Exported ${selectedSessions.length} selected session${selectedSessions.length === 1 ? '' : 's'} to one calendar file.`)
  }
  return <section className="public-widget" aria-labelledby="itinerary-widget-title"><WidgetHeading eyebrow="PLAN YOUR DAY" id="itinerary-widget-title" title="Schedule itinerary" description="Save sessions on this device and export your selections together."/><div className="public-itinerary-actions"><button aria-pressed={mine} className={mine ? 'active' : ''} onClick={() => setMine(!mine)}><CalendarCheck/>My itinerary ({saved.length})</button><button disabled={!saved.length} onClick={exportCalendar}><CalendarPlus/>Export selected (.ics)</button></div>{message && <p className="public-status" role="status">{message}</p>}<DayTabs days={days} selected={day} timezone={state.event.timezone} onSelect={setDay}/><div className="public-itinerary-list">{visible.map((record) => { const isSaved = saved.includes(record.session.id); return <RichSessionCard key={record.session.id} record={record} state={state} saved={isSaved} onToggle={() => setSaved(isSaved ? saved.filter((id) => id !== record.session.id) : [...saved, record.session.id])} onOpen={() => setSelected(record)}/> })}</div>{!visible.length && <Empty text={mine ? 'No saved sessions on this day.' : undefined}/>} {selected && <SessionDetail record={selected} state={state} onClose={() => setSelected(undefined)}/>}</section>
}

function DayTabs({ days, selected, timezone, onSelect }: { days: string[]; selected: string; timezone: string; onSelect: (day: string) => void }) {
  return <div className="public-day-tabs" role="group" aria-label="Event days">{days.map((day) => <button key={day} aria-pressed={selected === day} className={selected === day ? 'active' : ''} onClick={() => onSelect(day)}>{dayLabel(day, timezone, true)}</button>)}</div>
}

function WidgetHeading({ eyebrow, id, title, description }: { eyebrow: string; id: string; title: string; description: string }) {
  return <header className="public-widget-heading"><span>{eyebrow}</span><h2 id={id}>{title}</h2><p>{description}</p></header>
}

function Empty({ text = 'No published content matches these filters.' }: { text?: string }) { return <div className="public-empty">{text}</div> }

export function PublicWidget({ type, options }: { type: PublicWidgetType; options?: PublicWidgetOptions }) {
  const { state } = useApp()
  const records = useMemo(() => publicSessionRecords(state).filter((record) => (!options?.track || record.submission.track === options.track) && (!options?.format || record.submission.format === options.format) && (!options?.room || record.session.room === options.room)), [options?.format, options?.room, options?.track, state])
  const style = { '--public-accent': options?.accentColor ?? '#bdff70', '--public-surface': options?.backgroundColor ?? '#f7f6f1' } as CSSProperties
  return <div className={`public-widget-frame ${options?.compact ? 'compact' : ''}`} style={style}>{type === 'sessions' && <SessionsWidget records={records} state={state} options={options}/>} {type === 'speakers' && <SpeakersWidget records={records} state={state}/>} {type === 'agenda' && <AgendaWidget records={records} state={state}/>} {type === 'itinerary' && <ItineraryWidget records={records} state={state}/>} {type === 'gallery' && <SpeakersWidget records={records} state={state} gallery/>}</div>
}

function requestedWidget(): PublicWidgetType {
  const value = window.location.hash.split('/')[2]
  if (value === 'sessions' || value === 'speakers' || value === 'agenda' || value === 'itinerary' || value === 'gallery') return value
  if (value === 'list') return 'sessions'
  if (value === 'day' || value === 'week' || value === 'track' || value === 'room') return 'agenda'
  return 'itinerary'
}

function optionsFromUrl(): PublicWidgetOptions {
  const params = new URLSearchParams(window.location.search)
  return {
    accentColor: params.get('accent') || undefined,
    backgroundColor: params.get('background') || undefined,
    track: params.get('track') || undefined,
    format: params.get('sessionFormat') || undefined,
    room: params.get('room') || undefined,
    visibleFields: params.get('fields')?.split(',').filter(Boolean),
    compact: params.has('embed'),
  }
}

function xmlEscape(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

function PublicFeed({ format, options }: { format: 'json' | 'xml' | 'ical'; options: PublicWidgetOptions }) {
  const { state } = useApp()
  const records = publicSessionRecords(state).filter((record) => (!options.track || record.submission.track === options.track) && (!options.format || record.submission.format === options.format) && (!options.room || record.session.room === options.room))
  const serializable = records.map(({ session, submission, speakers }) => ({ id: session.id, title: submission.title, description: submission.abstract, startAt: session.startAt, endAt: session.endAt, room: session.room, track: submission.track, format: submission.format, speakers: speakers.map((speaker) => ({ name: speakerName(speaker), jobTitle: speaker.jobTitle, company: speaker.company })) }))
  const ics = agendaToIcs({ ...state, sessions: records.map((record) => record.session) })
  const body = format === 'json'
    ? JSON.stringify({ event: { name: state.event.name, slug: state.event.slug }, sessions: serializable }, null, 2)
    : format === 'xml'
      ? `<?xml version="1.0" encoding="UTF-8"?>\n<event name="${xmlEscape(state.event.name)}">\n${serializable.map((session) => `  <session id="${xmlEscape(session.id)}"><title>${xmlEscape(session.title)}</title><description>${xmlEscape(session.description)}</description><start>${session.startAt}</start><end>${session.endAt}</end><room>${xmlEscape(session.room)}</room><track>${xmlEscape(session.track)}</track><format>${xmlEscape(session.format)}</format>${session.speakers.map((speaker) => `<speaker><name>${xmlEscape(speaker.name)}</name><title>${xmlEscape(speaker.jobTitle)}</title><company>${xmlEscape(speaker.company)}</company></speaker>`).join('')}</session>`).join('\n')}\n</event>`
      : ics
  return <main className="public-feed"><header><h1>{state.event.name} · {format.toUpperCase()} feed</h1><p>{records.length} published sessions · live public state</p>{format === 'ical' && <button onClick={() => downloadIcs(`${state.event.slug}.ics`, ics)}>Download .ics</button>}</header><pre>{body}</pre></main>
}

export function PublicEvent() {
  const { state } = useApp()
  const program: PublicProgramConfig = state.event.publicProgram ?? { defaultView: 'day', enabledViews: ['list', 'day', 'week', 'track', 'room'], showSpeakers: true, showItinerary: true, showCalendarDownloads: true, embedHeight: 720 }
  const [surface, setSurface] = useState<PublicWidgetType>(requestedWidget)
  const [showEmbed, setShowEmbed] = useState(false)
  const [copied, setCopied] = useState(false)
  const origin = `${window.location.origin}${window.location.pathname}`
  const quickEmbedUrl = new URL(origin)
  quickEmbedUrl.searchParams.set('embed', 'quick')
  quickEmbedUrl.hash = `/event/${surface}`
  const embedCode = `<iframe src="${quickEmbedUrl}" title="${state.event.name} ${widgetLabels[surface]}" width="100%" height="${program.embedHeight}" style="border:0" loading="lazy"></iframe>`
  const eventDates = `${new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', timeZone: state.event.timezone }).format(new Date(state.event.startAt))}–${new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', timeZone: state.event.timezone }).format(new Date(state.event.endAt))}`
  useEffect(() => {
    const syncSurface = () => setSurface(requestedWidget())
    window.addEventListener('hashchange', syncSurface)
    return () => window.removeEventListener('hashchange', syncSurface)
  }, [])
  const copyEmbed = async () => { try { await navigator.clipboard.writeText(embedCode); setCopied(true); window.setTimeout(() => setCopied(false), 1800) } catch { setCopied(false) } }
  const navigate = (next: PublicWidgetType) => { setSurface(next); window.location.hash = `/event/${next}` }
  const params = new URLSearchParams(window.location.search)
  const output = params.get('output')
  const options = optionsFromUrl()
  if (output === 'json' || output === 'xml' || output === 'ical') return params.get('enabled') === '0' ? <main className="public-feed"><h1>Widget disabled</h1></main> : <PublicFeed format={output} options={options}/>
  if (params.has('embed')) return params.get('enabled') === '0' ? <main className="public-feed"><h1>Widget disabled</h1></main> : <PublicWidget type={surface} options={options}/>
  return <div className="public-event-feature"><nav className="event-nav"><a className="event-brand" href="#/event"><strong>OPEN<span>SPEAKER</span></strong></a><button className="public-back" onClick={() => window.history.back()}><ChevronLeft/>Back</button><div>{(Object.keys(widgetLabels) as PublicWidgetType[]).map((item) => <button key={item} className={surface === item ? 'active' : ''} aria-current={surface === item ? 'page' : undefined} onClick={() => navigate(item)}>{widgetLabels[item]}</button>)}<button aria-expanded={showEmbed} aria-controls="public-embed-panel" onClick={() => setShowEmbed(!showEmbed)}><Code2/>Embed</button></div></nav><header className="event-hero"><div><span>{eventDates.toUpperCase()} · {state.event.venue.toUpperCase()}</span><h1>{state.event.name}</h1><p>{state.event.description ?? 'Meet the speakers and explore the published program.'}</p></div></header>{showEmbed && <section className="embed-panel" id="public-embed-panel"><div><Code2/><h2>Embed this {widgetLabels[surface].toLowerCase()}</h2><p>This live iframe renders the selected public widget.</p></div><pre>{embedCode}</pre><button onClick={copyEmbed}>{copied ? <Check/> : <Clipboard/>}{copied ? 'Copied' : 'Copy embed code'}</button></section>}<PublicWidget type={surface}/></div>
}
