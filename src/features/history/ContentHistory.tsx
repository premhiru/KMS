import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AlertTriangle, CheckCircle2, ChevronRight, Clock3, FileClock, RefreshCw, RotateCcw, ShieldCheck, UserRound } from 'lucide-react'
import { useApp } from '../../core'
import { ApiError, type StateHistory, type StateRevisionDetail, type WorkspaceMember, type WorkspaceSession } from '../../services'
import { formatBytes, historyReasonLabel, revisionChanges, summarizeRevision } from './history-model'
import './history.css'

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return `${error.message} (request ${error.requestId})`
  return error instanceof Error ? error.message : 'The revision could not be loaded.'
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function editorLabel(updatedBy: string, members: WorkspaceMember[], currentUser?: WorkspaceSession['user']): string {
  const member = members.find((item) => item.id === updatedBy)
  if (!member && currentUser?.id === updatedBy) return `${currentUser.name} (${currentUser.email})`
  if (!member) return updatedBy
  return member.name ? `${member.name} (${member.email})` : member.email
}

export function ContentHistory() {
  const { api, persistenceMode, state, session } = useApp()
  const [history, setHistory] = useState<StateHistory>()
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [selectedRevision, setSelectedRevision] = useState<number>()
  const [detail, setDetail] = useState<StateRevisionDetail>()
  const [loading, setLoading] = useState(Boolean(api))
  const [refreshing, setRefreshing] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirming, setConfirming] = useState(false)
  const detailRequestRef = useRef(0)

  const loadDetail = useCallback(async (revision: number) => {
    if (!api) return
    const request = ++detailRequestRef.current
    setSelectedRevision(revision)
    setDetailLoading(true)
    setDetailError('')
    try {
      const next = await api.getStateRevision(revision)
      if (request === detailRequestRef.current) setDetail(next)
    } catch (loadError) {
      if (request === detailRequestRef.current) {
        setDetail(undefined)
        setDetailError(errorMessage(loadError))
      }
    } finally {
      if (request === detailRequestRef.current) setDetailLoading(false)
    }
  }, [api])

  const loadHistory = useCallback(async (silent = false, preferredRevision?: number) => {
    if (!api) return
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const [nextHistory, nextMembers] = await Promise.all([
        api.getStateHistory(),
        api.getMembers().catch(() => [] as WorkspaceMember[]),
      ])
      setHistory(nextHistory)
      setMembers(nextMembers)
      const revision = preferredRevision && nextHistory.revisions.some((item) => item.revision === preferredRevision)
        ? preferredRevision
        : nextHistory.currentRevision
      await loadDetail(revision)
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [api, loadDetail])

  useEffect(() => { void loadHistory() }, [loadHistory])

  const changes = useMemo(() => detail ? revisionChanges(detail.state, state) : [], [detail, state])

  if (!api || persistenceMode !== 'remote') {
    return <section className="history-workspace history-unavailable" aria-labelledby="history-heading"><FileClock aria-hidden="true" /><h1 id="history-heading">Content history</h1><p>Revision history and restore controls are available in the deployed, authenticated organizer workspace. Local preview data is still protected by JSON export in Settings.</p></section>
  }

  return <section className="history-workspace" aria-labelledby="history-heading">
    <header className="history-header">
      <div><p className="history-eyebrow">Event governance</p><h1 id="history-heading">Content history</h1><p>Inspect every durable event snapshot and safely restore an earlier version without deleting the audit trail.</p></div>
      <button className="history-button" type="button" disabled={loading || refreshing} onClick={() => void loadHistory(true, selectedRevision)}><RefreshCw className={refreshing ? 'is-spinning' : ''} aria-hidden="true" />Refresh history</button>
    </header>
    <div className="history-safety-note"><ShieldCheck aria-hidden="true" /><p><strong>Restores are non-destructive.</strong> Restoring an earlier snapshot creates a new revision. The current version and every intervening change remain in this timeline.</p></div>
    {notice && <div className="history-notice" role="status"><CheckCircle2 aria-hidden="true" /><span>{notice}</span><button type="button" onClick={() => window.location.reload()}>Reload restored workspace</button></div>}
    {error && <div className="history-error" role="alert"><AlertTriangle aria-hidden="true" /><span>{error}</span><button type="button" onClick={() => void loadHistory()}>Try again</button></div>}
    {loading ? <div className="history-loading" role="status"><RefreshCw className="is-spinning" aria-hidden="true" />Loading content revisions…</div> : history && <div className="history-layout">
      <aside className="history-timeline" aria-label="Content revisions">
        <div className="history-timeline-heading"><div><strong>Revision timeline</strong><span>{history.revisions.length} saved snapshots</span></div><span className="history-current-badge">Current r{history.currentRevision}</span></div>
        <ol>{history.revisions.map((revision) => {
          const current = revision.revision === history.currentRevision
          const selected = revision.revision === selectedRevision
          return <li key={revision.revision}><button type="button" className={selected ? 'is-selected' : ''} aria-current={selected ? 'true' : undefined} onClick={() => void loadDetail(revision.revision)}>
            <span className="history-revision-mark"><FileClock aria-hidden="true" /></span>
            <span className="history-revision-copy"><span><strong>Revision {revision.revision}</strong>{current && <em>Current</em>}</span><small>{historyReasonLabel(revision.reason)}</small><small className="history-revision-editor">by {editorLabel(revision.updatedBy, members, session?.user)}</small><span><time dateTime={revision.createdAt}>{formatDate(revision.createdAt)}</time><span aria-hidden="true">·</span><span>{formatBytes(revision.sizeBytes)}</span></span></span>
            <ChevronRight aria-hidden="true" />
          </button></li>
        })}</ol>
        {history.revisions.length === 0 && <p className="history-empty">No durable revisions are available yet.</p>}
      </aside>
      <main className="history-detail" aria-live="polite">
        {detailLoading ? <div className="history-loading history-loading--detail" role="status"><RefreshCw className="is-spinning" aria-hidden="true" />Loading revision details…</div>
          : detailError ? <div className="history-error" role="alert"><AlertTriangle aria-hidden="true" /><span>{detailError}</span>{selectedRevision && <button type="button" onClick={() => void loadDetail(selectedRevision)}>Retry details</button>}</div>
          : detail && history ? <RevisionDetail detail={detail} currentRevision={history.currentRevision} currentState={state} members={members} currentUser={session?.user} changes={changes} onRestore={() => setConfirming(true)} />
          : <div className="history-empty">Choose a revision to inspect it.</div>}
      </main>
    </div>}
    {confirming && detail && history && <RestoreDialog detail={detail} currentRevision={history.currentRevision} onCancel={() => setConfirming(false)} onConflict={async () => { await loadHistory(true, detail.revision) }} onRestored={async (revision) => { setConfirming(false); setNotice(`Revision ${detail.revision} was restored as new revision ${revision}. The original timeline is preserved.`); await loadHistory(true, revision) }} />}
  </section>
}

