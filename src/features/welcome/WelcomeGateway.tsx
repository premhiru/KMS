import { ArrowRight, BookOpen, CalendarDays, Check, ClipboardCheck, FileText, LockKeyhole, Mail, ShieldCheck, Sparkles, UserRound, UsersRound } from 'lucide-react'
import { organizerSignInHref, publicEntryLinks } from './welcome-links'
import './welcome.css'

const roleCards = [
  {
    id: 'organizer', eyebrow: 'Build and operate', title: 'Event organizer',
    description: 'Run your call for proposals, review process, speaker onboarding, content, communications, and public program from one workspace.',
    icon: UsersRound,
  },
  {
    id: 'speaker', eyebrow: 'Manage your participation', title: 'Speaker',
    description: 'Open the private link sent to your verified email to update your profile, proposals, deliverables, availability, and sessions.',
    icon: UserRound,
  },
  {
    id: 'reviewer', eyebrow: 'Evaluate proposals', title: 'Reviewer',
    description: 'Use your emailed one-time invitation to enter the scoped review queue. Only assigned proposals and review materials are shown.',
    icon: ClipboardCheck,
  },
] as const

export function WelcomeGateway() {
  const location = { origin: window.location.origin, pathname: window.location.pathname, search: window.location.search }

  return <div className="welcome-gateway">
    <a className="welcome-skip" href="#welcome-main">Skip to entry options</a>
    <header className="welcome-nav">
      <a className="welcome-brand" href="#welcome-main" aria-label="OpenSpeaker home">
        <span><Sparkles aria-hidden="true" /></span>
        <span><strong>OpenSpeaker</strong><small>Program operations</small></span>
      </a>
      <nav aria-label="Public links"><a href={publicEntryLinks.program}>View program</a><a href={publicEntryLinks.docs}>Documentation</a></nav>
      <a className="welcome-nav-signin" href={organizerSignInHref(location)}>Organizer sign in</a>
    </header>

    <main id="welcome-main" tabIndex={-1}>
      <section className="welcome-hero" aria-labelledby="welcome-title">
        <div className="welcome-hero-copy">
          <p className="welcome-kicker"><span><Sparkles aria-hidden="true" /></span>Open conference content operations</p>
          <h1 id="welcome-title">Every event contributor,<br /><em>one clear way in.</em></h1>
          <p className="welcome-lead">OpenSpeaker brings proposal review, speaker coordination, program content, and public event experiences into a secure, open-source workspace.</p>
          <div className="welcome-hero-actions">
            <a className="welcome-button welcome-button--primary" href={organizerSignInHref(location)}>Open organizer workspace <ArrowRight aria-hidden="true" /></a>
            <a className="welcome-button welcome-button--secondary" href={publicEntryLinks.cfp}>Submit a proposal <FileText aria-hidden="true" /></a>
          </div>
          <p className="welcome-public-note"><Check aria-hidden="true" /><strong>No login needed</strong> to browse the program, submit through the public CFP, or read the documentation.</p>
        </div>
        <div className="welcome-hero-visual" aria-label="OpenSpeaker workflow overview">
          <div className="welcome-visual-window">
            <div className="welcome-window-bar"><span /><span /><span /><small>Program workspace</small></div>
            <div className="welcome-window-body">
              <div className="welcome-mini-nav"><span className="is-active"><Sparkles />Overview</span><span><FileText />Proposals</span><span><UserRound />Speakers</span><span><CalendarDays />Program</span></div>
              <div className="welcome-mini-content">
                <div className="welcome-mini-heading"><div><small>LIVE EVENT OPERATIONS</small><strong>Your program, in motion</strong></div><span>Ready</span></div>
                <div className="welcome-mini-stats"><div><strong>48</strong><span>Proposals</span></div><div><strong>18</strong><span>Speakers</span></div><div><strong>24</strong><span>Sessions</span></div></div>
                <div className="welcome-mini-list"><div><span className="welcome-avatar">AR</span><p><strong>Building reliable AI systems</strong><small>Accepted · Main stage</small></p><em>Published</em></div><div><span className="welcome-avatar welcome-avatar--gold">PK</span><p><strong>Designing for human trust</strong><small>Review complete · Product</small></p><em>Ready</em></div></div>
              </div>
            </div>
          </div>
          <div className="welcome-float-card welcome-float-card--secure"><ShieldCheck aria-hidden="true" /><span><strong>Scoped access</strong><small>Each role sees only what it needs</small></span></div>
          <div className="welcome-float-card welcome-float-card--public"><CalendarDays aria-hidden="true" /><span><strong>Program published</strong><small>Public and calendar-ready</small></span></div>
        </div>
      </section>

      <section className="welcome-roles" aria-labelledby="welcome-role-heading">
        <div className="welcome-section-heading"><p>Choose your path</p><h2 id="welcome-role-heading">How are you joining the event?</h2><span>Private work uses secure, role-scoped access. Public event pages stay open to everyone.</span></div>
        <div className="welcome-role-grid">
          {roleCards.map((role) => <article className={`welcome-role-card welcome-role-card--${role.id}`} key={role.id}>
            <div className="welcome-role-icon"><role.icon aria-hidden="true" /></div>
            <p>{role.eyebrow}</p><h3>{role.title}</h3><span>{role.description}</span>
            {role.id === 'organizer'
              ? <a href={organizerSignInHref(location)}>Sign in as organizer <ArrowRight aria-hidden="true" /></a>
              : <div className="welcome-email-instruction"><Mail aria-hidden="true" /><strong>Open your secure email link</strong><small>Links are one-time and event-specific.</small></div>}
          </article>)}
          <article className="welcome-role-card welcome-role-card--public">
            <div className="welcome-role-icon"><BookOpen aria-hidden="true" /></div>
            <p>Explore openly</p><h3>Attendee or evaluator</h3><span>Browse the published program, inspect the attendee experience, submit a proposal, or explore implementation documentation without signing in.</span>
            <div className="welcome-public-links"><a href={publicEntryLinks.program}>Program <ArrowRight aria-hidden="true" /></a><a href={publicEntryLinks.cfp}>Public CFP <ArrowRight aria-hidden="true" /></a><a href={publicEntryLinks.docs}>Docs <ArrowRight aria-hidden="true" /></a></div>
          </article>
        </div>
      </section>

      <section className="welcome-access" aria-labelledby="welcome-access-heading">
        <div><p>Access designed around trust</p><h2 id="welcome-access-heading">The right surface for every role.</h2><span>OpenSpeaker separates private workflows from public experiences so collaborators move quickly without exposing speaker or review data.</span></div>
        <ul><li><LockKeyhole aria-hidden="true" /><span><strong>Organizers</strong> authenticate through the hosting provider.</span></li><li><Mail aria-hidden="true" /><span><strong>Speakers and reviewers</strong> enter through event-scoped email invitations.</span></li><li><BookOpen aria-hidden="true" /><span><strong>Public visitors</strong> never need an account.</span></li></ul>
      </section>
    </main>

    <footer className="welcome-footer"><a className="welcome-brand welcome-brand--footer" href="#welcome-main"><span><Sparkles aria-hidden="true" /></span><strong>OpenSpeaker</strong></a><p>Open-source event program operations.</p><nav aria-label="Footer links"><a href={publicEntryLinks.cfp}>Call for proposals</a><a href={publicEntryLinks.program}>Public program</a><a href={publicEntryLinks.docs}>Documentation</a></nav></footer>
  </div>
}
