import { useMemo, useState, type FormEvent } from 'react'
import { Check, ChevronRight, FileText, Search, Trash2, Users } from 'lucide-react'
import { selectSubmissionScore, selectSubmissionSpeakers, useApp, type Id, type Submission, type SubmissionStatus } from '../../core'
import './submissions.css'

const statuses: SubmissionStatus[] = ['needs-review', 'in-review', 'accepted', 'waitlisted', 'declined']

const statusLabels: Record<SubmissionStatus, string> = {
  'needs-review': 'Needs review',
  'in-review': 'In review',
  accepted: 'Accepted',
  waitlisted: 'Waitlisted',
  declined: 'Declined',
}

export interface OrganizerSubmissionsProps {
  initialSelectedId?: Id
  onOpenReview?: (submissionId: Id) => void
}

export function OrganizerSubmissions({ initialSelectedId, onOpenReview }: OrganizerSubmissionsProps) {
  const { state, dispatch, api, persistenceMode } = useApp()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | SubmissionStatus>('all')
  const [track, setTrack] = useState('all')
  const submitted = useMemo(() => state.submissions.filter((submission) => submission.lifecycle !== 'draft'), [state.submissions])
  const [selectedId, setSelectedId] = useState<Id | undefined>(initialSelectedId ?? submitted[0]?.id)
  const [notice, setNotice] = useState('')
  const [notifying, setNotifying] = useState(false)

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return submitted.filter((submission) => {
      const speakers = selectSubmissionSpeakers(state, submission.id)
      const haystack = [submission.title, submission.abstract, submission.track, submission.format, ...speakers.flatMap((speaker) => [speaker.firstName, speaker.lastName, speaker.email])].join(' ').toLowerCase()
      return (!needle || haystack.includes(needle))
        && (status === 'all' || submission.status === status)
        && (track === 'all' || submission.track === track)
    })
  }, [query, state, status, submitted, track])

  const selected = submitted.find((submission) => submission.id === selectedId)
  const reviewCount = state.reviews.filter((review) => review.submissionId === selected?.id).length

  async function decide(nextStatus: SubmissionStatus) {
    if (!selected) return
    dispatch({ type: 'submission/decide', id: selected.id, status: nextStatus, at: new Date().toISOString() })
    if (!['accepted', 'waitlisted', 'declined'].includes(nextStatus)) { setNotice('Proposal returned to review.'); return }
    if (!api || persistenceMode !== 'remote') { setNotice(`${statusLabels[nextStatus]} decision saved locally; email notification requires the deployed application.`); return }
    const recipients = selectSubmissionSpeakers(state, selected.id)
    if (!recipients.length) { setNotice(`${statusLabels[nextStatus]} decision saved, but the proposal has no speaker recipient.`); return }
    setNotifying(true)
    try {
      const messages = recipients.map((speaker) => ({
        speakerId: speaker.id,
        subject: `${state.event.name}: ${statusLabels[nextStatus]} — ${selected.title}`,
        text: `Hi ${speaker.firstName},\n\nYour proposal “${selected.title}” for ${state.event.name} is ${statusLabels[nextStatus].toLowerCase()}.\n\nOpen your private speaker portal for the latest proposal status and next steps.`,
      }))
      const receipt = await api.sendEmail({ idempotencyKey: `decision-${selected.id}-${nextStatus}`, messages })
      setNotice(`${statusLabels[nextStatus]} decision saved and ${receipt.result.sent ?? 0} notification email${receipt.result.sent === 1 ? '' : 's'} sent${receipt.result.failed ? `; ${receipt.result.failed} failed` : ''}.`)
    } catch (error) {
      setNotice(`${statusLabels[nextStatus]} decision saved, but notification failed: ${error instanceof Error ? error.message : 'provider error'}`)
    } finally {
      setNotifying(false)
    }
  }

  return (
    <section className="sb-feature" aria-labelledby="organizer-submissions-title">
      <header className="sb-feature__header">
        <div>
          <p className="sb-eyebrow">Program management</p>
          <h1 id="organizer-submissions-title">Submissions</h1>
          <p>Search, edit, evaluate, and decide every proposal from one workspace.</p>
        </div>
        <div className="sb-stat" aria-label={`${submitted.length} total submissions`}>
          <FileText aria-hidden="true" />
          <span><strong>{submitted.length}</strong> total</span>
        </div>
      </header>
      {notice && <p className="sb-form-notice" role="status">{notice}</p>}

      <div className="sb-toolbar" aria-label="Submission filters">
        <label className="sb-search">
          <span className="sb-sr-only">Search submissions</span>
          <Search aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, speaker, or keyword" />
        </label>
        <label>
          <span className="sb-sr-only">Filter by status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as 'all' | SubmissionStatus)}>
            <option value="all">All statuses</option>
            {statuses.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}
          </select>
        </label>
        <label>
          <span className="sb-sr-only">Filter by track</span>
          <select value={track} onChange={(event) => setTrack(event.target.value)}>
            <option value="all">All tracks</option>
            {state.event.tracks.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <span className="sb-toolbar__count" aria-live="polite">{rows.length} shown</span>
      </div>

      <div className="sb-split">
        <div className="sb-list" aria-label="Submissions">
          {rows.length === 0 && <div className="sb-empty"><Search aria-hidden="true" /><h2>No matching submissions</h2><p>Try changing the search or filters.</p></div>}
          {rows.map((submission) => {
            const speakers = selectSubmissionSpeakers(state, submission.id)
            const score = selectSubmissionScore(state, submission.id)
            return (
              <button
                type="button"
                key={submission.id}
                className={`sb-submission-row${submission.id === selectedId ? ' is-selected' : ''}`}
                onClick={() => setSelectedId(submission.id)}
                aria-current={submission.id === selectedId ? 'true' : undefined}
              >
                <span className="sb-submission-row__main">
                  <strong>{submission.title}</strong>
                  <small>{speakers.map((speaker) => `${speaker.firstName} ${speaker.lastName}`).join(', ') || 'No speaker'} · {submission.track} · {submission.origin ?? 'cfp'}{submission.cfpVersion ? ` v${submission.cfpVersion}` : ''}</small>
                </span>
                <span className="sb-submission-row__meta">
                  <span className={`sb-badge sb-badge--${submission.status}`}>{statusLabels[submission.status]}</span>
                  <span>{score === undefined ? '—' : score.toFixed(1)}</span>
                  <ChevronRight aria-hidden="true" />
                </span>
              </button>
            )
          })}
        </div>

        <aside className="sb-detail" aria-label="Submission details">
          {!selected && <div className="sb-empty"><FileText aria-hidden="true" /><h2>Select a submission</h2><p>Choose a proposal to view and edit it.</p></div>}
          {selected && (
            <SubmissionEditor
              key={selected.id}
              submission={selected}
              tracks={state.event.tracks}
              speakers={selectSubmissionSpeakers(state, selected.id)}
              reviewCount={reviewCount}
              score={selectSubmissionScore(state, selected.id)}
              onSave={(patch) => dispatch({ type: 'submission/update', id: selected.id, patch, at: new Date().toISOString() })}
              onDelete={() => {
                dispatch({ type: 'submission/delete', id: selected.id, at: new Date().toISOString() })
                setSelectedId(submitted.find((item) => item.id !== selected.id)?.id)
              }}
              onDecide={(nextStatus) => void decide(nextStatus)}
              notifying={notifying}
              onOpenReview={onOpenReview ? () => onOpenReview(selected.id) : undefined}
            />
          )}
        </aside>
      </div>
    </section>
  )
}

