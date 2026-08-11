import { useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, Check, EyeOff, Plus, Trash2, UserPlus } from 'lucide-react'
import { createId, nowIso, selectEligibleSubmissionsForRound, selectEvaluationRoundProgress, selectEvaluationRounds, selectNextEvaluationRound, selectRoundAssignments, selectRoundSubmissionScore, useApp } from '../../core'
import type { EvaluationAssignment, EvaluationPlan, EvaluationRound, EvaluationRoundStatus, Id, RubricCriterion, SubmissionStatus } from '../../domain'
import './submissions.css'

const defaultRubric: RubricCriterion[] = [
  { id: 'relevance', label: 'Relevance', weight: 35, maxScore: 5 },
  { id: 'originality', label: 'Originality', weight: 25, maxScore: 5 },
  { id: 'clarity', label: 'Clarity', weight: 20, maxScore: 5 },
  { id: 'speaker-fit', label: 'Speaker fit', weight: 20, maxScore: 5 },
]

function localDateTime(value: string): string {
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export interface EvaluationPlanManagerProps {
  initialPlanId?: Id
  initialRoundId?: Id
  onOpenReviewer?: (reviewerEmail: string, roundId: Id, submissionId?: Id) => void
}

export function EvaluationPlanManager({ initialPlanId, initialRoundId, onOpenReviewer }: EvaluationPlanManagerProps) {
  const { state, dispatch } = useApp()
  const plans = state.evaluationPlans ?? []
  const [planId, setPlanId] = useState(initialPlanId ?? plans[0]?.id ?? '')
  const rounds = selectEvaluationRounds(state, planId)
  const [roundId, setRoundId] = useState(initialRoundId ?? rounds[0]?.id ?? '')
  const selectedPlan = plans.find((plan) => plan.id === planId)
  const selectedRound = rounds.find((round) => round.id === roundId) ?? rounds[0]

  function createPlan() {
    const at = nowIso()
    const id = createId('evaluation-plan')
    const firstRoundId = createId('evaluation-round')
    dispatch({ type: 'evaluation/plan/upsert', plan: { id, name: 'New evaluation plan', instructions: '', createdAt: at, updatedAt: at }, at })
    dispatch({ type: 'evaluation/round/upsert', round: { id: firstRoundId, planId: id, name: 'Round 1', position: 1, status: 'draft', dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), blind: false, instructions: '', rubric: defaultRubric.map((criterion) => ({ ...criterion })), createdAt: at, updatedAt: at }, at })
    setPlanId(id)
    setRoundId(firstRoundId)
  }

  function createRound() {
    if (!selectedPlan) return
    const at = nowIso()
    const id = createId('evaluation-round')
    const position = Math.max(0, ...rounds.map((round) => round.position)) + 1
    dispatch({ type: 'evaluation/round/upsert', round: { id, planId: selectedPlan.id, name: `Round ${position}`, position, status: 'draft', dueAt: new Date(Date.now() + position * 7 * 86_400_000).toISOString(), blind: false, instructions: '', rubric: defaultRubric.map((criterion) => ({ ...criterion })), createdAt: at, updatedAt: at }, at })
    setRoundId(id)
  }

  return (
    <section className="sb-plan-manager" aria-labelledby="evaluation-plans-heading">
      <div className="sb-plan-toolbar">
        <div><p className="sb-eyebrow">Evaluation operations</p><h2 id="evaluation-plans-heading">Plans and rounds</h2></div>
        <div><label><span className="sb-sr-only">Evaluation plan</span><select value={planId} onChange={(event) => { setPlanId(event.target.value); setRoundId(selectEvaluationRounds(state, event.target.value)[0]?.id ?? '') }}>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label><button className="sb-button" type="button" onClick={createPlan}><Plus aria-hidden="true" />New plan</button></div>
      </div>

      {!selectedPlan && <div className="sb-empty"><h2>No evaluation plan yet</h2><p>Create a plan to configure reviewer rounds and assignments.</p><button className="sb-button sb-button--primary" type="button" onClick={createPlan}>Create evaluation plan</button></div>}
      {selectedPlan && (
        <>
          <PlanEditor key={selectedPlan.id} plan={selectedPlan} onSave={(plan) => dispatch({ type: 'evaluation/plan/upsert', plan, at: nowIso() })} />
          <div className="sb-plan-layout">
            <aside className="sb-round-list" aria-label="Evaluation rounds">
              {rounds.map((round) => {
                const progress = selectEvaluationRoundProgress(state, round.id)
                return <button type="button" key={round.id} className={round.id === selectedRound?.id ? 'is-selected' : ''} onClick={() => setRoundId(round.id)}><span><strong>{round.name}</strong><small>{round.status} · due {new Date(round.dueAt).toLocaleDateString()}</small></span><b>{progress.percent}%</b></button>
              })}
              <button className="sb-round-list__add" type="button" onClick={createRound}><Plus aria-hidden="true" />Add round</button>
            </aside>
            <main className="sb-round-main">
              {selectedRound && <RoundEditor key={selectedRound.id} round={selectedRound} onOpenReviewer={onOpenReviewer} />}
            </main>
          </div>
        </>
      )}
    </section>
  )
}

