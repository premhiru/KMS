import { useMemo, useState, type FormEvent } from 'react'
import { BarChart3, Check, ClipboardCheck, Search, Star, Trash2 } from 'lucide-react'
import { createId, nowIso, reviewAverage, selectSubmissionScore, selectSubmissionSpeakers, useApp } from '../../core'
import type { Id, Review, ReviewCriterion, Submission, SubmissionStatus } from '../../domain'
import './submissions.css'

const criteria: Array<{ key: ReviewCriterion; label: string; description: string }> = [
  { key: 'relevance', label: 'Relevance', description: 'Fit for the event audience and selected track' },
  { key: 'originality', label: 'Originality', description: 'Fresh perspective, evidence, or practical insight' },
  { key: 'clarity', label: 'Clarity', description: 'Focused premise and concrete attendee takeaways' },
  { key: 'speaker-fit', label: 'Speaker fit', description: 'Credibility and experience to deliver this session' },
]

const roundNames = ['Round 1', 'Round 2', 'Final'] as const

export interface ReviewWorkspaceProps {
  initialSubmissionId?: Id
  reviewerName?: string
  onDecision?: (submissionId: Id, status: Extract<SubmissionStatus, 'accepted' | 'waitlisted' | 'declined'>) => void
}

export function ReviewWorkspace({ initialSubmissionId, reviewerName = '', onDecision }: ReviewWorkspaceProps) {
  const { state, dispatch } = useApp()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<Id | undefined>(initialSubmissionId ?? state.submissions.find((item) => item.status === 'needs-review' || item.status === 'in-review')?.id ?? state.submissions[0]?.id)
  const selected = state.submissions.find((submission) => submission.id === selectedId)
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return state.submissions.filter((submission) => {
      const speakerNames = selectSubmissionSpeakers(state, submission.id).map((speaker) => `${speaker.firstName} ${speaker.lastName}`).join(' ')
      return !needle || `${submission.title} ${submission.track} ${speakerNames}`.toLowerCase().includes(needle)
    }).sort((left, right) => {
      const priority = (status: SubmissionStatus) => status === 'needs-review' ? 0 : status === 'in-review' ? 1 : 2
      return priority(left.status) - priority(right.status) || left.updatedAt.localeCompare(right.updatedAt)
    })
  }, [query, state])

  function decide(status: Extract<SubmissionStatus, 'accepted' | 'waitlisted' | 'declined'>) {
    if (!selected) return
    dispatch({ type: 'submission/decide', id: selected.id, status, at: nowIso() })
    onDecision?.(selected.id, status)
  }

  return (
    <section className="sb-feature" aria-labelledby="review-workspace-title">
      <header className="sb-feature__header">
        <div><p className="sb-eyebrow">Program committee</p><h1 id="review-workspace-title">Review workspace</h1><p>Score proposals consistently across review rounds and record a final decision.</p></div>
        <div className="sb-stat"><ClipboardCheck aria-hidden="true" /><span><strong>{state.reviews.length}</strong> reviews</span></div>
      </header>

      <div className="sb-review-layout">
        <aside className="sb-review-queue" aria-label="Proposal review queue">
          <label className="sb-search"><span className="sb-sr-only">Search review queue</span><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search review queue" /></label>
          <div role="list">
            {rows.map((submission) => {
              const reviews = state.reviews.filter((review) => review.submissionId === submission.id)
              const score = selectSubmissionScore(state, submission.id)
              return <button type="button" role="listitem" key={submission.id} className={`sb-review-queue__item${submission.id === selectedId ? ' is-selected' : ''}`} onClick={() => setSelectedId(submission.id)} aria-current={submission.id === selectedId ? 'true' : undefined}><span><strong>{submission.title}</strong><small>{submission.track} · {reviews.length} review{reviews.length === 1 ? '' : 's'}</small></span><span className="sb-review-queue__score">{score === undefined ? '—' : score.toFixed(1)}</span></button>
            })}
          </div>
        </aside>

        <main className="sb-review-main">
          {!selected && <div className="sb-empty"><ClipboardCheck aria-hidden="true" /><h2>Select a proposal to review</h2></div>}
          {selected && <ReviewEditor key={selected.id} submission={selected} reviews={state.reviews.filter((review) => review.submissionId === selected.id)} reviewerName={reviewerName} speakers={selectSubmissionSpeakers(state, selected.id)} onSave={(review) => dispatch({ type: 'review/upsert', review, at: nowIso() })} onDelete={(id) => dispatch({ type: 'review/delete', id, at: nowIso() })} onDecide={decide} />}
        </main>
      </div>
    </section>
  )
}

interface ReviewEditorProps {
  submission: Submission
  reviews: Review[]
  reviewerName: string
  speakers: ReturnType<typeof selectSubmissionSpeakers>
  onSave: (review: Review) => void
  onDelete: (id: Id) => void
  onDecide: (status: Extract<SubmissionStatus, 'accepted' | 'waitlisted' | 'declined'>) => void
}

