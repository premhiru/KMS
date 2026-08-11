import { selectDashboardMetrics, selectOnboardingPercent, selectSpeaker, speakerName, useApp } from '../../core'
import './dashboard.css'

interface DashboardProps { onNavigate: (route: string) => void }

export function Dashboard({ onNavigate }: DashboardProps) {
  const { state, persistenceError } = useApp()
  const metrics = selectDashboardMetrics(state)
  const outstanding = state.tasks.filter((task) => !task.completedAt).slice(0, 6)
  const recent = [...state.submissions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)

  return <div className="feature-page dashboard-page">
    <div className="feature-heading">
      <div><span className="eyebrow">LIVE EVENT OPERATIONS</span><h1>Good morning, Sarah</h1><p>Every number below is derived from persisted event data.</p></div>
      <div className="button-row"><button className="button secondary" onClick={() => onNavigate('event')}>View public event</button><button className="button primary" onClick={() => onNavigate('cfp')}>Open CFP</button></div>
    </div>
    {persistenceError && <div className="alert error" role="alert">Browser persistence failed: {persistenceError}</div>}
    <div className="metric-grid">
      <button onClick={() => onNavigate('submissions')}><span>Submissions</span><strong>{metrics.totalSubmissions}</strong><small>{metrics.needsReview} awaiting decisions</small></button>
      <button onClick={() => onNavigate('speakers')}><span>Confirmed speakers</span><strong>{metrics.confirmedSpeakers}</strong><small>{metrics.onboardingPercent}% onboarding complete</small></button>
      <button onClick={() => onNavigate('agenda')}><span>Scheduled sessions</span><strong>{metrics.scheduledSessions}</strong><small>{metrics.unscheduledSessions} accepted and unscheduled</small></button>
      <button onClick={() => onNavigate('portal')}><span>Overdue tasks</span><strong>{metrics.overdueTasks}</strong><small>Needs organizer attention</small></button>
    </div>
    <div className="dashboard-grid">
      <section className="card"><div className="card-heading"><div><h2>Recent submissions</h2><p>Latest proposal activity</p></div><button className="text-button" onClick={() => onNavigate('submissions')}>Manage all</button></div>
        <div className="stack-list">{recent.map((submission) => <button className="stack-row" key={submission.id} onClick={() => onNavigate('submissions')}><div><strong>{submission.title}</strong><span>{submission.track} · {submission.format}</span></div><span className={`status status-${submission.status}`}>{submission.status.replace('-', ' ')}</span></button>)}</div>
      </section>
      <section className="card"><div className="card-heading"><div><h2>Outstanding onboarding</h2><p>Real-time participant tasks</p></div><button className="text-button" onClick={() => onNavigate('portal')}>Open portal</button></div>
        <div className="stack-list">{outstanding.map((task) => { const speaker = selectSpeaker(state, task.speakerId); return <div className="stack-row" key={task.id}><div><strong>{task.title}</strong><span>{speaker ? speakerName(speaker) : 'Unknown speaker'} · due {new Date(task.dueAt).toLocaleDateString()}</span></div>{speaker && <b>{selectOnboardingPercent(state, speaker.id)}%</b>}</div> })}</div>
      </section>
    </div>
    <section className="card quick-start"><div><span className="eyebrow">DEMO WALKTHROUGH</span><h2>Run the complete acceptance journey</h2><p>Publish a CFP, submit a proposal, review it, accept the speaker, finish onboarding, schedule the session, and publish the public agenda.</p></div><div className="button-row"><button className="button secondary" onClick={() => onNavigate('settings')}>Configure event</button><button className="button primary" onClick={() => onNavigate('cfp-builder')}>Build submission form</button></div></section>
  </div>
}