function RevisionDetail({ detail, currentRevision, currentState, members, currentUser, changes, onRestore }: { detail: StateRevisionDetail; currentRevision: number; currentState: ReturnType<typeof useApp>['state']; members: WorkspaceMember[]; currentUser?: WorkspaceSession['user']; changes: ReturnType<typeof revisionChanges>; onRestore: () => void }) {
  const summary = summarizeRevision(detail.state)
  const current = detail.revision === currentRevision
  const sessionContent = detail.state.sessions.flatMap((session) => {
    const submission = detail.state.submissions.find((item) => item.id === session.submissionId)
    return submission ? [{ session, submission }] : []
  })
  return <article className="history-revision-detail">
    <header><div><p>Revision {detail.revision}{current ? ' · Current' : ''}</p><h2>{historyReasonLabel(detail.reason)}</h2></div>{!current && <button className="history-button history-button--restore" type="button" onClick={onRestore}><RotateCcw aria-hidden="true" />Restore this revision</button>}</header>
    <dl className="history-metadata"><div><dt><Clock3 aria-hidden="true" />Saved</dt><dd><time dateTime={detail.createdAt}>{formatDate(detail.createdAt)}</time></dd></div><div><dt><UserRound aria-hidden="true" />Editor</dt><dd>{editorLabel(detail.updatedBy, members, currentUser)}</dd></div><div><dt>Revision</dt><dd>r{detail.revision} of r{currentRevision}</dd></div></dl>
    <section aria-labelledby="snapshot-summary-heading"><h3 id="snapshot-summary-heading">Snapshot summary</h3><div className="history-summary-grid"><SummaryStat value={summary.sessions} label={`${summary.publishedSessions} published sessions`} /><SummaryStat value={summary.speakers} label="speakers" /><SummaryStat value={summary.submissions} label={`${summary.acceptedSubmissions} accepted submissions`} /><SummaryStat value={summary.tasks} label={`${summary.completedTasks} completed tasks`} /><SummaryStat value={summary.resources} label="speaker wiki resources" /><SummaryStat value={summary.messages} label="communication records" /></div></section>
    {!current && <section aria-labelledby="revision-changes-heading"><h3 id="revision-changes-heading">Changes since this revision</h3><p className="history-section-intro">Compared with the currently loaded event workspace.</p>{changes.length ? <ul className="history-change-list">{changes.map((change) => <li key={change.key}><strong>{change.label}</strong><div><span>{change.before}</span><ChevronRight aria-hidden="true" /><span>{change.after}</span></div></li>)}</ul> : <p className="history-no-changes">No content differences were detected between this snapshot and the currently loaded workspace.</p>}</section>}
    <section aria-labelledby="revision-session-content-heading"><h3 id="revision-session-content-heading">Session title and abstract versions</h3><p className="history-section-intro">Exact session content saved in revision {detail.revision}{current ? '.' : ', compared with the current workspace.'}</p>{sessionContent.length ? <div className="history-session-content">{sessionContent.map(({ session, submission }) => {
      const currentSubmission = currentState.submissions.find((item) => item.id === submission.id)
      const titleChanged = !current && currentSubmission && currentSubmission.title !== submission.title
      const abstractChanged = !current && currentSubmission && currentSubmission.abstract !== submission.abstract
      return <article key={session.id} className={titleChanged || abstractChanged ? 'has-changes' : ''}><header><h4>{submission.title}</h4><span>{titleChanged || abstractChanged ? 'Changed' : session.contentStatus ?? 'approved'}</span></header><p>{submission.abstract}</p>{(titleChanged || abstractChanged) && currentSubmission && <div className="history-exact-diff" aria-label={`Exact content changes for ${submission.title}`}>{titleChanged && <div><strong>Title in revision {detail.revision}</strong><p>{submission.title}</p><strong>Current title</strong><p>{currentSubmission.title}</p></div>}{abstractChanged && <div><strong>Abstract in revision {detail.revision}</strong><p>{submission.abstract}</p><strong>Current abstract</strong><p>{currentSubmission.abstract}</p></div>}</div>}<dl><div><dt>Track</dt><dd>{submission.track}</dd></div><div><dt>Format</dt><dd>{submission.format}</dd></div><div><dt>Published</dt><dd>{session.published ? 'Yes' : 'No'}</dd></div></dl></article>
    })}</div> : <p className="history-no-changes">This revision does not contain any scheduled session content.</p>}</section>
    {currentState.lastUpdatedAt !== detail.state.lastUpdatedAt && current && <p className="history-poll-note">The workspace is refreshing live. Select Refresh history if a recent save is not listed yet.</p>}
    <details className="history-technical"><summary>Inspect full revision data</summary><p>This read-only snapshot is the exact event document stored for revision {detail.revision}.</p><pre>{JSON.stringify(detail.state, null, 2)}</pre></details>
  </article>
}

