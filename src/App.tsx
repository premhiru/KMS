import { useState, type ComponentType } from 'react'
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  FileText,
  Globe2,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  PanelLeft,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Star,
  Users,
  X,
} from 'lucide-react'
import './App.css'
import './shell.css'
import { useApp } from './core'
import { AgendaBuilder } from './features/agenda'
import { CommunicationsCenter } from './features/communications'
import { Dashboard } from './features/dashboard/Dashboard'
import { SpeakerPortal } from './features/portal'
import { PublicEvent } from './features/public-event'
import { EventSettings } from './features/settings/EventSettings'
import { OrganizerSpeakers } from './features/speakers'
import { CfpBuilder } from './features/submissions/CfpBuilder'
import { OrganizerSubmissions } from './features/submissions/OrganizerSubmissions'
import { PublicCfp } from './features/submissions/PublicCfp'
import { ReviewWorkspace } from './features/submissions/ReviewWorkspace'
import { useHashRoute, type AppRoute } from './routes/hash-router'

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
    { route: 'agenda', label: 'Agenda', icon: CalendarDays },
    { route: 'communications', label: 'Communications', icon: MessageSquareText },
  ] },
  { label: 'Experience', items: [
    { route: 'portal', label: 'Speaker portal', icon: BookOpen },
    { route: 'event', label: 'Public event', icon: Globe2 },
  ] },
]

const routeTitles: Record<AppRoute, string> = {
  dashboard: 'Overview',
  submissions: 'Submissions',
  cfp: 'Public call for proposals',
  'cfp-builder': 'CFP form builder',
  reviews: 'Review workspace',
  speakers: 'Speakers',
  agenda: 'Agenda builder',
  communications: 'Communications',
  portal: 'Speaker portal',
  event: 'Public event',
  settings: 'Settings',
}

export default function App() {
  const { route, navigate } = useHashRoute()
  const { state } = useApp()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [reviewSubmissionId, setReviewSubmissionId] = useState<string>()

  if (route === 'cfp') {
    return <main className="public-surface"><PublicCfp /></main>
  }

  if (route === 'event') {
    return <main className="public-surface"><PublicEvent /></main>
  }

  function go(next: string) {
    navigate(next)
    setSidebarOpen(false)
  }

  return <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
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
        <button className={route === 'settings' ? 'active' : ''} onClick={() => go('settings')}><Settings size={18} /><span>Settings & data</span></button>
        <div className="organizer-profile"><span>SL</span><div><strong>Sarah Lin</strong><small>Event organizer</small></div></div>
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
      <main className="shell-content">
        {route === 'dashboard' && <Dashboard onNavigate={go} />}
        {route === 'submissions' && <OrganizerSubmissions onOpenReview={(submissionId) => { setReviewSubmissionId(submissionId); go('reviews') }} />}
        {route === 'cfp-builder' && <CfpBuilder publicPath={`${window.location.origin}${window.location.pathname}#/cfp`} />}
        {route === 'reviews' && <ReviewWorkspace initialSubmissionId={reviewSubmissionId} onDecision={() => go('submissions')} />}
        {route === 'speakers' && <OrganizerSpeakers />}
        {route === 'agenda' && <AgendaBuilder />}
        {route === 'communications' && <CommunicationsCenter />}
        {route === 'portal' && <SpeakerPortal />}
        {route === 'settings' && <EventSettings />}
      </main>
    </section>
  </div>
}
