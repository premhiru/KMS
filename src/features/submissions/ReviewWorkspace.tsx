import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { BarChart3, Check, ClipboardCheck, EyeOff, Search, Star } from 'lucide-react'
import {
  createId,
  nowIso,
  selectEvaluationRounds,
  selectReviewerQueue,
  selectRoundSubmissionScore,
  weightedReviewAverage,
  useApp,
} from '../../core'
import type { EvaluationAssignment, EvaluationRound, Id, Review, ReviewerQueueItem, SubmissionStatus } from '../../core'
import { EvaluationPlanManager } from './EvaluationPlanManager'
import './submissions.css'

type DecisionStatus = Extract<SubmissionStatus, 'accepted' | 'waitlisted' | 'declined'>

export interface ReviewWorkspaceProps {
  initialSubmissionId?: Id
  currentReviewerEmail?: string
  reviewerName?: string
  defaultMode?: 'reviewer' | 'organizer'
  onDecision?: (submissionId: Id, status: DecisionStatus) => void
}

export function ReviewWorkspace({
  initialSubmissionId,
  currentReviewerEmail,
  reviewerName = '',
  defaultMode = 'reviewer',
  onDecision,
}: ReviewWorkspaceProps) {
  const { state, dispatch, session, submitAssignedReview } = useApp()
  const reviewerEmails = useMemo(() => [...new Set((state.evaluationAssignments ?? []).map((item) => item.reviewerEmail.trim().toLowerCase()))], [state.evaluationAssignments])
  const [mode, setMode] = useState(defaultMode)
  const [demoEmail, setDemoEmail] = useState(reviewerEmails[0] ?? '')
  const reviewerEmail = (currentReviewerEmail ?? demoEmail).trim().toLowerCase()
  const rounds = selectEvaluationRounds(state)
  const [roundId, setRoundId] = useState<Id | ''>('')
  const [query, setQuery] = useState('')
  const queue = useMemo(() => selectReviewerQueue(state, reviewerEmail, roundId ? { roundId } : {}), [reviewerEmail, roundId, state])
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<Id | undefined>(() => {
    if (!initialSubmissionId) return undefined
    return (state.evaluationAssignments ?? []).find((item) => item.submissionId === initialSubmissionId)?.id
  })
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return queue.filter((item) => !needle || `${item.submission.title} ${item.submission.track} ${item.round.name}`.toLowerCase().includes(needle))
  }, [query, queue])
  const selected = queue.find((item) => item.assignment.id === selectedAssignmentId) ?? rows[0]

  useEffect(() => {
    if (!currentReviewerEmail && selected && selected.assignment.status === 'assigned') {
      dispatch({ type: 'evaluation/assignment/start', id: selected.assignment.id, at: nowIso() })
    }
  }, [currentReviewerEmail, dispatch, selected])

  function openReviewer(email: string, nextRoundId: Id, submissionId?: Id) {
    setMode('reviewer')
    setDemoEmail(email)
    setRoundId(nextRoundId)
    const assignment = (state.evaluationAssignments ?? []).find((item) => item.roundId === nextRoundId && item.reviewerEmail.toLowerCase() === email.toLowerCase() && (!submissionId || item.submissionId === submissionId))
    setSelectedAssignmentId(assignment?.id)
  }

  function decide(submissionId: Id, status: DecisionStatus) {
    dispatch({ type: 'submission/decide', id: submissionId, status, at: nowIso() })
    onDecision?.(submissionId, status)
  }

  async function saveReview(review: Review) {
    if (session?.role === 'reviewer' && review.assignmentId) {
      await submitAssignedReview({ assignmentId: review.assignmentId, submissionId: review.submissionId, review: { scores: review.scores, answers: review.answers, note: review.note }, assignmentStatus: 'completed' })
      return
    }
    dispatch({ type: 'review/upsert', review, at: nowIso() })
  }

  async function abstain(assignment: EvaluationAssignment, reason: string) {
    if (session?.role === 'reviewer') {
      const round = rounds.find((item) => item.id === assignment.roundId)
      const scores = Object.fromEntries((round?.rubric ?? []).map((criterion) => [criterion.id, Math.ceil(criterion.maxScore / 2)]))
      await submitAssignedReview({ assignmentId: assignment.id, submissionId: assignment.submissionId, review: { scores, note: `Abstained: ${reason}` }, assignmentStatus: 'abstained', abstain: true })
      return
    }
    dispatch({ type: 'evaluation/assignment/abstain', id: assignment.id, reason, at: nowIso() })
  }

  async function reopen(assignment: EvaluationAssignment) {
    if (session?.role === 'reviewer') {
      const round = rounds.find((item) => item.id === assignment.roundId)
      const existing = state.reviews.find((review) => review.assignmentId === assignment.id)
      const scores = existing?.scores ?? Object.fromEntries((round?.rubric ?? []).map((criterion) => [criterion.id, Math.ceil(criterion.maxScore / 2)]))
      await submitAssignedReview({ assignmentId: assignment.id, submissionId: assignment.submissionId, review: { scores, note: existing?.note ?? '' }, assignmentStatus: 'assigned', abstain: false })
      return
    }
    dispatch({ type: 'evaluation/assignment/reopen', id: assignment.id, at: nowIso() })
  }

  return (
    <section className="sb-feature" aria-labelledby="review-workspace-title">
      <header className="sb-feature__header">
        <div><p className="sb-eyebrow">Program committee</p><h1 id="review-workspace-title">Evaluation workspace</h1><p>Configure weighted rounds, assign reviewers, and complete an identity-filtered review queue.</p></div>
        <div className="sb-stat"><ClipboardCheck aria-hidden="true" /><span><strong>{state.reviews.length}</strong> reviews</span></div>
      </header>
      <div className="sb-workspace-tabs" role="group" aria-label="Evaluation workspace view">
        <button type="button" aria-pressed={mode === 'reviewer'} className={mode === 'reviewer' ? 'is-selected' : ''} onClick={() => setMode('reviewer')}>Reviewer queue</button>
        {!currentReviewerEmail && <button type="button" aria-pressed={mode === 'organizer'} className={mode === 'organizer' ? 'is-selected' : ''} onClick={() => setMode('organizer')}>Plans and assignments</button>}
      </div>

      {mode === 'organizer' && <EvaluationPlanManager onOpenReviewer={openReviewer} />}
      {mode === 'reviewer' && (
        <>
          <div className="sb-reviewer-context">
            {!currentReviewerEmail && <label>Preview reviewer<select value={demoEmail} onChange={(event) => { setDemoEmail(event.target.value); setSelectedAssignmentId(undefined) }}>{reviewerEmails.map((email) => <option key={email}>{email}</option>)}</select></label>}
            {currentReviewerEmail && <p>Signed in as <strong>{reviewerEmail}</strong>. Only assignments for this email are shown.</p>}
            <label>Round<select value={roundId} onChange={(event) => { setRoundId(event.target.value); setSelectedAssignmentId(undefined) }}><option value="">All assigned rounds</option>{rounds.map((round) => <option key={round.id} value={round.id}>{round.name} · {round.status}</option>)}</select></label>
          </div>
          <div className="sb-review-layout">
            <aside className="sb-review-queue" aria-label="Assigned proposal review queue">
              <label className="sb-search"><span className="sb-sr-only">Search assigned review queue</span><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search assigned queue" /></label>
              <div>
                {rows.map((item) => {
                  const score = selectRoundSubmissionScore(state, item.round.id, item.submission.id)
                  return <button type="button" key={item.assignment.id} className={`sb-review-queue__item${item.assignment.id === selected?.assignment.id ? ' is-selected' : ''}`} onClick={() => setSelectedAssignmentId(item.assignment.id)} aria-pressed={item.assignment.id === selected?.assignment.id}><span><strong>{item.submission.title}</strong><small>{item.round.name} · {item.assignment.status}</small></span><span className="sb-review-queue__score">{score === undefined ? '—' : score.toFixed(1)}</span></button>
                })}
                {rows.length === 0 && <p className="sb-muted">No assignments match this reviewer and round.</p>}
              </div>
            </aside>
            <section className="sb-review-main" aria-label="Proposal evaluation">
              {!selected && <div className="sb-empty"><ClipboardCheck aria-hidden="true" /><h2>No assigned proposal selected</h2><p>Ask an organizer to assign your signed-in email to an open evaluation round.</p></div>}
              {selected && <AssignmentReviewEditor key={selected.assignment.id} item={selected} reviews={state.reviews.filter((review) => review.submissionId === selected.submission.id && review.roundId === selected.round.id)} fallbackReviewerName={reviewerName} onSave={saveReview} onAbstain={abstain} onReopen={reopen} onDecide={currentReviewerEmail ? undefined : decide} />}
            </section>
          </div>
        </>
      )}
    </section>
  )
}