function SummaryStat({ value, label }: { value: number; label: string }) {
  return <div><strong>{value}</strong><span>{label}</span></div>
}

function RestoreDialog({ detail, currentRevision, onCancel, onConflict, onRestored }: { detail: StateRevisionDetail; currentRevision: number; onCancel: () => void; onConflict: () => Promise<void>; onRestored: (revision: number) => Promise<void> }) {
  const { api } = useApp()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [conflicted, setConflicted] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])

  async function restore(event: FormEvent) {
    event.preventDefault()
    if (!api || busy) return
    setBusy(true)
    setError('')
    try {
      const receipt = await api.rollbackState({ expectedRevision: currentRevision, targetRevision: detail.revision, reason: reason.trim() || `Restore revision ${detail.revision} from content history` })
      await onRestored(receipt.revision)
    } catch (restoreError) {
      if (restoreError instanceof ApiError && restoreError.code === 'REVISION_CONFLICT') {
        setConflicted(true)
        setError('Another organizer saved changes before this restore could finish. The timeline has been refreshed; review the latest current revision, then confirm again to retry.')
        await onConflict()
      } else setError(errorMessage(restoreError))
    } finally {
      setBusy(false)
    }
  }

  return <dialog ref={dialogRef} className="history-dialog" aria-labelledby="restore-title" onCancel={(event) => { event.preventDefault(); if (!busy) onCancel() }}>
    <form onSubmit={(event) => void restore(event)}>
      <div className="history-dialog-icon"><RotateCcw aria-hidden="true" /></div>
      <h2 id="restore-title">Restore revision {detail.revision}?</h2>
      <p>This will copy revision {detail.revision} over the current event and save it as a new revision after r{currentRevision}. It will not delete any history.</p>
      <div className="history-restore-flow"><span>Revision {detail.revision}<small>{formatDate(detail.createdAt)}</small></span><ChevronRight aria-hidden="true" /><span>New revision<small>Created when confirmed</small></span></div>
      <label>Reason for restore <span>(recommended)</span><textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Example: Restore the approved program after an accidental edit" /></label>
      {error && <p className="history-dialog-error" role="alert"><AlertTriangle aria-hidden="true" />{error}</p>}
      <div className="history-dialog-actions"><button className="history-button" type="button" disabled={busy} onClick={onCancel}>Cancel</button><button className="history-button history-button--restore" type="submit" disabled={busy}>{busy ? <><RefreshCw className="is-spinning" aria-hidden="true" />Restoring…</> : <><RotateCcw aria-hidden="true" />{conflicted ? 'Retry restore' : `Restore revision ${detail.revision}`}</>}</button></div>
    </form>
  </dialog>
}
