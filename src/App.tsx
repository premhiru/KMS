import { lazy, Suspense, useEffect, useState, type ComponentType, type FormEvent } from 'react'
import {
  BookOpen,
  BookMarked,
  ContactRound,
  CalendarDays,
  ChevronLeft,
  Files,
  FileText,
  Globe2,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  PanelLeft,
  Settings,
  ShieldCheck,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Star,
  Users,
  X,
} from 'lucide-react'
import './App.css'
import './shell.css'
import { createId, useApp } from './core'
import type { WorkspaceEventSummary } from './services'
import { AgendaBuilder } from './features/agenda'
import { AdminWorkspace } from './features/admin'
import { CommunicationsCenter } from './features/communications'
import { CrmWorkspace } from './features/crm'
import { Dashboard } from './features/dashboard/Dashboard'
import { DeliverablesWorkspace } from './features/deliverables'
import { EmbedManager } from './features/embeds'
import { SpeakerPortal } from './features/portal'
import { PublicEvent } from './features/public-event'
import { EventSettings } from './features/settings/EventSettings'
import { OrganizerSpeakers } from './features/speakers'
import { CfpBuilder } from './features/submissions/CfpBuilder'
import { OrganizerSubmissions } from './features/submissions/OrganizerSubmissions'
import { PublicCfp } from './features/submissions/PublicCfp'
import { ReviewWorkspace } from './features/submissions/ReviewWorkspace'
import { useHashRoute, type AppRoute } from './routes/hash-router'

const Documentation = lazy(() => import('./features/docs'))

interface NavItem {
  route: AppRoute
  label: string
  icon: ComponentType<{ size?: number }>
}

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  { label: 'Workspace', items: [
    { route: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { route: 'submissions', label: 'Submissions', icon: FileText },
    { route: 'reviews', label: 'Review workspace', icon: Star },
  ] },
  { label: 'Program', items: [
    { route: 'cfp-builder', label: 'CFP form builder', icon: SlidersHorizontal },
    { route: 'speakers', label: 'Speakers', icon: Users },
    { route: 'deliverables', label: 'Deliverables', icon: Files },
    { route: 'agenda', label: 'Agenda', icon: CalendarDays },
    { route: 'communications', label: 'Communications', icon: MessageSquareText },
  ] },
  { label: 'Organization', items: [
    { route: 'crm', label: 'Speaker CRM', icon: ContactRound },
  ] },
  { label: 'Experience', items: [
    { route: 'embeds', label: 'Embeds & widgets', icon: Share2 },
    { route: 'portal', label: 'Speaker portal', icon: BookOpen },
    { route: 'event', label: 'Public event', icon: Globe2 },
    { route: 'docs', label: 'Documentation', icon: BookMarked },
  ] },
]

const routeTitles: Record<AppRoute, string> = {
  dashboard: 'Overview',
  submissions: 'Submissions',
  cfp: 'Public call for proposals',
  'cfp-builder': 'CFP form builder',
  reviews: 'Review workspace',
  speakers: 'Speakers',
  crm: 'Speaker CRM',
  deliverables: 'Deliverables',
  agenda: 'Agenda builder',
  communications: 'Communications',
  embeds: 'Embeds & widgets',
  portal: 'Speaker portal',
  event: 'Public event',
  docs: 'Documentation',
  settings: 'Settings',
  admin: 'Access and audit',
}

