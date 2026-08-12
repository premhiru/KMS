import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import {
  ArrowRight,
  BookOpen,
  Check,
  Clipboard,
  Code2,
  ExternalLink,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'
import { docsSections, examples } from './content'
import './docs.css'

type Language = 'curl' | 'javascript'

function pathSection() {
  const value = window.location.hash.replace(/^#\/docs\/?/, '').split('/')[0]
  return docsSections.some((section) => section.id === value) ? value : 'quickstart'
}

function fallbackCopy(value: string) {
  const field = document.createElement('textarea')
  field.value = value
  field.readOnly = true
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()
  try {
    return document.execCommand('copy')
  } finally {
    field.remove()
  }
}

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copy = async () => {
    let copied = false
    try {
      await navigator.clipboard.writeText(value)
      copied = true
    } catch {
      copied = fallbackCopy(value)
    }
    setStatus(copied ? 'copied' : 'failed')
    if (copied) window.setTimeout(() => setStatus('idle'), 1600)
  }
  return <><button className="docs-copy" type="button" onClick={() => void copy()} aria-label={`${label} code`}>{status === 'copied' ? <Check size={14} /> : <Clipboard size={14} />}{status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : label}</button><span className="sr-only" role="status">{status === 'copied' ? 'Code copied to clipboard.' : status === 'failed' ? 'Clipboard access is unavailable. Select and copy the code manually.' : ''}</span></>
}

function CodeBlock({ children, title }: { children: string; title?: string }) {
  return <div className="docs-code-block">
    <div className="docs-code-head"><span>{title ?? 'Example'}</span><CopyButton value={children} /></div>
    <pre tabIndex={0}><code>{children}</code></pre>
  </div>
}

function CodeTabs({ curl, javascript }: { curl: string; javascript: string }) {
  const [language, setLanguage] = useState<Language>('curl')
  const id = useId()
  const tabs = useRef<Record<Language, HTMLButtonElement | null>>({ curl: null, javascript: null })
  const value = language === 'curl' ? curl : javascript
  const selectWithKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>, current: Language) => {
    const order: Language[] = ['curl', 'javascript']
    const currentIndex = order.indexOf(current)
    let next: Language | undefined
    if (event.key === 'ArrowRight') next = order[(currentIndex + 1) % order.length]
    if (event.key === 'ArrowLeft') next = order[(currentIndex - 1 + order.length) % order.length]
    if (event.key === 'Home') next = order[0]
    if (event.key === 'End') next = order.at(-1)
    if (!next) return
    event.preventDefault()
    setLanguage(next)
    tabs.current[next]?.focus()
  }
  return <div className="docs-code-tabs">
    <div className="docs-code-tabs-head">
      <div role="tablist" aria-label="Code language">
        <button ref={(node) => { tabs.current.curl = node }} id={`${id}-curl-tab`} role="tab" aria-controls={`${id}-panel`} aria-selected={language === 'curl'} tabIndex={language === 'curl' ? 0 : -1} onKeyDown={(event) => selectWithKeyboard(event, 'curl')} onClick={() => setLanguage('curl')}>cURL</button>
        <button ref={(node) => { tabs.current.javascript = node }} id={`${id}-javascript-tab`} role="tab" aria-controls={`${id}-panel`} aria-selected={language === 'javascript'} tabIndex={language === 'javascript' ? 0 : -1} onKeyDown={(event) => selectWithKeyboard(event, 'javascript')} onClick={() => setLanguage('javascript')}>JavaScript</button>
      </div>
      <CopyButton value={value} />
    </div>
    <pre id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${language}-tab`} tabIndex={0}><code>{value}</code></pre>
  </div>
}

function Method({ verb, children }: { verb: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'HEAD'; children: ReactNode }) {
  return <div className="docs-endpoint" tabIndex={0}><span className={`method method-${verb.toLowerCase()}`}>{verb}</span><code>{children}</code></div>
}

function Callout({ tone = 'note', title, children }: { tone?: 'note' | 'success' | 'warning'; title: string; children: ReactNode }) {
  return <aside className={`docs-callout ${tone}`}><strong>{title}</strong><div>{children}</div></aside>
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="docs-steps">{children}</ol>
}

function Section({ id, eyebrow, title, lead, children }: { id: string; eyebrow: string; title: string; lead: string; children: ReactNode }) {
  return <section className="docs-section" id={id} data-docs-section>
    <div className="docs-section-heading"><span>{eyebrow}</span><h2>{title}</h2><p>{lead}</p></div>
    {children}
  </section>
}

export default function Documentation() {
  const [active, setActive] = useState(pathSection)
  const [query, setQuery] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileNavigation, setMobileNavigation] = useState(() => window.matchMedia('(max-width: 780px)').matches)
  const sidebarRef = useRef<HTMLElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return docsSections
    return docsSections.filter((section) => [section.label, section.summary, ...section.keywords].join(' ').toLowerCase().includes(needle))
  }, [query])

  useEffect(() => {
    const originalTitle = document.title
    const originalDescription = document.querySelector('meta[name="description"]')?.getAttribute('content')
    const originalOgImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content')
    const description = 'Set up, extend, deploy, and operate OpenSpeaker with practical guides and production API examples.'
    document.title = 'OpenSpeaker Docs — From proposal to published program'
    document.querySelector('meta[name="description"]')?.setAttribute('content', description)
    document.querySelector('meta[property="og:image"]')?.setAttribute('content', `${window.location.origin}/docs-og.png`)
    document.querySelector('meta[name="twitter:image"]')?.setAttribute('content', `${window.location.origin}/docs-og.png`)
    return () => {
      document.title = originalTitle
      if (originalDescription) document.querySelector('meta[name="description"]')?.setAttribute('content', originalDescription)
      if (originalOgImage) {
        document.querySelector('meta[property="og:image"]')?.setAttribute('content', originalOgImage)
        document.querySelector('meta[name="twitter:image"]')?.setAttribute('content', originalOgImage)
      }
    }
  }, [])

  useEffect(() => {
    const query = window.matchMedia('(max-width: 780px)')
    const update = () => setMobileNavigation(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!mobileNavigation || !mobileOpen) return
    closeButtonRef.current?.focus()
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMobileOpen(false)
        window.setTimeout(() => menuButtonRef.current?.focus(), 0)
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...(sidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileNavigation, mobileOpen])

  useEffect(() => {
    const navigate = () => {
      const id = pathSection()
      setActive(id)
      window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
    }
    window.addEventListener('hashchange', navigate)
    if (window.location.hash !== '#/docs') navigate()
    return () => window.removeEventListener('hashchange', navigate)
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visible?.target.id) setActive(visible.target.id)
    }, { rootMargin: '-18% 0px -68% 0px', threshold: [0, 0.25, 0.6] })
    document.querySelectorAll('[data-docs-section]').forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  const go = (id: string) => {
    setActive(id)
    setMobileOpen(false)
    window.location.hash = `/docs/${id}`
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const closeMobileNavigation = () => {
    setMobileOpen(false)
    window.setTimeout(() => menuButtonRef.current?.focus(), 0)
  }

  return <div className="docs-app">
    <a className="docs-skip" href="#docs-content" onClick={(event) => { event.preventDefault(); document.getElementById('docs-content')?.focus() }}>Skip to documentation</a>
    <header className="docs-topbar">
      <a className="docs-brand" href="#/docs/quickstart" onClick={() => go('quickstart')}><span><Sparkles size={17} /></span><strong>OpenSpeaker</strong><em>docs</em></a>
      <nav aria-label="Documentation links">
        <a href="#/event/sessions" target="_blank" rel="noreferrer">Live program</a>
        <a href="https://github.com/premhiru/KMS" target="_blank" rel="noreferrer"><Code2 size={16} /> GitHub</a>
        <a className="docs-top-cta" href="#/cfp" target="_blank" rel="noreferrer">Open CFP <ArrowRight size={14} /></a>
      </nav>
      <button ref={menuButtonRef} className="docs-mobile-toggle" type="button" aria-label="Open documentation navigation" aria-expanded={mobileOpen} aria-controls="documentation-navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
    </header>

    <div className="docs-layout">
      {mobileOpen && <button className="docs-scrim" aria-label="Close documentation navigation" onClick={closeMobileNavigation} />}
      <aside ref={sidebarRef} id="documentation-navigation" inert={mobileNavigation && !mobileOpen ? true : undefined} className={`docs-sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="docs-mobile-head"><strong>Documentation</strong><button ref={closeButtonRef} aria-label="Close documentation navigation" onClick={closeMobileNavigation}><X size={18} /></button></div>
        <label className="docs-search"><Search size={15} /><span className="sr-only">Search documentation</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the docs…" /></label>
        <nav aria-label="Documentation sections">
          {(['Start', 'Build', 'Operate'] as const).map((group) => {
            const sections = matches.filter((section) => section.group === group)
            return sections.length > 0 && <div className="docs-nav-group" key={group}><span>{group}</span>{sections.map((section) => <button className={active === section.id ? 'active' : ''} aria-current={active === section.id ? 'page' : undefined} key={section.id} onClick={() => go(section.id)}><strong>{section.label}</strong><small>{section.summary}</small></button>)}</div>
          })}
          {matches.length === 0 && <p className="docs-no-results">No sections match “{query}”.</p>}
        </nav>
        <div className="docs-sidebar-card"><Zap size={17} /><strong>Open source, production-shaped</strong><p>React, TypeScript, a Cloudflare Worker, D1, and R2.</p></div>
      </aside>

      <main className="docs-content" id="docs-content" tabIndex={-1}>
        <div className="docs-hero">
          <div><span className="docs-kicker"><Sparkles size={13} /> OpenSpeaker developer platform</span><h1>From first proposal<br />to published program.</h1><p>Build and operate the complete conference program lifecycle with an open-source, API-backed workspace.</p><div className="docs-hero-actions"><button onClick={() => go('quickstart')}>Start building <ArrowRight size={15} /></button><a href="https://github.com/premhiru/KMS" target="_blank" rel="noreferrer"><Code2 size={15} /> View source</a></div></div>
          <div className="docs-hero-code"><div><i /><i /><i /><span>create-submission.ts</span></div><pre tabIndex={0}><code><b>const</b> proposal = <b>await</b> fetch(<span>'/api/public/cfp/…'</span>, {'{'}
  method: <span>'POST'</span>,
  body: JSON.stringify({'{'}
    title: <span>'Reliable agents'</span>,
    speakerName: <span>'Maya Chen'</span>,
    consent: <b>true</b>
  {'}'})
{'}'})</code></pre><footer><Check size={14} /> Persisted, validated, and ready for review</footer></div>
        </div>

        <Section id="quickstart" eyebrow="Get started" title="Quickstart" lead="Run the complete application locally, explore seeded workflows, and verify the production build.">
          <div className="docs-card-grid three"><article><span>01</span><h3>Install</h3><p>Clone the public repository and install the locked dependencies.</p></article><article><span>02</span><h3>Run</h3><p>Start Vite for an offline, browser-local product preview.</p></article><article><span>03</span><h3>Explore</h3><p>Open the organizer workspace, CFP, speaker portal, and public program.</p></article></div>
          <CodeBlock title="Terminal">{`git clone https://github.com/premhiru/KMS.git
cd KMS
npm install
npm run dev`}</CodeBlock>
          <h3>Useful local routes</h3>
          <div className="docs-route-table"><div><code>#/dashboard</code><span>Organizer operations</span></div><div><code>#/cfp</code><span>Anonymous proposal form</span></div><div><code>#/reviews</code><span>Reviewer workspace</span></div><div><code>#/portal</code><span>Speaker portal preview</span></div><div><code>#/event/sessions</code><span>Public program</span></div><div><code>#/docs</code><span>This documentation</span></div></div>
          <Callout tone="note" title="Local and hosted modes are intentionally different"><p>Local development stores a versioned preview in your browser. The deployed application uses authenticated Worker APIs, D1, and R2 as its source of truth.</p></Callout>
          <h3>Check the API</h3><CodeTabs curl={examples.healthCurl} javascript={examples.healthJs} />
        </Section>

        <Section id="how-it-works" eyebrow="Concepts" title="How OpenSpeaker works" lead="One revisioned program model flows through organizers, reviewers, speakers, and public attendees.">
          <div className="docs-flow" role="list" aria-label="Program lifecycle"><div role="listitem"><span>1</span><strong>Collect</strong><small>CFP forms and invited sessions</small></div><ArrowRight aria-hidden="true" /><div role="listitem"><span>2</span><strong>Evaluate</strong><small>Rounds, rubrics, decisions</small></div><ArrowRight aria-hidden="true" /><div role="listitem"><span>3</span><strong>Onboard</strong><small>Profiles, tasks, files</small></div><ArrowRight aria-hidden="true" /><div role="listitem"><span>4</span><strong>Publish</strong><small>Agenda, embeds, feeds</small></div></div>
          <div className="docs-card-grid"><article><Code2 /><h3>React client</h3><p>Role-aware workspaces share a typed domain model and reconcile optimistic changes.</p></article><article><Zap /><h3>Worker API</h3><p>Validates every write, enforces tenant and role boundaries, and orchestrates providers.</p></article><article><ShieldCheck /><h3>D1 + R2</h3><p>D1 stores revisioned records and audit history. R2 stores private event-scoped file bytes.</p></article><article><ExternalLink /><h3>Public read model</h3><p>Only accepted, published, confirmed program data reaches public pages and feeds.</p></article></div>
          <Callout tone="success" title="Privacy is projection-based"><p>Review notes, email addresses, tasks, source payloads, CRM notes, and unpublished content are omitted from anonymous responses at the server boundary.</p></Callout>
        </Section>

        <Section id="authentication" eyebrow="Security" title="Authentication and roles" lead="The hosting layer establishes identity; the Worker makes the authorization decision for every route.">
          <div className="docs-role-table"><div><strong>Owner</strong><span>Workspace bootstrap, members, audit, all organizer actions</span></div><div><strong>Organizer</strong><span>Events, CFP, submissions, speakers, agenda, communications, CRM</span></div><div><strong>Reviewer</strong><span>Only assigned proposals and rounds; blind data stays redacted</span></div><div><strong>Speaker</strong><span>Only their profile, tasks, files, resources, sessions, and proposals</span></div><div><strong>Public</strong><span>Published program and anonymous CFP routes only</span></div></div>
          <Callout tone="warning" title="Do not send identity headers from application code"><p>Production trusts hosting-injected <code>oai-authenticated-user-*</code> headers. The <code>ALLOW_LOCAL_AUTH</code> aliases exist only for controlled local tests.</p></Callout>
          <h3>Proposal access without a workspace account</h3><Steps><li><span>1</span><div><strong>Request</strong><p>The submitter enters their proposal email. The endpoint always returns the same 202 response to prevent address enumeration.</p></div></li><li><span>2</span><div><strong>Redeem</strong><p>A one-time, 15-minute link creates a hashed, event-scoped, HttpOnly session.</p></div></li><li><span>3</span><div><strong>Use</strong><p>The cookie authorizes only that event’s speaker portal and proposal routes—not workspace administration.</p></div></li></Steps>
          <Method verb="POST">/api/public/cfp/:workspaceId/:eventSlug/claim</Method>
          <CodeBlock title="Request a secure access link">{`curl -X POST https://your-domain.example/api/public/cfp/workspace-demo/devflow-2027/claim \\
  -H "Content-Type: application/json" \\
  -d '{ "email": "maya@example.com", "returnUrl": "/#/portal" }'`}</CodeBlock>
        </Section>

        <Section id="events-state" eyebrow="Core API" title="Events and revisioned state" lead="Every program change is checked against a revision so concurrent edits fail safely instead of silently overwriting data.">
          <Method verb="GET">/api/workspaces/:workspaceId/events/:eventId/state</Method><CodeBlock title="Read state and ETag">{examples.stateCurl}</CodeBlock>
          <Method verb="PUT">/api/workspaces/:workspaceId/events/:eventId/state</Method><CodeBlock title="Write revision 43 from revision 42">{examples.updateStateCurl}</CodeBlock>
          <div className="docs-card-grid three"><article><h3>ETag</h3><p>The response revision is also returned as an ETag. Send it back with <code>If-Match</code>.</p></article><article><h3>Conflict</h3><p>A stale write returns <code>409 REVISION_CONFLICT</code>. Re-fetch, reconcile, and retry deliberately.</p></article><article><h3>Recovery</h3><p>History stores full snapshots. Rollback restores a snapshot as a new auditable revision.</p></article></div>
          <Method verb="GET">/api/workspaces/:workspaceId/events/:eventId/state/history</Method>
          <Method verb="POST">/api/workspaces/:workspaceId/events/:eventId/state/rollback</Method>
        </Section>

        <Section id="cfp" eyebrow="Workflow" title="Call for proposals" lead="Build conditional forms, publish an anonymous URL, enforce rules server-side, and move normalized submissions into review.">
          <Steps><li><span>1</span><div><strong>Configure</strong><p>Set dates, limits, tracks, formats, welcome and thank-you copy, questions, conditions, and category routes.</p></div></li><li><span>2</span><div><strong>Publish</strong><p>Share <code>#/cfp</code>. No organizer session is required.</p></div></li><li><span>3</span><div><strong>Validate</strong><p>The Worker checks close time, rate limits, required visible questions, category routing, and per-email limits.</p></div></li><li><span>4</span><div><strong>Ingest</strong><p>Accepted requests are normalized once and stamped with their CFP version and origin.</p></div></li></Steps>
          <Method verb="GET">/api/public/cfp/:workspaceId/:eventSlug</Method><Method verb="POST">/api/public/cfp/:workspaceId/:eventSlug</Method>
          <CodeTabs curl={examples.cfpCurl} javascript={examples.cfpJs} />
          <Callout tone="note" title="Proposal acceptance is durable"><p>If a confirmation email provider is unavailable, the proposal remains saved and the receipt reports <code>confirmationEmail.status</code> honestly.</p></Callout>
        </Section>

        <Section id="reviews" eyebrow="Workflow" title="Multi-round review" lead="Evaluation plans define assignments, open windows, blind visibility, weighted criteria, and advancement.">
          <div className="docs-card-grid three"><article><span>Plan</span><h3>Shape the process</h3><p>Create rounds, due dates, instructions, filters, and reviewer assignments.</p></article><article><span>Score</span><h3>Use typed rubrics</h3><p>Rating, select, and text criteria are validated against the assigned round.</p></article><article><span>Decide</span><h3>Advance safely</h3><p>Compare weighted results, abstentions, and progress before accepting or declining.</p></article></div>
          <Method verb="GET">/api/workspaces/:workspaceId/events/:eventId/reviewer-queue</Method><Method verb="POST">/api/workspaces/:workspaceId/events/:eventId/reviews</Method>
          <CodeBlock title="Submit an assigned review">{examples.reviewCurl}</CodeBlock>
          <Callout tone="success" title="Blind review is enforced on the server"><p>The reviewer queue includes only email-matched assignments. Blind rounds remove speaker and source identity before data reaches the browser.</p></Callout>
        </Section>

        <Section id="speaker-portal" eyebrow="Workflow" title="Speaker portal and private files" lead="Speakers maintain one identity-scoped workspace for profiles, proposals, sessions, resources, tasks, and deliverables.">
          <div className="docs-card-grid"><article><h3>Profile</h3><p>Biography, company, title, social links, travel preferences, availability, and invitation status.</p></article><article><h3>Proposals</h3><p>Save drafts, submit before close, and follow organizer decisions.</p></article><article><h3>Deliverables</h3><p>Upload headshots, slides, and supporting documents with immutable version history.</p></article><article><h3>Resources</h3><p>Read organizer-approved wiki pages, safe embeds, and private files.</p></article></div>
          <Method verb="GET">/api/workspaces/:workspaceId/events/:eventId/speaker-portal</Method><Method verb="PATCH">/api/workspaces/:workspaceId/events/:eventId/speaker-portal</Method><CodeBlock title="Update the current speaker">{examples.portalPatch}</CodeBlock>
          <h3>Asset lifecycle</h3><Steps><li><span>1</span><div><strong>Upload bytes</strong><p>Send the file body with <code>X-File-Name</code> and an allowed <code>Content-Type</code>.</p></div></li><li><span>2</span><div><strong>Attach to a task</strong><p>Reference the returned asset ID in a portal task update.</p></div></li><li><span>3</span><div><strong>Approve</strong><p>An organizer reviews the version. Only approved public headshots receive an anonymous URL.</p></div></li></Steps>
          <CodeBlock title="Upload a PDF">{`curl -X POST https://your-domain.example/api/workspaces/workspace-demo/events/event-devflow/assets \\
  -H "X-File-Name: speaker-deck.pdf" \\
  -H "Content-Type: application/pdf" \\
  --data-binary @speaker-deck.pdf`}</CodeBlock>
        </Section>

        <Section id="agenda-public" eyebrow="Publishing" title="Agenda, embeds, and native feeds" lead="Schedule accepted sessions once, then serve the same privacy-safe published program to every attendee surface.">
          <div className="docs-card-grid three"><article><h3>Agenda builder</h3><p>Drag, move, auto-place, and detect room, speaker, track, and availability conflicts.</p></article><article><h3>Public widgets</h3><p>Sessions, speakers, agenda, itinerary, and gallery views share one published model.</p></article><article><h3>Native feeds</h3><p>JSON, XML, and RFC 5545 iCalendar responses work outside the React application.</p></article></div>
          <Method verb="GET">/api/public/events/:workspaceId/:eventSlug/feeds/program.json</Method><Method verb="GET">/api/public/events/:workspaceId/:eventSlug/feeds/program.xml</Method><Method verb="GET">/api/public/events/:workspaceId/:eventSlug/feeds/program.ics</Method>
          <CodeBlock title="Filtered JSON feed">{`curl "https://your-domain.example/api/public/events/workspace-demo/devflow-2027/feeds/program.json?track=AI%20Engineering&format=Talk"`}</CodeBlock>
          <div className="docs-feature-list"><div><Check />Anonymous with wildcard CORS</div><div><Check />Five-minute cache with stale revalidation</div><div><Check />Revision and filter-specific ETags</div><div><Check />GET and HEAD support</div><div><Check />No email, review, task, or source payload leakage</div></div>
          <Callout tone="note" title="Publishing is a gate, not a copy"><p>Public responses are calculated from accepted submissions attached to published sessions with confirmed speakers. Updating the source program updates every surface.</p></Callout>
        </Section>

        <Section id="communications" eyebrow="Integrations" title="Email, reminders, and calendar invitations" lead="Personalize messages in the organizer UI; the Worker resolves recipients, regenerates trusted calendar data, and records each delivery.">
          <Method verb="POST">/api/workspaces/:workspaceId/events/:eventId/integrations/email/send</Method><CodeBlock title="Send an acceptance email with .ics">{examples.emailCurl}</CodeBlock>
          <div className="docs-card-grid three"><article><h3>Personalized</h3><p>Templates resolve event, speaker, session, and task tokens per recipient.</p></article><article><h3>Recoverable</h3><p>Idempotency keys and durable recipient rows make provider retries safe.</p></article><article><h3>Calendar-ready</h3><p>The server creates recipient-scoped <code>METHOD:REQUEST</code> invitations from published sessions.</p></article></div>
          <h3>Automated reminders</h3><Method verb="GET">/api/workspaces/:workspaceId/events/:eventId/reminders</Method><Method verb="POST">/api/workspaces/:workspaceId/events/:eventId/reminders/run</Method>
          <Callout tone="warning" title="Provider configuration is required"><p>Set <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code> in hosted runtime secrets. Never commit either value to Git.</p></Callout>
        </Section>

        <Section id="crm-airtable" eyebrow="Organization" title="Cross-event CRM and Airtable" lead="D1 remains the private, authoritative contact directory. Airtable is an optional one-way operational mirror.">
          <div className="docs-flow compact" role="list" aria-label="CRM sync direction"><div role="listitem"><strong>Event speakers</strong><small>Normalized by email</small></div><ArrowRight aria-hidden="true" /><div role="listitem"><strong>Workspace CRM</strong><small>D1 source of truth</small></div><ArrowRight aria-hidden="true" /><div role="listitem"><strong>Airtable</strong><small>Safe outbound fields</small></div></div>
          <Method verb="GET">/api/workspaces/:workspaceId/crm</Method><Method verb="PUT">/api/workspaces/:workspaceId/crm</Method><Method verb="POST">/api/workspaces/:workspaceId/crm/actions/add-to-event</Method>
          <h3>Optional Airtable mirror</h3><Method verb="GET">/api/workspaces/:workspaceId/crm/integrations/airtable</Method><Method verb="POST">/api/workspaces/:workspaceId/crm/integrations/airtable/sync</Method><CodeBlock title="Run a one-way sync">{examples.airtableCurl}</CodeBlock>
          <Callout tone="success" title="Private CRM context stays private"><p>Internal notes, activity, pipeline rationale, segments, campaign previews, audit data, and tokens are deliberately excluded from Airtable and every public projection.</p></Callout>
        </Section>

        <Section id="deployment" eyebrow="Operations" title="Production setup" lead="Deploy the Worker-compatible build with D1 and R2 bindings, then add only the providers you use.">
          <Steps><li><span>1</span><div><strong>Build</strong><p>Run <code>npm run build</code>. The build creates the client and Worker output expected by Sites.</p></div></li><li><span>2</span><div><strong>Bind storage</strong><p>Declare <code>DB</code> for D1 and <code>FILES</code> for R2 in <code>.openai/hosting.json</code>.</p></div></li><li><span>3</span><div><strong>Set identity</strong><p>Configure <code>BOOTSTRAP_OWNER_EMAIL</code> to the exact trusted hosting email for first-owner initialization.</p></div></li><li><span>4</span><div><strong>Add providers</strong><p>Keep Resend, Accelevents, Airtable, and cron credentials in hosted secrets only.</p></div></li><li><span>5</span><div><strong>Verify</strong><p>Check health, sign-in, state hydration, anonymous CFP, public feeds, files, and provider status.</p></div></li></Steps>
          <div className="docs-env-table"><div><code>DB</code><span>Required</span><p>D1 binding for application state and operational records</p></div><div><code>FILES</code><span>Required</span><p>R2 binding for private asset bytes</p></div><div><code>BOOTSTRAP_OWNER_EMAIL</code><span>Required</span><p>Exact initial owner email</p></div><div><code>RESEND_API_KEY</code> + <code>EMAIL_FROM</code><span>Optional</span><p>Email, claim links, reminders, and invitations</p></div><div><code>ACCELEVENTS_API_KEY</code> + <code>ACCELEVENTS_EVENT_URL</code><span>Optional</span><p>One-way native program sync</p></div><div><code>AIRTABLE_TOKEN</code> + <code>AIRTABLE_BASE_ID</code><span>Optional</span><p>One-way CRM contact mirror</p></div><div><code>CRON_SECRET</code><span>Optional</span><p>Authenticated HTTP maintenance fallback</p></div></div>
          <CodeBlock title="Release verification">{`npm test
npm run lint
npm run build
npm run test:e2e
npm audit --omit=dev`}</CodeBlock>
        </Section>

        <Section id="errors" eyebrow="Operations" title="Errors and troubleshooting" lead="Every API failure uses a stable envelope and a request ID you can trace without exposing secrets.">
          <CodeBlock title="Error envelope">{examples.errorJson}</CodeBlock>
          <div className="docs-error-table"><div><code>401</code><strong>Not authenticated</strong><p>Sign in, redeem a valid proposal link, or check the event-scoped cookie.</p></div><div><code>403</code><strong>Role forbidden</strong><p>The identity is known but lacks permission for this workspace or route.</p></div><div><code>409</code><strong>Revision conflict</strong><p>Fetch the latest revision, reconcile changes, and retry with a new idempotency key only when appropriate.</p></div><div><code>413 / 415</code><strong>Asset rejected</strong><p>Check byte size, MIME type, file extension, and actual file signature.</p></div><div><code>429</code><strong>Rate limited</strong><p>Respect the response timing and avoid retry loops.</p></div><div><code>503</code><strong>Provider unavailable</strong><p>Add the required hosted secret or review integration status and logs.</p></div></div>
          <h3>Safe retry rules</h3><ul className="docs-bullets"><li>Retry GET requests after transient network or 5xx failures.</li><li>Do not blindly retry mutations. Reconcile revisions and reuse the same idempotency key for the same logical operation.</li><li>Use integration and reminder history to distinguish provider failure from application persistence.</li><li>Use <code>/api/health</code> for storage health; it does not prove third-party credentials are configured.</li></ul>
          <div className="docs-finish"><BookOpen size={24} /><div><strong>Need the complete contract?</strong><p>The repository contains the exact Worker API, production operations guide, schema notes, migrations, and executable tests.</p></div><a href="https://github.com/premhiru/KMS/tree/main/db" target="_blank" rel="noreferrer">Browse the API source <ExternalLink size={14} /></a></div>
        </Section>
      </main>

      <aside className="docs-toc"><span>On this page</span>{docsSections.map((section) => <button key={section.id} className={active === section.id ? 'active' : ''} aria-current={active === section.id ? 'page' : undefined} onClick={() => go(section.id)}>{section.label}</button>)}<div><ShieldCheck size={15} /><p><strong>Security first</strong>Examples use placeholders. Keep all provider keys in hosted secrets.</p></div></aside>
    </div>
  </div>
}