interface AssignmentReviewEditorProps {
  item: ReviewerQueueItem
  reviews: Review[]
  fallbackReviewerName: string
  onSave: (review: Review) => Promise<void> | void
  onAbstain: (assignment: EvaluationAssignment, reason: string) => Promise<void> | void
  onReopen: (assignment: EvaluationAssignment) => Promise<void> | void
  onDecide?: (submissionId: Id, status: DecisionStatus) => void
}

function initialScores(round: EvaluationRound, review?: Review): Record<string, number> {
  return Object.fromEntries(round.rubric.filter((criterion) => (criterion.type ?? 'rating') === 'rating').map((criterion) => [criterion.id, review?.scores[criterion.id] ?? Math.ceil(criterion.maxScore / 2)]))
}

function AssignmentReviewEditor({ item, reviews, fallbackReviewerName, onSave, onAbstain, onReopen, onDecide }: AssignmentReviewEditorProps) {
  const existing = reviews.find((review) => review.assignmentId === item.assignment.id)
  const [scores, setScores] = useState<Record<string, number>>(() => initialScores(item.round, existing))
  const [answers, setAnswers] = useState<Record<string, number | string>>(() => ({ ...initialScores(item.round, existing), ...existing?.answers }))
  const [note, setNote] = useState(existing?.note ?? '')
  const [abstainReason, setAbstainReason] = useState(item.assignment.abstainReason ?? '')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const now = Date.now()
  const reviewOpen = item.round.status === 'open' && Date.parse(item.round.dueAt) >= now && (!item.round.opensAt || Date.parse(item.round.opensAt) <= now)
  const weightedScore = weightedReviewAverage(item.round, { scores })

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reviewOpen) { setError('This round is not currently open for reviews.'); return }
    const missing = item.round.rubric.find((criterion) => criterion.required !== false && (answers[criterion.id] === undefined || String(answers[criterion.id]).trim() === ''))
    if (missing) { setError(`${missing.label} is required.`); return }
    try {
      await onSave({ id: existing?.id ?? createId('review'), submissionId: item.submission.id, roundId: item.round.id, assignmentId: item.assignment.id, reviewerName: item.assignment.reviewerName || fallbackReviewerName || item.assignment.reviewerEmail, scores, answers, note: note.trim(), updatedAt: nowIso() })
      setError('')
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1600)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The review could not be saved.')
    }
  }

  async function abstain() {
    try {
      await onAbstain(item.assignment, abstainReason.trim())
      setError('')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The abstention could not be saved.')
    }
  }

  async function reopen() {
    try {
      await onReopen(item.assignment)
      setError('')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The assignment could not be reopened.')
    }
  }

  const roundAggregate = reviews.length === 0 ? undefined : reviews.reduce((sum, review) => sum + weightedReviewAverage(item.round, review), 0) / reviews.length
  return (
    <div>
      <header className="sb-review-title">
        <div><span className={`sb-badge sb-badge--${item.submission.status}`}>{item.submission.status.replace('-', ' ')}</span><h2>{item.submission.title}</h2><p>{item.submission.format} · {item.submission.durationMinutes} min · {item.submission.track}</p></div>
        <div className="sb-aggregate"><BarChart3 aria-hidden="true" /><span><strong>{roundAggregate === undefined ? '—' : roundAggregate.toFixed(2)}</strong><small>{item.round.name} / 5</small></span></div>
      </header>
      <div className="sb-round-meta"><span>{item.round.status}</span><span>Due {new Date(item.round.dueAt).toLocaleString()}</span><span>{item.assignment.status}</span></div>
      {item.blind ? <div className="sb-blind-notice"><EyeOff aria-hidden="true" /><span><strong>Blind review</strong><small>Speaker identity is hidden for this round.</small></span></div> : <div className="sb-review-speakers">{item.speakers.map((speaker) => <span key={speaker.id}><strong>{speaker.firstName} {speaker.lastName}</strong><small>{speaker.jobTitle}{speaker.company ? ` at ${speaker.company}` : ''}</small></span>)}</div>}
      <article className="sb-abstract"><p className="sb-eyebrow">Abstract</p>{item.submission.abstract.split('\n').map((paragraph, index) => <p key={`${paragraph}-${index}`}>{paragraph}</p>)}</article>
      {item.round.instructions && <p className="sb-review-instructions"><strong>Reviewer instructions:</strong> {item.round.instructions}</p>}

      {item.assignment.status === 'abstained' ? (
        <section className="sb-abstain"><h3>You abstained from this assignment</h3><p>{item.assignment.abstainReason}</p>{error && <p className="sb-form-error" role="alert">{error}</p>}<button className="sb-button" type="button" onClick={() => void reopen()}>Reopen assignment</button></section>
      ) : (
        <form className="sb-score-form" onSubmit={submit}>
          {!reviewOpen && <p className="sb-form-error" role="alert">Reviews are disabled because this round is draft, closed, not yet open, or past due.</p>}
          {error && <p className="sb-form-error" role="alert">{error}</p>}
          <div className="sb-criteria">
            {item.round.rubric.map((criterion) => (
              <fieldset key={criterion.id}>
                <legend><strong>{criterion.label} <small>({criterion.weight}% weight)</small></strong>{criterion.description && <small>{criterion.description}</small>}</legend>
                {(criterion.type ?? 'rating') === 'rating' && <div className="sb-rating">
                  {Array.from({ length: criterion.maxScore }, (_, index) => index + 1).map((value) => <label key={value} className={scores[criterion.id] === value ? 'is-selected' : ''}><input type="radio" name={`${item.assignment.id}-${criterion.id}`} value={value} checked={scores[criterion.id] === value} onChange={() => { setScores((current) => ({ ...current, [criterion.id]: value })); setAnswers((current) => ({ ...current, [criterion.id]: value })) }} /><Star aria-hidden="true" /><span>{value}</span></label>)}
                </div>}
                {criterion.type === 'select' && <select required={criterion.required !== false} value={String(answers[criterion.id] ?? '')} onChange={(event) => setAnswers((current) => ({ ...current, [criterion.id]: event.target.value }))}><option value="">Select an option</option>{(criterion.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select>}
                {criterion.type === 'text' && <textarea required={criterion.required !== false} rows={4} value={String(answers[criterion.id] ?? '')} onChange={(event) => setAnswers((current) => ({ ...current, [criterion.id]: event.target.value }))} />}
              </fieldset>
            ))}
          </div>
          <label className="sb-field">Private committee notes<textarea rows={5} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Strengths, risks, suggested changes, or evidence for your score" /></label>
          <div className="sb-form__actions"><button className="sb-button sb-button--primary" type="submit" disabled={!reviewOpen}>{saved ? <><Check aria-hidden="true" />Review saved</> : existing ? 'Update review' : 'Submit review'}</button><span className="sb-inline-score">Weighted score: <strong>{weightedScore.toFixed(2)}</strong> / 5</span></div>
          <div className="sb-abstain-controls"><label>Cannot review?<input value={abstainReason} onChange={(event) => setAbstainReason(event.target.value)} placeholder="Required reason, e.g. conflict of interest" /></label><button className="sb-button sb-button--danger" type="button" disabled={!abstainReason.trim()} onClick={() => void abstain()}>Abstain</button></div>
        </form>
      )}

      <section className="sb-round-history" aria-labelledby={`history-${item.assignment.id}`}>
        <div className="sb-card__header"><div><p className="sb-eyebrow">Round history</p><h3 id={`history-${item.assignment.id}`}>{item.round.name} reviews</h3></div></div>
        {reviews.length === 0 && <p className="sb-muted">No completed reviews in this round.</p>}
        {reviews.map((review) => <article key={review.id}><div><strong>{review.reviewerName}</strong><span>{weightedReviewAverage(item.round, review).toFixed(2)} / 5</span></div><dl>{item.round.rubric.map((criterion) => <div key={criterion.id}><dt>{criterion.label}</dt><dd>{review.answers?.[criterion.id] ?? review.scores[criterion.id] ?? '—'}</dd></div>)}</dl>{review.note && <p>{review.note}</p>}</article>)}
      </section>

      {onDecide && <section className="sb-decision sb-decision--review" aria-labelledby={`final-decision-${item.submission.id}`}>
        <div><p className="sb-eyebrow">Committee outcome</p><h3 id={`final-decision-${item.submission.id}`}>Record final decision</h3><p>Accepting creates speaker onboarding tasks idempotently.</p></div>
        <div className="sb-decision__buttons"><button className="sb-button sb-button--success" type="button" onClick={() => onDecide(item.submission.id, 'accepted')}>Accept</button><button className="sb-button sb-button--warning" type="button" onClick={() => onDecide(item.submission.id, 'waitlisted')}>Waitlist</button><button className="sb-button sb-button--danger" type="button" onClick={() => onDecide(item.submission.id, 'declined')}>Decline</button></div>
      </section>}
    </div>
  )
}
