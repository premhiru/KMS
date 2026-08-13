// oxlint-disable react/only-export-components -- exported selection logic is covered by focused workflow tests.
import { useMemo, useState, type FormEvent } from 'react'
import { Download, LoaderCircle, MessageSquareReply } from 'lucide-react'
import { createId, nowIso, speakerName, useApp } from '../../core'
import type { DeliverableVersion, OnboardingTask } from '../../domain'
import { createZip } from './zip'
import './deliverables.css'

type Filter = 'all' | 'incomplete' | 'complete' | 'overdue' | 'pending'

export function selectedIncompleteSpeakerIds(tasks: Array<Pick<OnboardingTask, 'id' | 'speakerId' | 'completedAt'>>, selected: string[]): string[] {
  return [...new Set(tasks.filter((task) => selected.includes(task.id) && !task.completedAt).map((task) => task.speakerId))]
}

export function orderedDeliverableVersions(task: Pick<OnboardingTask, 'id' | 'asset' | 'assetVersion' | 'deliverableVersions'>): DeliverableVersion[] {
  const versions = [...(task.deliverableVersions ?? [])]
  if (task.asset && !versions.some((version) => version.asset.id && version.asset.id === task.asset?.id)) {
    versions.push({
      id: task.asset.id ?? `deliverable-${task.id}-${task.assetVersion ?? 1}`,
      asset: task.asset,
      version: task.assetVersion ?? 1,
      uploadedAt: task.asset.selectedAt,
      uploadedBy: 'Unknown uploader',
    })
  }
  return versions.sort((left, right) => right.version - left.version || right.uploadedAt.localeCompare(left.uploadedAt))
}

export function deliverableVersionAssetId(version: DeliverableVersion): string | undefined {
  return version.asset.id ?? (version.id.startsWith('asset-') ? version.id : undefined)
}

