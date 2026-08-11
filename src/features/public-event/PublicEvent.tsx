import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck, CalendarPlus, Check, Clipboard, Clock3, Code2, MapPin, Search, Star, Users } from 'lucide-react'
import { agendaToIcs, downloadIcs, selectSubmissionSpeakers, speakerName, useApp } from '../../core'
import type { PublicProgramConfig, Session } from '../../domain'
import './public-event.css'

function eventTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

export function PublicEvent() {
  const { state } = useApp()
  const program: PublicProgramConfig = state.event.publicProgram ?? { defaultView: 'day', enabledViews: ['list', 'day', 'week', 'track', 'room'], showSpeakers: true, showItinerary: true, showCalendarDownloads: true, embedHeight: 720 }
  const hashView = window.location.hash.split('/')[2] as PublicProgramConfig['defaultView'] | undefined
  const [view, setView] = useState<PublicProgramConfig['defaultView']>(hashView && program.enabledViews.includes(hashView) ? hashView : program.defaultView)
  const itineraryKey = `openspeaker:itinerary:${state.event.id}`
  const [search, setSearch] = useState('')
  const [track, setTrack] = useState('all')
  const [room, setRoom] = useState('all')
  const [itineraryOnly, setItineraryOnly] = useState(false)
  const [itinerary, setItinerary] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(itineraryKey) ?? '[]') as string[] } catch { return [] } })
  const [showEmbed, setShowEmbed] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => { try { localStorage.setItem(itineraryKey, JSON.stringify(itinerary)) } catch { /* Optional device preference. */ } }, [itinerary, itineraryKey])
  const publicSessions = useMemo(() => state.sessions.filter((session) => session.published && state.submissions.find((item) => item.id === session.submissionId)?.status === 'accepted').sort((left, right) => left.startAt.localeCompare(right.startAt)), [state.sessions, state.submissions])
  const publicSubmissionIds = new Set(publicSessions.map((session) => session.submissionId))
  const publicSpeakerIds = new Set(state.submissions.filter((submission) => submission.status === 'accepted' && publicSubmissionIds.has(submission.id)).flatMap((submission) => submission.speakerIds))
  const publicSpeakers = state.speakers.filter((speaker) => speaker.status === 'confirmed' && publicSpeakerIds.has(speaker.id))
  const tracks = [...new Set(publicSessions.map((session) => state.submissions.find((submission) => submission.id === session.submissionId)?.track).filter((value): value is string => Boolean(value)))]
  const rooms = [...new Set(publicSessions.map((session) => session.room))]
  const filteredSessions = publicSessions.filter((session) => {
    const submission = state.submissions.find((item) => item.id === session.submissionId)
    const speakers = selectSubmissionSpeakers(state, session.submissionId).map(speakerName).join(' ')
    return `${submission?.title ?? ''} ${submission?.abstract ?? ''} ${speakers}`.toLowerCase().includes(search.toLowerCase()) && (track === 'all' || submission?.track === track) && (room === 'all' || session.room === room) && (!itineraryOnly || itinerary.includes(session.id))
  })
  const origin = `${window.location.origin}${window.location.pathname}`
  const embedCode = `<iframe src="${origin}#/event/${program.defaultView}" title="${state.event.name} agenda" width="100%" height="${program.embedHeight}" style="border:0" loading="lazy"></iframe>`
  const eventDates = `${new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', timeZone: state.event.timezone }).format(new Date(state.event.startAt))}–${new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', timeZone: state.event.timezone }).format(new Date(state.event.endAt))}`

  async function copyEmbed() { try { await navigator.clipboard.writeText(embedCode); setCopied(true); window.setTimeout(() => setCopied(false), 1800) } catch { setCopied(false) } }
  function downloadSession(session: Session) { downloadIcs(`${state.event.slug}-${session.id}.ics`, agendaToIcs({ ...state, sessions: [session] })) }

  return <div className="public-event-feature">
    <nav className="event-nav"><strong>OPEN<span>SPEAKER</span></strong><div>{program.showSpeakers && <a href="#event-speakers">Speakers</a>}<a href="#event-agenda">Agenda</a><button aria-expanded={showEmbed} aria-controls="public-embed-panel" onClick={() => setShowEmbed(!showEmbed)}><Code2 size={15}/>Embed</button></div></nav>
    <header className="event-hero"><div><span>{eventDates.toUpperCase()} · {state.event.venue.toUpperCase()}</span><h1>{state.event.name}</h1><p>{state.event.description ?? 'Meet the speakers and explore the published program.'}</p><a href="#event-agenda">Explore the program</a></div><div className="hero-stat"><b>{publicSessions.length}</b><span>published sessions</span><b>{publicSpeakers.length}</b><span>confirmed speakers</span></div></header>
    {showEmbed && <section className="embed-panel" id="public-embed-panel"><div><Code2/><h2>Embed this public agenda</h2><p>Paste this iframe into an event site. It reads the shared published schedule.</p></div><pre>{embedCode}</pre><button onClick={copyEmbed}>{copied ? <Check size={16}/> : <Clipboard size={16}/>} {copied ? 'Copied' : 'Copy embed code'}</button></section>}
    {program.showSpeakers && <section className="public-speaker-section" id="event-speakers"><div className="public-section-title"><span>FEATURED SPEAKERS</span><h2>Learn from builders<br/>doing the work.</h2></div><div className="public-speaker-grid">{publicSpeakers.map((speaker, index) => <article key={speaker.id}><div className={`speaker-portrait portrait-${index % 4}`}>{speaker.photoUrl ? <img src={speaker.photoUrl} alt=""/> : <span>{speaker.firstName[0]}{speaker.lastName[0]}</span>}</div><h3>{speakerName(speaker)}</h3><p>{speaker.jobTitle}{speaker.company ? ` · ${speaker.company}` : ''}</p><small>{speaker.bio}</small></article>)}</div>{publicSpeakers.length === 0 && <div className="public-empty">Speakers appear here after an accepted session is published.</div>}</section>}
    <section className="public-agenda-section" id="event-agenda"><div className="public-section-title"><span>YOUR EVENT, YOUR PLAN</span><h2>Explore the agenda.</h2><p>Choose a view, filter the program, and build a personal itinerary.</p></div><div className="public-view-switch" aria-label="Public agenda view">{program.enabledViews.map((item) => <button key={item} className={view === item ? 'active' : ''} aria-pressed={view === item} onClick={() => setView(item)}>{item}</button>)}</div><div className="public-filterbar"><label><Search size={16}/><input aria-label="Search public agenda" placeholder="Search sessions or speakers" value={search} onChange={(event) => setSearch(event.target.value)}/></label><select aria-label="Filter by track" value={track} onChange={(event) => setTrack(event.target.value)}><option value="all">All tracks</option>{tracks.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter by room" value={room} onChange={(event) => setRoom(event.target.value)}><option value="all">All rooms</option>{rooms.map((item) => <option key={item}>{item}</option>)}</select>{program.showItinerary && <button className={itineraryOnly ? 'active' : ''} onClick={() => setItineraryOnly(!itineraryOnly)}><CalendarCheck size={16}/>My itinerary ({itinerary.length})</button>}</div>
      <div className={`public-session-list public-session-list--${view}`}>{filteredSessions.map((session) => { const submission = state.submissions.find((item) => item.id === session.submissionId); if (!submission) return null; const speakers = selectSubmissionSpeakers(state, submission.id); const saved = itinerary.includes(session.id); return <article key={session.id}><time>{eventTime(session.startAt, state.event.timezone)}<small>{eventTime(session.endAt, state.event.timezone).split(' ').slice(-2).join(' ')}</small></time><div><span>{view === 'room' ? session.room : view === 'track' ? submission.track : `${submission.track} · ${session.room}`}</span><h3>{submission.title}</h3><p>{submission.abstract}</p><small><Users size={14}/>{speakers.map(speakerName).join(', ') || 'Program team'}<MapPin size={14}/>{session.room}<Clock3 size={14}/>{submission.durationMinutes} min{program.showCalendarDownloads && <button className="session-calendar" type="button" onClick={() => downloadSession(session)}><CalendarPlus size={13}/>Calendar</button>}</small></div>{program.showItinerary && <button className={saved ? 'saved' : ''} aria-label={`${saved ? 'Remove from' : 'Add to'} itinerary: ${submission.title}`} onClick={() => setItinerary(saved ? itinerary.filter((id) => id !== session.id) : [...itinerary, session.id])}><Star size={18} fill={saved ? 'currentColor' : 'none'}/></button>}</article> })}</div>
      {filteredSessions.length === 0 && <div className="public-empty">No published sessions match these filters.</div>}
    </section>
  </div>
}