interface SubmissionEditorProps {
  submission: Submission
  tracks: string[]
  speakers: ReturnType<typeof selectSubmissionSpeakers>
  reviewCount: number
  score?: number
  onSave: (patch: Partial<Omit<Submission, 'id' | 'createdAt'>>) => void
  onDelete: () => void
  onDecide: (status: SubmissionStatus) => void
  notifying: boolean
  onOpenReview?: () => void
}

function SubmissionEditor({ submission, tracks, speakers, reviewCount, score, onSave, onDelete, onDecide, onOpenReview, notifying }: SubmissionEditorProps) {
  const [title, setTitle] = useState(submission.title)
  const [abstract, setAbstract] = useState(submission.abstract)
  const [track, setTrack] = useState(submission.track)
  const [format, setFormat] = useState(submission.format)
  const [duration, setDuration] = useState(String(submission.durationMinutes))
  const [tags, setTags] = useState(submission.tags.join(', '))
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const durationMinutes = Number(duration)
    if (!title.trim() || !abstract.trim() || !track || !format || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return
    onSave({
      title: title.trim(),
      abstract: abstract.trim(),
      track,
      format,
      durationMinutes,
      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    })
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }

  return (
    <div>
      <div className="sb-detail__heading">
        <div>
          <span className={`sb-badge sb-badge--${submission.status}`}>{statusLabels[submission.status]}</span>
          <h2>{submission.title}</h2>
        </div>
        <div className="sb-score" aria-label={score === undefined ? 'Not scored' : `Average score ${score.toFixed(1)} out of 5`}>
          <strong>{score === undefined ? '—' : score.toFixed(1)}</strong><small>{reviewCount} review{reviewCount === 1 ? '' : 's'}</small>
        </div>
      </div>

      <div className="sb-speaker-chips" aria-label="Speakers">
        <Users aria-hidden="true" />
        {speakers.length === 0 ? <span>No speakers attached</span> : speakers.map((speaker, index) => (
          <span key={speaker.id}>{speaker.firstName} {speaker.lastName} <small>{index === 0 ? 'Primary speaker' : 'Co-speaker'} · {speaker.email}</small></span>
        ))}
      </div>

      <p className="sb-submission-provenance"><strong>Source:</strong> {submission.origin ?? 'CFP'}{submission.cfpVersion ? ` · published form v${submission.cfpVersion}` : ''}{submission.invitedAt ? ` · invited ${new Date(submission.invitedAt).toLocaleDateString()}` : ''}</p>

      <form className="sb-form" onSubmit={submit}>
        <label>Session title<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>Abstract<textarea required rows={7} value={abstract} onChange={(event) => setAbstract(event.target.value)} /></label>
        <div className="sb-form__row">
          <label>Track<select required value={track} onChange={(event) => setTrack(event.target.value)}>{tracks.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Format<select required value={format} onChange={(event) => setFormat(event.target.value)}><option>Talk</option><option>Workshop</option><option>Panel</option><option>Lightning talk</option></select></label>
          <label>Minutes<input required min="5" max="180" type="number" value={duration} onChange={(event) => setDuration(event.target.value)} /></label>
        </div>
        <label>Tags<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="agents, safety, demo" /></label>
        <div className="sb-form__actions">
          <button className="sb-button sb-button--primary" type="submit">{saved ? <><Check aria-hidden="true" />Saved</> : 'Save changes'}</button>
          {onOpenReview && <button className="sb-button" type="button" onClick={onOpenReview}>Open review workspace</button>}
        </div>
      </form>

      <section className="sb-decision" aria-labelledby={`decision-${submission.id}`}>
        <div><p className="sb-eyebrow">Committee decision</p><h3 id={`decision-${submission.id}`}>Move proposal</h3></div>
        <div className="sb-decision__buttons">
          <button disabled={notifying} type="button" className="sb-button sb-button--success" onClick={() => onDecide('accepted')}>Accept + notify</button>
          <button disabled={notifying} type="button" className="sb-button sb-button--warning" onClick={() => onDecide('waitlisted')}>Waitlist + notify</button>
          <button disabled={notifying} type="button" className="sb-button sb-button--danger" onClick={() => onDecide('declined')}>Decline + notify</button>
          <button type="button" className="sb-button" onClick={() => onDecide('in-review')}>Return to review</button>
        </div>
      </section>

      <div className="sb-danger-zone">
        {!confirmDelete
          ? <button className="sb-link-danger" type="button" onClick={() => setConfirmDelete(true)}><Trash2 aria-hidden="true" />Delete submission</button>
          : <div role="alert"><span>Delete this submission and all of its reviews?</span><button className="sb-button sb-button--danger" type="button" onClick={onDelete}>Yes, delete</button><button className="sb-button" type="button" onClick={() => setConfirmDelete(false)}>Cancel</button></div>}
      </div>
    </div>
  )
}