export function DeliverablesWorkspace() {
  const { state, dispatch, downloadAsset, api, persistenceMode, session } = useApp()
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const rows = useMemo(() => state.tasks
    .map((task) => ({
      task,
      speaker: state.speakers.find((item) => item.id === task.speakerId),
      submission: state.submissions.find((item) => item.id === task.submissionId),
    }))
    .filter(({ task }) => filter === 'all'
      || filter === 'complete' && !!task.completedAt
      || filter === 'incomplete' && !task.completedAt
      || filter === 'overdue' && !task.completedAt && new Date(task.dueAt) < new Date()
      || filter === 'pending' && task.approvalStatus === 'pending'), [state.tasks, state.speakers, state.submissions, filter])
  const reminderSpeakerIds = useMemo(() => selectedIncompleteSpeakerIds(state.tasks, selected), [state.tasks, selected])
  const reminderStatus = message || (selected.length === 0 ? 'Select one or more incomplete deliverables to queue a reminder.' : reminderSpeakerIds.length === 0 ? 'The selected deliverables are already complete.' : `${reminderSpeakerIds.length} speaker${reminderSpeakerIds.length === 1 ? '' : 's'} ready for a reminder.`)

  const remind = async () => {
    if (!reminderSpeakerIds.length) {
      setMessage(selected.length ? 'The selected deliverables are already complete.' : 'Select one or more incomplete deliverables first.')
      return
    }
    if (!api || persistenceMode !== 'remote') {
      setMessage('External reminders are available on the deployed application with Resend configured.')
      return
    }
    setSending(true)
    try {
      const taskIds = selected.filter((taskId) => state.tasks.some((task) => task.id === taskId && !task.completedAt))
      const receipt = await api.sendDeliverableReminders({ idempotencyKey: `deliverables-${crypto.randomUUID()}`, taskIds })
      const at = nowIso()
      for (const delivery of receipt.result.deliveries) {
        dispatch({ type: 'communication/log', entry: {
          id: createId('communication'), recipientSpeakerIds: [delivery.speakerId], subject: `${state.event.name} deliverables reminder`,
          body: `Reminder for ${delivery.taskIds.length} outstanding deliverable${delivery.taskIds.length === 1 ? '' : 's'}.`, channel: 'email',
          status: delivery.status, sentAt: at,
        }, at })
      }
      setMessage(`${receipt.result.sent} reminder email${receipt.result.sent === 1 ? '' : 's'} sent${receipt.result.failed ? `; ${receipt.result.failed} failed` : ''}. Run ${receipt.runId}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Deliverable reminder delivery failed.')
    } finally {
      setSending(false)
    }
  }

  const exportZip = async () => {
    const downloadable = rows.filter(({ task }) => selected.includes(task.id) && task.asset?.id)
    const entries = await Promise.all(downloadable.map(async ({ task, speaker }) => {
      const result = await downloadAsset(task.asset!.id!)
      return {
        name: `${speaker ? speakerName(speaker) : 'speaker'}/${task.title}/v${task.assetVersion ?? 1}-${result.fileName}`,
        bytes: new Uint8Array(await result.blob.arrayBuffer()),
      }
    }))
    if (!entries.length) return setMessage('Select at least one stored file.')
    const href = URL.createObjectURL(createZip(entries))
    const link = document.createElement('a')
    link.href = href
    link.download = `${state.event.slug}-deliverables.zip`
    link.click()
    URL.revokeObjectURL(href)
    setMessage(`Exported ${entries.length} files.`)
  }

  return <div className="deliverables">
    <header>
      <div><p>Content operations</p><h1>Deliverables library</h1><span>Review every task, file version, approval, and conversation in one matrix.</span></div>
      <select aria-label="Filter deliverables" value={filter} onChange={(event) => setFilter(event.target.value as Filter)}><option value="all">All deliverables</option><option value="incomplete">Incomplete</option><option value="complete">Complete</option><option value="overdue">Overdue</option><option value="pending">Pending approval</option></select>
    </header>
    <div className="deliverables-actions"><button disabled={reminderSpeakerIds.length === 0 || sending} title={reminderSpeakerIds.length === 0 ? 'Select an incomplete deliverable first' : undefined} onClick={() => void remind()}>{sending ? 'Sending…' : 'Send reminder email'}</button><button onClick={() => void exportZip()}>Export selected ZIP</button><span role="status">{reminderStatus}</span></div>
    <div className="deliverables-table" role="table" aria-label="Speaker deliverables">
      <div role="row" className="deliverables-head"><span role="columnheader">Select</span><span role="columnheader">Speaker</span><span role="columnheader">Deliverable</span><span role="columnheader">Due</span><span role="columnheader">Status</span><span role="columnheader">Files</span></div>
      {rows.map(({ task, speaker, submission }) => <div role="row" key={task.id}>
        <span role="cell"><input aria-label={`Select ${task.title}`} type="checkbox" checked={selected.includes(task.id)} onChange={(event) => { setMessage(''); setSelected(event.target.checked ? [...selected, task.id] : selected.filter((id) => id !== task.id)) }} /></span>
        <span role="cell">{speaker ? speakerName(speaker) : 'Unknown speaker'}</span>
        <span role="cell"><strong>{task.title}</strong>{submission && <small>{submission.title}</small>}{task.instructions && <small>{task.instructions}</small>}</span>
        <span role="cell">{new Date(task.dueAt).toLocaleDateString()}</span>
        <span role="cell">{task.approvalStatus ?? (task.completedAt ? 'complete' : 'open')}</span>
        <span role="cell">{task.asset || task.deliverableVersions?.length || task.comments?.length ? <DeliverableDetail task={task} organizerName={session?.user.name || 'Event organizer'} /> : 'No file'}</span>
      </div>)}
    </div>
  </div>
}

function DeliverableDetail({ task, organizerName }: { task: OnboardingTask; organizerName: string }) {
  const { dispatch, downloadAsset, persistenceMode } = useApp()
  const versions = orderedDeliverableVersions(task)
  const latestVersion = versions[0]?.version
  const [reply, setReply] = useState('')
  const [downloading, setDownloading] = useState('')
  const [status, setStatus] = useState('')
  const [failed, setFailed] = useState(false)

  async function downloadVersion(version: DeliverableVersion) {
    const assetId = deliverableVersionAssetId(version)
    if (!assetId || downloading) return
    setDownloading(version.id)
    setStatus('')
    setFailed(false)
    try {
      const result = await downloadAsset(assetId)
      const href = URL.createObjectURL(result.blob)
      const link = document.createElement('a')
      link.href = href
      link.download = result.fileName || version.asset.name
      link.click()
      URL.revokeObjectURL(href)
      setStatus(`Downloaded version ${version.version}: ${result.fileName || version.asset.name}.`)
    } catch (error) {
      setFailed(true)
      setStatus(error instanceof Error ? error.message : `Version ${version.version} could not be downloaded.`)
    } finally {
      setDownloading('')
    }
  }

  function postReply(event: FormEvent) {
    event.preventDefault()
    const body = reply.trim()
    if (!body) return
    const at = nowIso()
    dispatch({ type: 'task/comment', id: task.id, comment: { id: createId('comment'), authorName: organizerName, authorRole: 'organizer', body, createdAt: at }, at })
    setReply('')
    setFailed(false)
    setStatus(`Reply posted by ${organizerName}.`)
  }

  return <details className="deliverable-detail">
    <summary><span>{task.asset?.name ?? versions[0]?.asset.name ?? 'Conversation'}</span><small>{versions.length} version{versions.length === 1 ? '' : 's'} · {task.comments?.length ?? 0} comment{task.comments?.length === 1 ? '' : 's'}</small></summary>
    <div className="deliverable-detail-body">
      <section aria-labelledby={`versions-${task.id}`}><h3 id={`versions-${task.id}`}>File versions</h3>{versions.length ? <ol className="deliverable-version-list">{versions.map((version) => {
        const assetId = deliverableVersionAssetId(version)
        const latest = version.version === latestVersion
        return <li key={version.id}><div><span><strong>v{version.version} · {version.asset.name}</strong>{latest && <em>Latest</em>}</span><small>Uploaded <time dateTime={version.uploadedAt}>{new Date(version.uploadedAt).toLocaleString()}</time> by {version.uploadedBy}</small></div><button type="button" disabled={!assetId || persistenceMode !== 'remote' || Boolean(downloading)} title={!assetId ? 'This legacy version does not have a stored asset ID.' : persistenceMode !== 'remote' ? 'Authenticated downloads are available in the deployed workspace.' : undefined} onClick={() => void downloadVersion(version)} aria-label={`Download version ${version.version} of ${version.asset.name}`}>{downloading === version.id ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Download aria-hidden="true" />}<span>{downloading === version.id ? 'Downloading…' : 'Download'}</span></button></li>
      })}</ol> : <p className="deliverable-empty">No uploaded versions yet.</p>}</section>
      <section aria-labelledby={`conversation-${task.id}`}><h3 id={`conversation-${task.id}`}>Conversation</h3>{task.comments?.length ? <ol className="deliverable-comments">{task.comments.map((comment) => <li key={comment.id}><header><strong>{comment.authorName}</strong><span>{comment.authorRole}</span><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time></header><p>{comment.body}</p></li>)}</ol> : <p className="deliverable-empty">No comments yet. Reply to start the organizer-speaker thread.</p>}
        <form className="deliverable-reply" onSubmit={postReply}><label htmlFor={`reply-${task.id}`}>Reply as {organizerName}</label><textarea id={`reply-${task.id}`} required maxLength={2000} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a reply to the speaker…" /><button type="submit" disabled={!reply.trim()}><MessageSquareReply aria-hidden="true" />Post reply</button></form>
      </section>
      {status && <p className={failed ? 'deliverable-status is-error' : 'deliverable-status'} role={failed ? 'alert' : 'status'}>{status}</p>}
    </div>
  </details>
}