function EventSwitcher() {
  const { api, state, session } = useApp()
  const [events, setEvents] = useState<WorkspaceEventSummary[]>([])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!api || (session?.role !== 'owner' && session?.role !== 'organizer')) return
    void api.listEvents().then((result) => setEvents(result.events)).catch(() => setEvents([]))
  }, [api, session?.role])

  if (!api || (session?.role !== 'owner' && session?.role !== 'organizer')) return null

  const selectEvent = (event: WorkspaceEventSummary) => {
    const url = new URL(window.location.href)
    url.searchParams.set('eventId', event.id)
    url.searchParams.set('eventSlug', event.slug)
    url.hash = '/dashboard'
    window.location.assign(url)
  }

  const createEvent = async (event: FormEvent) => {
    event.preventDefault()
    const cleanName = name.trim()
    if (!cleanName || busy) return
    setBusy(true)
    setMessage('')
    try {
      const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || createId('event')
      const id = createId('event')
      const at = new Date().toISOString()
      const fresh = {
        ...state,
        lastUpdatedAt: at,
        event: { ...state.event, id, name: cleanName, slug, agendaPublishedAt: undefined },
        speakers: [], submissions: [], reviews: [], tasks: [], sessions: [], communicationLog: [],
        evaluationPlans: [], evaluationRounds: [], evaluationAssignments: [], evaluationAdvancements: [],
      }
      const receipt = await api.createEvent({ state: fresh })
      selectEvent(receipt.event)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create the event.')
      setBusy(false)
    }
  }

  return <div className="event-switcher">
    <label><span className="sr-only">Current event</span><select value={api.eventId} onChange={(event) => { const selected = events.find((item) => item.id === event.target.value); if (selected) selectEvent(selected) }}><option value={api.eventId}>{state.event.name}</option>{events.filter((item) => item.id !== api.eventId).map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>+ Event</button>
    {open && <form onSubmit={(event) => void createEvent(event)}><label>New event name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="DevFlow Conf 2027" /></label><button disabled={busy}>{busy ? 'Creating…' : 'Create event'}</button>{message && <p role="alert">{message}</p>}</form>}
  </div>
}