function PlanEditor({ plan, onSave }: { plan: EvaluationPlan; onSave: (plan: EvaluationPlan) => void }) {
  const [name, setName] = useState(plan.name)
  const [instructions, setInstructions] = useState(plan.instructions)
  const [saved, setSaved] = useState(false)
  return <form className="sb-plan-header" onSubmit={(event) => { event.preventDefault(); onSave({ ...plan, name: name.trim(), instructions: instructions.trim(), updatedAt: nowIso() }); setSaved(true); window.setTimeout(() => setSaved(false), 1500) }}><label>Plan name<input required value={name} onChange={(event) => setName(event.target.value)} /></label><label>Committee instructions<input value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label><button className="sb-button" type="submit">{saved ? <><Check aria-hidden="true" />Saved</> : 'Save plan'}</button></form>
}

function RoundEditor({ round, onOpenReviewer }: { round: EvaluationRound; onOpenReviewer?: EvaluationPlanManagerProps['onOpenReviewer'] }) {
  const { state, dispatch } = useApp()
  const [name, setName] = useState(round.name)
  const [status, setStatus] = useState<EvaluationRoundStatus>(round.status)
  const [dueAt, setDueAt] = useState(localDateTime(round.dueAt))
  const [blind, setBlind] = useState(round.blind)
  const [instructions, setInstructions] = useState(round.instructions)
  const [rubric, setRubric] = useState(round.rubric)
  const [tracks, setTracks] = useState(round.filter?.tracks ?? [])
  const [submissionStatuses, setSubmissionStatuses] = useState<SubmissionStatus[]>(round.filter?.submissionStatuses ?? ['needs-review', 'in-review'])
  const [reviewerName, setReviewerName] = useState('')
  const [reviewerEmail, setReviewerEmail] = useState('')
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<Id[]>([])
  const [advanceIds, setAdvanceIds] = useState<Id[]>([])
  const [nextReviewerName, setNextReviewerName] = useState('')
  const [nextReviewerEmail, setNextReviewerEmail] = useState('')
  const [notice, setNotice] = useState('')
  const assignments = selectRoundAssignments(state, round.id)
  const progress = selectEvaluationRoundProgress(state, round.id)
  const eligible = useMemo(() => selectEligibleSubmissionsForRound(state, { ...round, filter: { ...round.filter, tracks, submissionStatuses } }), [round, state, submissionStatuses, tracks])
  const nextRound = selectNextEvaluationRound(state, round.id)
  const roundSubmissionIds = [...new Set(assignments.map((assignment) => assignment.submissionId))]
  const terminalSubmissionIds = roundSubmissionIds.filter((submissionId) => assignments.some((assignment) => assignment.submissionId === submissionId && (assignment.status === 'completed' || assignment.status === 'abstained')))
  const totalWeight = rubric.reduce((sum, criterion) => sum + Math.max(0, criterion.weight), 0)

  function saveRound(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim() || !dueAt || rubric.length === 0 || rubric.some((criterion) => !criterion.label.trim() || criterion.weight <= 0 || criterion.maxScore <= 0)) return
    dispatch({ type: 'evaluation/round/upsert', round: { ...round, name: name.trim(), status, dueAt: new Date(dueAt).toISOString(), blind, instructions: instructions.trim(), rubric: rubric.map((criterion) => ({ ...criterion, label: criterion.label.trim() })), filter: { ...round.filter, tracks, submissionStatuses }, updatedAt: nowIso() }, at: nowIso() })
    setNotice('Round configuration saved.')
  }

  function addAssignments(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reviewerName.trim() || !/^\S+@\S+\.\S+$/.test(reviewerEmail.trim()) || selectedSubmissionIds.length === 0) return
    const at = nowIso()
    for (const submissionId of selectedSubmissionIds) {
      const assignment: EvaluationAssignment = { id: createId('evaluation-assignment'), roundId: round.id, submissionId, reviewerName: reviewerName.trim(), reviewerEmail: reviewerEmail.trim().toLowerCase(), status: 'assigned', assignedAt: at, updatedAt: at }
      dispatch({ type: 'evaluation/assignment/upsert', assignment, at })
    }
    setSelectedSubmissionIds([])
    setNotice(`${selectedSubmissionIds.length} reviewer assignment${selectedSubmissionIds.length === 1 ? '' : 's'} created.`)
  }

  function advance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!nextRound || !nextReviewerName.trim() || !/^\S+@\S+\.\S+$/.test(nextReviewerEmail.trim()) || advanceIds.length === 0) return
    const at = nowIso()
    for (const submissionId of advanceIds) {
      dispatch({ type: 'evaluation/advance', advancement: { id: createId('evaluation-advancement'), planId: round.planId, submissionId, fromRoundId: round.id, toRoundId: nextRound.id, advancedAt: at }, assignments: [{ id: createId('evaluation-assignment'), roundId: nextRound.id, submissionId, reviewerName: nextReviewerName.trim(), reviewerEmail: nextReviewerEmail.trim().toLowerCase(), status: 'assigned', assignedAt: at, updatedAt: at }], at })
    }
    setAdvanceIds([])
    setNotice(`${advanceIds.length} submission${advanceIds.length === 1 ? '' : 's'} advanced to ${nextRound.name}.`)
  }

  function toggle<T extends string>(items: T[], value: T, checked: boolean, setter: (items: T[]) => void) {
    setter(checked ? [...new Set([...items, value])] : items.filter((item) => item !== value))
  }

  return (
    <div>
      {notice && <p className="sb-form-notice" role="status">{notice}</p>}
      <div className="sb-round-progress"><div><strong>{progress.percent}%</strong><span>{progress.terminal} of {progress.total} assignments terminal</span></div><div className="sb-progress-track"><span style={{ width: `${progress.percent}%` }} /></div><small>{progress.completed} completed · {progress.abstained} abstained · {progress.inProgress} in progress</small></div>
      <form className="sb-round-config sb-form" onSubmit={saveRound}>
        <div className="sb-form__row"><label>Round name<input required value={name} onChange={(event) => setName(event.target.value)} /></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value as EvaluationRoundStatus)}><option value="draft">Draft</option><option value="open">Open</option><option value="closed">Closed</option></select></label><label>Due date<input required type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label></div>
        <label>Reviewer instructions<textarea rows={3} value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label>
        <label className="sb-check"><input type="checkbox" checked={blind} onChange={(event) => setBlind(event.target.checked)} /><span><strong>Blind review</strong><small>Hide attached speaker identity from reviewer queues.</small></span><EyeOff aria-hidden="true" /></label>
        <fieldset className="sb-filter-fieldset"><legend>Submission filters</legend><div><strong>Tracks</strong>{state.event.tracks.map((track) => <label key={track}><input type="checkbox" checked={tracks.includes(track)} onChange={(event) => toggle(tracks, track, event.target.checked, setTracks)} />{track}</label>)}</div><div><strong>Statuses</strong>{(['needs-review', 'in-review', 'accepted', 'waitlisted'] as SubmissionStatus[]).map((item) => <label key={item}><input type="checkbox" checked={submissionStatuses.includes(item)} onChange={(event) => toggle(submissionStatuses, item, event.target.checked, setSubmissionStatuses)} />{item.replace('-', ' ')}</label>)}</div></fieldset>
        <section className="sb-rubric" aria-labelledby={`rubric-${round.id}`}><div className="sb-card__header"><div><h3 id={`rubric-${round.id}`}>Weighted rubric</h3><p>Weights are normalized automatically. Current total: {totalWeight}.</p></div><button className="sb-button" type="button" onClick={() => setRubric((items) => [...items, { id: createId('criterion'), label: 'New criterion', weight: 10, maxScore: 5 }])}><Plus aria-hidden="true" />Criterion</button></div>{rubric.map((criterion) => <div className="sb-rubric-row" key={criterion.id}><label>Criterion<input required value={criterion.label} onChange={(event) => setRubric((items) => items.map((item) => item.id === criterion.id ? { ...item, label: event.target.value } : item))} /></label><label>Weight<input required min="1" max="100" type="number" value={criterion.weight} onChange={(event) => setRubric((items) => items.map((item) => item.id === criterion.id ? { ...item, weight: Number(event.target.value) } : item))} /></label><label>Scale<input required min="2" max="20" type="number" value={criterion.maxScore} onChange={(event) => setRubric((items) => items.map((item) => item.id === criterion.id ? { ...item, maxScore: Number(event.target.value) } : item))} /></label><button className="sb-icon-button sb-icon-button--danger" type="button" aria-label={`Delete ${criterion.label}`} onClick={() => setRubric((items) => items.filter((item) => item.id !== criterion.id))}><Trash2 aria-hidden="true" /></button></div>)}</section>
        <button className="sb-button sb-button--primary" type="submit">Save round</button>
      </form>

      <section className="sb-assignment-section"><div className="sb-card__header"><div><h3>Reviewer assignments</h3><p>Only assigned submissions appear in a reviewer’s queue.</p></div></div><form onSubmit={addAssignments}><div className="sb-form__row sb-form__row--two"><label>Reviewer name<input required value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} /></label><label>Reviewer email<input required type="email" value={reviewerEmail} onChange={(event) => setReviewerEmail(event.target.value)} /></label></div><div className="sb-assignment-picker">{eligible.map((submission) => <label key={submission.id}><input type="checkbox" checked={selectedSubmissionIds.includes(submission.id)} onChange={(event) => toggle(selectedSubmissionIds, submission.id, event.target.checked, setSelectedSubmissionIds)} /><span><strong>{submission.title}</strong><small>{submission.track} · {submission.format}</small></span></label>)}</div><button className="sb-button" type="submit"><UserPlus aria-hidden="true" />Assign selected</button></form><div className="sb-assignment-table">{assignments.map((assignment) => <div key={assignment.id}><span><strong>{assignment.reviewerName}</strong><small>{assignment.reviewerEmail}</small></span><span>{state.submissions.find((item) => item.id === assignment.submissionId)?.title}</span><b className={`sb-badge sb-badge--${assignment.status === 'completed' ? 'accepted' : assignment.status === 'abstained' ? 'declined' : 'in-review'}`}>{assignment.status}</b>{onOpenReviewer && <button className="sb-button" type="button" onClick={() => onOpenReviewer(assignment.reviewerEmail, round.id, assignment.submissionId)}>Open queue</button>}<button className="sb-icon-button sb-icon-button--danger" type="button" aria-label={`Delete assignment for ${assignment.reviewerName}`} onClick={() => dispatch({ type: 'evaluation/assignment/delete', id: assignment.id, at: nowIso() })}><Trash2 aria-hidden="true" /></button></div>)}</div></section>

      {nextRound && <section className="sb-advancement"><div className="sb-card__header"><div><h3>Advance to {nextRound.name}</h3><p>Promotion is idempotent; repeating it will not duplicate the reviewer assignment.</p></div><ArrowRight aria-hidden="true" /></div><form onSubmit={advance}><div className="sb-form__row sb-form__row--two"><label>Next-round reviewer name<input required value={nextReviewerName} onChange={(event) => setNextReviewerName(event.target.value)} /></label><label>Reviewer email<input required type="email" value={nextReviewerEmail} onChange={(event) => setNextReviewerEmail(event.target.value)} /></label></div><div className="sb-assignment-picker">{terminalSubmissionIds.map((submissionId) => { const submission = state.submissions.find((item) => item.id === submissionId); if (!submission) return null; return <label key={submission.id}><input type="checkbox" checked={advanceIds.includes(submission.id)} onChange={(event) => toggle(advanceIds, submission.id, event.target.checked, setAdvanceIds)} /><span><strong>{submission.title}</strong><small>Weighted score {selectRoundSubmissionScore(state, round.id, submission.id)?.toFixed(2) ?? '—'} / 5</small></span></label> })}</div><button className="sb-button sb-button--primary" type="submit">Advance selected <ArrowRight aria-hidden="true" /></button></form></section>}
    </div>
  )
}