function ReviewEditor({ submission, reviews, reviewerName: initialReviewerName, speakers, onSave, onDelete, onDecide }: ReviewEditorProps) {
  const [name, setName] = useState(initialReviewerName)
  const [round, setRound] = useState<(typeof roundNames)[number]>('Round 1')
  const [scores, setScores] = useState<Record<ReviewCriterion, number>>({ relevance: 3, originality: 3, clarity: 3, 'speaker-fit': 3 })
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const aggregate = reviews.length === 0 ? undefined : reviews.reduce((sum, review) => sum + reviewAverage(review.scores), 0) / reviews.length

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim()) {
      setError('Enter the reviewer name before saving.')
      return
    }
    const storedReviewerName = `${name.trim()} · ${round}`
    const existing = reviews.find((review) => review.reviewerName === storedReviewerName)
    onSave({ id: existing?.id ?? createId('review'), submissionId: submission.id, reviewerName: storedReviewerName, scores, note: note.trim(), updatedAt: nowIso() })
    setError('')
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }

  return (
    <div>
      <header className="sb-review-title">
        <div><span className={`sb-badge sb-badge--${submission.status}`}>{submission.status.replace('-', ' ')}</span><h2>{submission.title}</h2><p>{submission.format} · {submission.durationMinutes} min · {submission.track}</p></div>
        <div className="sb-aggregate"><BarChart3 aria-hidden="true" /><span><strong>{aggregate === undefined ? '—' : aggregate.toFixed(2)}</strong><small>aggregate / 5</small></span></div>
      </header>
      <div className="sb-review-speakers">{speakers.map((speaker) => <span key={speaker.id}><strong>{speaker.firstName} {speaker.lastName}</strong><small>{speaker.jobTitle}{speaker.company ? ` at ${speaker.company}` : ''}</small></span>)}</div>
      <article className="sb-abstract"><p className="sb-eyebrow">Abstract</p>{submission.abstract.split('\n').map((paragraph, index) => <p key={`${paragraph}-${index}`}>{paragraph}</p>)}</article>

      <form className="sb-score-form" onSubmit={submit}>
        <div className="sb-score-form__identity"><label>Reviewer name<input required aria-invalid={Boolean(error)} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /></label><label>Review round<select value={round} onChange={(event) => setRound(event.target.value as (typeof roundNames)[number])}>{roundNames.map((item) => <option key={item}>{item}</option>)}</select></label></div>
        {error && <p className="sb-form-error" role="alert">{error}</p>}
        <div className="sb-criteria">
          {criteria.map((criterion) => (
            <fieldset key={criterion.key}>
              <legend><strong>{criterion.label}</strong><small>{criterion.description}</small></legend>
              <div className="sb-rating">
                {[1, 2, 3, 4, 5].map((value) => <label key={value} className={scores[criterion.key] === value ? 'is-selected' : ''}><input type="radio" name={criterion.key} value={value} checked={scores[criterion.key] === value} onChange={() => setScores((current) => ({ ...current, [criterion.key]: value }))} /><Star aria-hidden="true" /><span>{value}</span></label>)}
              </div>
            </fieldset>
          ))}
        </div>
        <label className="sb-field">Private committee notes<textarea rows={5} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Strengths, risks, suggested changes, or evidence for your score" /></label>
        <div className="sb-form__actions"><button className="sb-button sb-button--primary" type="submit">{saved ? <><Check aria-hidden="true" />Review saved</> : 'Save review'}</button><span className="sb-inline-score">Your score: <strong>{reviewAverage(scores).toFixed(2)}</strong> / 5</span></div>
      </form>

      <section className="sb-round-history" aria-labelledby={`history-${submission.id}`}>
        <div className="sb-card__header"><div><p className="sb-eyebrow">Round history</p><h3 id={`history-${submission.id}`}>Committee reviews</h3></div></div>
        {reviews.length === 0 && <p className="sb-muted">No reviews saved yet.</p>}
        {reviews.map((review) => <article key={review.id}><div><strong>{review.reviewerName}</strong><span>{reviewAverage(review.scores).toFixed(2)} / 5</span><button type="button" className="sb-icon-button sb-icon-button--danger" aria-label={`Delete review by ${review.reviewerName}`} onClick={() => onDelete(review.id)}><Trash2 aria-hidden="true" /></button></div><dl>{criteria.map((criterion) => <div key={criterion.key}><dt>{criterion.label}</dt><dd>{review.scores[criterion.key]}</dd></div>)}</dl>{review.note && <p>{review.note}</p>}</article>)}
      </section>

      <section className="sb-decision sb-decision--review" aria-labelledby={`final-decision-${submission.id}`}>
        <div><p className="sb-eyebrow">Final decision</p><h3 id={`final-decision-${submission.id}`}>Record committee outcome</h3><p>Accepting automatically creates onboarding tasks for every attached speaker.</p></div>
        <div className="sb-decision__buttons"><button className="sb-button sb-button--success" type="button" onClick={() => onDecide('accepted')}>Accept</button><button className="sb-button sb-button--warning" type="button" onClick={() => onDecide('waitlisted')}>Waitlist</button><button className="sb-button sb-button--danger" type="button" onClick={() => onDecide('declined')}>Decline</button></div>
      </section>
    </div>
  )
}