export default function App() {
  const { route, navigate } = useHashRoute()
  const { state, syncStatus, persistenceMode, persistenceError, session } = useApp()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [reviewSubmissionId, setReviewSubmissionId] = useState<string>()

  if (syncStatus === 'loading') {
    return <main className="public-surface app-boot"><Sparkles aria-hidden="true" /><h1>Opening OpenSpeaker</h1><p>Loading the shared event workspace…</p></main>
  }

  if (syncStatus === 'error') {
    return <main className="public-surface app-boot"><Sparkles aria-hidden="true" /><h1>Workspace unavailable</h1><p role="alert">{persistenceError ?? 'OpenSpeaker could not load the shared event safely.'}</p><button className="button primary" onClick={() => window.location.reload()}>Retry</button></main>
  }

  if (route === 'cfp') {
    return <main className="public-surface"><PublicCfp /></main>
  }

  if (route === 'event') {
    return <main className="public-surface"><PublicEvent /></main>
  }

  if (route === 'docs') {
    return <Suspense fallback={<main className="public-surface app-boot"><Sparkles aria-hidden="true" /><h1>Opening documentation</h1></main>}><Documentation /></Suspense>
  }

  if (syncStatus === 'unauthorized' || persistenceMode === 'public-readonly') {
    const returnTo = encodeURIComponent(`${window.location.pathname}${window.location.search}${window.location.hash}`)
    return <main className="public-surface app-boot"><Sparkles aria-hidden="true" /><h1>Organizer sign-in required</h1><p>This workspace contains private speaker and review data.</p><a className="button primary" href={`/signin-with-chatgpt?return_to=${returnTo}`}>Sign in with ChatGPT</a></main>
  }

  if (session?.role === 'reviewer') {
    return <main className="public-surface role-workspace"><ReviewWorkspace currentReviewerEmail={session.user.email} reviewerName={session.user.name} defaultMode="reviewer" /></main>
  }

  if (session?.role === 'speaker') {
    return <main className="public-surface role-workspace">{syncStatus === 'saving' && <div className="sync-banner saving" role="status">Saving your portal…</div>}<SpeakerPortal /></main>
  }

  function go(next: string) {
    navigate(next)
    setSidebarOpen(false)
  }

  return <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById('main-content')?.focus() }}>Skip to main content</a>
    {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <aside className={`shell-sidebar ${sidebarOpen ? 'mobile-open' : ''}`}>
      <div className="shell-brand">
        <button className="brand-button" onClick={() => go('dashboard')} aria-label="Open overview">
          <span className="brand-mark"><Sparkles size={18} /></span>
          <span className="brand-copy"><strong>OpenSpeaker</strong><small>Program operations</small></span>
        </button>
        <button className="mobile-close" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={19} /></button>
      </div>
      <div className="event-summary">
        <span>{state.event.name.slice(0, 2).toUpperCase()}</span>
        <div><strong>{state.event.name}</strong><small>{state.event.venue}</small></div>
      </div>
      <EventSwitcher />
      <nav className="shell-nav" aria-label="Organizer workspace">
        {navGroups.map((group) => <div className="nav-group" key={group.label}>
          <span className="nav-label">{group.label}</span>
          {group.items.map((item) => <button key={item.route} className={route === item.route ? 'active' : ''} onClick={() => go(item.route)} title={item.label}>
            <item.icon size={18} /><span>{item.label}</span>
            {item.route === 'submissions' && <em>{state.submissions.filter((entry) => entry.status === 'needs-review' || entry.status === 'in-review').length}</em>}
          </button>)}
        </div>)}
      </nav>
      <div className="sidebar-footer">
        <button className={route === 'admin' ? 'active' : ''} onClick={() => go('admin')}><ShieldCheck size={18} /><span>Access & audit</span></button>
        <button className={route === 'settings' ? 'active' : ''} onClick={() => go('settings')}><Settings size={18} /><span>Settings & data</span></button>
        <div className="organizer-profile"><span>{(session?.user.name || 'Event organizer').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span><div><strong>{session?.user.name || 'Event organizer'}</strong><small>{session?.role ?? 'Local preview'}</small></div></div>
      </div>
    </aside>
    <section className="shell-main">
      <header className="shell-header">
        <div className="header-context">
          <button className="mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <button className="desktop-collapse" aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'} onClick={() => setSidebarCollapsed((value) => !value)}>{sidebarCollapsed ? <PanelLeft size={20} /> : <ChevronLeft size={20} />}</button>
          <div><small>{state.event.name}</small><strong>{routeTitles[route]}</strong></div>
        </div>
        <div className="header-actions">
          <button className="button secondary compact" onClick={() => go('cfp')}><FileText size={16} /> Public CFP</button>
          <button className="button primary compact" onClick={() => go('event')}><Globe2 size={16} /> Public event</button>
        </div>
      </header>
      <main className="shell-content" id="main-content" tabIndex={-1}>
        {syncStatus === 'saving' && <div className="sync-banner saving" role="status">Saving to the shared workspace…</div>}
        {route === 'dashboard' && <Dashboard onNavigate={go} />}
        {route === 'submissions' && <OrganizerSubmissions onOpenReview={(submissionId) => { setReviewSubmissionId(submissionId); go('reviews') }} />}
        {route === 'cfp-builder' && <CfpBuilder publicPath={`${window.location.origin}${window.location.pathname}#/cfp`} />}
        {route === 'reviews' && <ReviewWorkspace initialSubmissionId={reviewSubmissionId} onDecision={() => go('submissions')} />}
        {route === 'speakers' && <OrganizerSpeakers />}
        {route === 'crm' && <CrmWorkspace />}
        {route === 'deliverables' && <DeliverablesWorkspace />}
        {route === 'agenda' && <AgendaBuilder />}
        {route === 'communications' && <CommunicationsCenter />}
        {route === 'embeds' && <EmbedManager />}
        {route === 'portal' && <SpeakerPortal />}
        {route === 'settings' && <EventSettings />}
        {route === 'admin' && <AdminWorkspace />}
      </main>
    </section>
  </div>
}
