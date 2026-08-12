// oxlint-disable react/only-export-components -- exported integration/date guards are covered by focused workflow tests.
import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarPlus, Check, Download, Edit3, Mail, Plus, Send, Trash2, X } from 'lucide-react'
import { agendaToIcs, createId, downloadIcs, nowIso, renderTemplate, selectAudienceSpeakerIds, speakerInvitationToIcs, speakerName, useApp } from '../../core'
import type { MessageAudience, MessageTemplate, ReminderSchedule } from '../../domain'
import { nextReminderRun } from './reminders'
import './communications.css'

interface TemplateDraft {
  id?: string
  name: string
  subject: string
  body: string
  audience: MessageAudience
  enabled: boolean
}

const emptyDraft: TemplateDraft = { name: '', subject: '', body: '', audience: 'accepted', enabled: true }

export type EmailIntegrationState = 'loading' | 'configured' | 'not-configured' | 'check-failed'

interface EmailIntegrationClient {
  getIntegrationStatus(): Promise<{ configured: { resend: boolean } }>
}

export async function checkEmailIntegration(api: EmailIntegrationClient | undefined, persistenceMode: string): Promise<EmailIntegrationState> {
  if (persistenceMode !== 'remote') return 'not-configured'
  if (!api) return 'check-failed'
  try {
    return (await api.getIntegrationStatus()).configured.resend ? 'configured' : 'not-configured'
  } catch {
    return 'check-failed'
  }
}

export function parseReminderDateTime(value: string): string | undefined {
  if (!value.trim()) return undefined
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
}

function trapDialogFocus(event: KeyboardEvent, dialog: HTMLElement | null) {
  if (event.key !== 'Tab' || !dialog) return
  const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
  const first = controls[0]
  const last = controls.at(-1)
  if (!first || !last) return
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
}

export function CommunicationsCenter() {
  const { state, dispatch, api, persistenceMode } = useApp()
  const [draft, setDraft] = useState<TemplateDraft>()
  const [selectedTemplateId, setSelectedTemplateId] = useState(state.templates[0]?.id ?? '')
  const [audience, setAudience] = useState<MessageAudience>(state.templates[0]?.audience ?? 'accepted')
  const [customIds, setCustomIds] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [emailIntegration, setEmailIntegration] = useState<EmailIntegrationState>(persistenceMode === 'remote' ? 'loading' : 'not-configured')
  const [integrationCheck, setIntegrationCheck] = useState(0)
  const [sending, setSending] = useState(false)
  const modalFirstFieldRef = useRef<HTMLInputElement>(null)
  const modalTriggerRef = useRef<HTMLElement | null>(null)
  const draftOpen = Boolean(draft)
  const selectedTemplate = state.templates.find((template) => template.id === selectedTemplateId)
  const recipientIds = selectAudienceSpeakerIds(state, audience, customIds)
  const previewSpeaker = state.speakers.find((speaker) => speaker.id === recipientIds[0])
  const previewSubmission = state.submissions.find((submission) => previewSpeaker && submission.speakerIds.includes(previewSpeaker.id))
  const previewTask = state.tasks.find((task) => previewSpeaker && task.speakerId === previewSpeaker.id && !task.completedAt)
  const preview = selectedTemplate ? renderTemplate(selectedTemplate, { event: state.event, speaker: previewSpeaker, submission: previewSubmission, task: previewTask }) : undefined
  const outbox = useMemo(() => [...state.communicationLog].sort((left, right) => right.sentAt.localeCompare(left.sentAt)), [state.communicationLog])
  const emailConfigured = emailIntegration === 'configured'

  useEffect(() => {
    let active = true
    setEmailIntegration(persistenceMode === 'remote' ? 'loading' : 'not-configured')
    void checkEmailIntegration(api, persistenceMode).then((status) => { if (active) setEmailIntegration(status) })
    return () => { active = false }
  }, [api, persistenceMode, integrationCheck])

  useEffect(() => {
    if (!draftOpen) return
    modalFirstFieldRef.current?.focus()
    const handleDialogKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDraft(undefined)
      else trapDialogFocus(event, document.querySelector<HTMLElement>('.template-modal'))
    }
    window.addEventListener('keydown', handleDialogKey)
    return () => { window.removeEventListener('keydown', handleDialogKey); modalTriggerRef.current?.focus() }
  }, [draftOpen])

  const openDraft = (value: TemplateDraft) => {
    modalTriggerRef.current = document.activeElement as HTMLElement | null
    setDraft(value)
  }

  const chooseTemplate = (template: MessageTemplate) => {
    setSelectedTemplateId(template.id)
    setAudience(template.audience)
  }

  const editTemplate = (template: MessageTemplate) => openDraft({
    id: template.id, name: template.name, subject: template.subject, body: template.body, audience: template.audience, enabled: template.enabled,
  })

  const saveTemplate = () => {
    if (!draft || !draft.name.trim() || !draft.subject.trim() || !draft.body.trim()) {
      setNotice('Template name, subject, and body are required.')
      return
    }
    const at = nowIso()
    const template: MessageTemplate = { ...draft, id: draft.id ?? createId('template'), name: draft.name.trim(), subject: draft.subject.trim(), body: draft.body.trim(), updatedAt: at }
    dispatch({ type: 'template/upsert', template, at })
    chooseTemplate(template)
    setDraft(undefined)
    setNotice('Template saved.')
  }

  const sendToOutbox = () => {
    if (!selectedTemplate || recipientIds.length === 0) {
      setNotice('Choose a template and at least one recipient.')
      return
    }
    const at = nowIso()
    for (const speakerId of recipientIds) {
      const speaker = state.speakers.find((item) => item.id === speakerId)
      if (!speaker) continue
      const submission = state.submissions.find((item) => item.speakerIds.includes(speakerId))
      const task = state.tasks.find((item) => item.speakerId === speakerId && !item.completedAt)
      const rendered = renderTemplate(selectedTemplate, { event: state.event, speaker, submission, task })
      dispatch({ type: 'communication/log', entry: {
        id: createId('message'), templateId: selectedTemplate.id, recipientSpeakerIds: [speakerId], subject: rendered.subject,
        body: rendered.body, channel: 'in-app-outbox', status: 'queued', sentAt: at,
      }, at })
    }
    setNotice(`${recipientIds.length} personalized message${recipientIds.length === 1 ? '' : 's'} saved to the in-app outbox.`)
  }

  const sendExternal = async () => {
    if (!api || !selectedTemplate || recipientIds.length === 0) { setNotice('Choose a template and at least one recipient.'); return }
    setSending(true)
    try {
      const messages = recipientIds.flatMap((speakerId) => {
        const speaker = state.speakers.find((item) => item.id === speakerId)
        if (!speaker) return []
        const submission = state.submissions.find((item) => item.speakerIds.includes(speakerId))
        const task = state.tasks.find((item) => item.speakerId === speakerId && !item.completedAt)
        const rendered = renderTemplate(selectedTemplate, { event: state.event, speaker, submission, task })
        const invitation = speakerInvitationToIcs(state, speakerId)
        const attachment = invitation.includes('BEGIN:VEVENT')
          ? { filename: `${state.event.slug}-${speakerId}.ics`, content: invitation, type: 'text/calendar' as const }
          : undefined
        return [{ speakerId, subject: rendered.subject, text: rendered.body, attachment }]
      })
      const receipt = await api.sendEmail({ idempotencyKey: `email-${crypto.randomUUID()}`, messages })
      const at = nowIso()
      for (const message of messages) {
        const delivery = receipt.result.deliveries?.find((item) => item.speakerId === message.speakerId)
        dispatch({ type: 'communication/log', entry: { id: createId('message'), templateId: selectedTemplate.id, recipientSpeakerIds: [message.speakerId], subject: message.subject, body: message.text, channel: 'email', status: delivery?.status === 'failed' || receipt.status === 'failed' ? 'failed' : 'sent', sentAt: at }, at })
      }
      setNotice(`${receipt.result.sent ?? messages.length} email${messages.length === 1 ? '' : 's'} sent with calendar attachment. Run ${receipt.runId}.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Email delivery failed.')
    } finally {
      setSending(false)
    }
  }

  return <section className="communications-feature">
    <header className="feature-heading"><div><p>SPEAKER COMMUNICATIONS</p><h1>Communications</h1><span>Create reusable templates, preview personalization, and keep a durable delivery log.</span></div><div className="feature-actions"><button className="feature-button secondary" onClick={() => downloadIcs(`${state.event.slug}-calendar.ics`, agendaToIcs(state))}><CalendarPlus size={16}/>Download calendar invite</button><button className="feature-button primary" onClick={() => openDraft(emptyDraft)}><Plus size={16}/>New template</button></div></header>
    <div className="delivery-disclosure"><Mail size={17}/><p aria-live="polite"><b>{emailIntegration === 'loading' ? 'Checking email delivery…' : emailIntegration === 'configured' ? 'Resend delivery connected' : emailIntegration === 'check-failed' ? 'Email connection check failed' : 'Email provider not configured'}</b> {emailIntegration === 'loading' ? 'External delivery controls will be available after the check completes.' : emailIntegration === 'configured' ? 'Personalized messages are delivered with an iCalendar attachment and logged server-side.' : emailIntegration === 'check-failed' ? 'The provider status could not be verified. The in-app outbox remains available.' : 'The in-app outbox remains available; configure RESEND_API_KEY and EMAIL_FROM for external delivery.'} {emailIntegration === 'check-failed' && <button className="feature-button secondary" type="button" aria-label="Retry email integration check" onClick={() => setIntegrationCheck((value) => value + 1)}>Retry</button>}</p></div>
    <ReminderAutomation emailConfigured={emailConfigured} />
    {notice && <div className="feature-notice" role="status">{notice}<button aria-label="Dismiss notice" onClick={() => setNotice('')}><X size={14}/></button></div>}

    <div className="communications-layout">
      <aside className="template-list"><div className="section-title"><div><h2>Templates</h2><span>{state.templates.length} reusable messages</span></div></div>{state.templates.map((template) => <article className={selectedTemplateId === template.id ? 'selected' : ''} key={template.id}>
        <button type="button" className="template-select" onClick={() => chooseTemplate(template)}><span className={`template-status ${template.enabled ? 'enabled' : ''}`}><Mail size={15}/></span><span><strong>{template.name}</strong><small>{template.subject}</small><em>{template.audience.replaceAll('-', ' ')}</em></span></button><button aria-label={`Edit ${template.name}`} onClick={() => editTemplate(template)}><Edit3 size={15}/></button>
      </article>)}</aside>

      <section className="message-composer" aria-labelledby="message-composer-heading">
        <div className="section-title"><div><h2 id="message-composer-heading">Compose and preview</h2><span>Template fields are rendered once per recipient.</span></div>{selectedTemplate && <button className="danger-link" onClick={() => { if (!window.confirm(`Delete the “${selectedTemplate.name}” template? This cannot be undone.`)) return; dispatch({ type: 'template/delete', id: selectedTemplate.id, at: nowIso() }); setSelectedTemplateId('') }}><Trash2 size={14}/>Delete</button>}</div>
        {!selectedTemplate && <div className="communications-empty">Choose or create a template.</div>}
        {selectedTemplate && <>
          <label className="field-label">Audience<select value={audience} onChange={(event) => setAudience(event.target.value as MessageAudience)}><option value="accepted">Accepted speakers</option><option value="confirmed">Confirmed speakers</option><option value="incomplete-onboarding">Incomplete onboarding</option><option value="overdue-tasks">Overdue tasks</option><option value="custom">Specific speakers</option></select></label>
          {audience === 'custom' && <div className="recipient-picker">{state.speakers.map((speaker) => <label key={speaker.id}><input type="checkbox" checked={customIds.includes(speaker.id)} onChange={(event) => setCustomIds(event.target.checked ? [...customIds, speaker.id] : customIds.filter((id) => id !== speaker.id))}/>{speakerName(speaker)}</label>)}</div>}
          <div className="recipient-count">{recipientIds.length} recipient{recipientIds.length === 1 ? '' : 's'}</div>
          <div className="message-preview"><span>PREVIEW {previewSpeaker ? `FOR ${speakerName(previewSpeaker).toUpperCase()}` : ''}</span><h3>{preview?.subject ?? selectedTemplate.subject}</h3><p>{preview?.body ?? selectedTemplate.body}</p>{preview && preview.unresolvedTokens.length > 0 && <small>Unresolved for this recipient: {preview.unresolvedTokens.join(', ')}</small>}</div>
          <div className="feature-actions"><button className="feature-button secondary send-button" onClick={sendToOutbox}><Send size={16}/>Save to outbox</button>{persistenceMode === 'remote' && <button className="feature-button primary send-button" disabled={!emailConfigured || sending} onClick={sendExternal}><Send size={16}/>{sending ? 'Sending…' : 'Send email + calendar'}</button>}</div>
        </>}
      </section>
    </div>

    <section className="outbox"><div className="section-title"><div><h2>Delivery log</h2><span>Durable messages created in this browser</span></div><button className="feature-button secondary" onClick={() => downloadIcs(`${state.event.slug}-calendar.ics`, agendaToIcs(state))}><Download size={15}/>Agenda ICS</button></div>{outbox.length === 0 && <div className="communications-empty">No messages sent yet.</div>}{outbox.map((entry) => { const speaker = state.speakers.find((item) => item.id === entry.recipientSpeakerIds[0]); return <article key={entry.id}><span><Check size={14}/></span><div><strong>{entry.subject}</strong><small>To {speaker ? `${speakerName(speaker)} · ${speaker.email}` : 'Unknown recipient'}</small></div><time>{new Date(entry.sentAt).toLocaleString()}</time><em>{entry.channel.replaceAll('-', ' ')}</em></article> })}</section>

    {draft && <div className="template-modal" role="dialog" aria-modal="true" aria-label="Template editor"><form onSubmit={(event) => { event.preventDefault(); saveTemplate() }}><button type="button" className="panel-close" aria-label="Close editor" onClick={() => setDraft(undefined)}><X/></button><h2>{draft.id ? 'Edit template' : 'New template'}</h2><p>Available tokens include {'{{event.name}}'}, {'{{speaker.firstName}}'}, {'{{submission.title}}'}, {'{{task.title}}'}, and {'{{task.dueAt}}'}.</p><label>Name<input ref={modalFirstFieldRef} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/></label><label>Subject<input value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })}/></label><label>Default audience<select value={draft.audience} onChange={(event) => setDraft({ ...draft, audience: event.target.value as MessageAudience })}><option value="accepted">Accepted speakers</option><option value="confirmed">Confirmed speakers</option><option value="incomplete-onboarding">Incomplete onboarding</option><option value="overdue-tasks">Overdue tasks</option><option value="custom">Specific speakers</option></select></label><label>Body<textarea rows={8} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })}/></label><label className="checkbox-label"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}/>Template active</label><button className="feature-button primary" type="submit">Save template</button></form></div>}
  </section>
}

function ReminderAutomation({ emailConfigured }: { emailConfigured: boolean }) {
  const { state, dispatch, persistenceMode } = useApp()
  const schedules = state.event.reminderSchedules ?? []
  const [firstRunValues, setFirstRunValues] = useState<Record<string, string>>({})
  const [firstRunErrors, setFirstRunErrors] = useState<Record<string, string>>({})
  const update = (schedule: ReminderSchedule) => dispatch({ type: 'event/update', patch: { reminderSchedules: schedules.map((item) => item.id === schedule.id ? schedule : item) }, at: nowIso() })
  const add = () => {
    const at = nowIso()
    const firstTemplate = state.templates[0]
    if (!firstTemplate) return
    const sendAt = new Date(Date.now() + 86_400_000).toISOString()
    dispatch({ type: 'event/update', patch: { reminderSchedules: [...schedules, { id: createId('reminder'), name: 'New reminder', templateId: firstTemplate.id, audience: firstTemplate.audience, enabled: false, cadence: 'daily', daysBeforeDue: 3, sendAt, nextRunAt: sendAt, timezone: state.event.timezone, createdAt: at, updatedAt: at }] }, at })
  }
  return <section className="reminder-automation"><div className="section-title"><div><h2>Automated reminders</h2><span>Persisted schedules for due-date communications</span></div><button className="feature-button secondary" type="button" onClick={add}><Plus size={15}/>Add schedule</button></div><p className="automation-disclosure"><b>{persistenceMode === 'remote' && emailConfigured ? 'Delivery provider connected.' : 'Configuration only.'}</b> A deployed scheduler must execute enabled schedules while organizers are offline; this UI does not claim a run until the backend records one.</p>{schedules.map((schedule) => {
    const errorId = `reminder-first-run-${schedule.id}-error`
    const firstRunValue = firstRunValues[schedule.id] ?? (schedule.nextRunAt ?? schedule.sendAt ?? '').slice(0, 16)
    return <div className="reminder-row" key={schedule.id}><label>Name<input value={schedule.name} onChange={(event) => update({ ...schedule, name: event.target.value, updatedAt: nowIso() })} /></label><label>Template<select value={schedule.templateId} onChange={(event) => update({ ...schedule, templateId: event.target.value, updatedAt: nowIso() })}>{state.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><label>Audience<select value={schedule.audience} onChange={(event) => update({ ...schedule, audience: event.target.value as MessageAudience, updatedAt: nowIso() })}><option value="accepted">Accepted</option><option value="confirmed">Confirmed</option><option value="incomplete-onboarding">Incomplete onboarding</option><option value="overdue-tasks">Overdue tasks</option></select></label><label>Cadence<select value={schedule.cadence} onChange={(event) => update({ ...schedule, cadence: event.target.value as ReminderSchedule['cadence'], updatedAt: nowIso() })}><option value="once">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label><label>First run<input type="datetime-local" required value={firstRunValue} aria-invalid={Boolean(firstRunErrors[schedule.id])} aria-describedby={firstRunErrors[schedule.id] ? errorId : undefined} onChange={(event) => {
      const value = event.target.value
      setFirstRunValues((values) => ({ ...values, [schedule.id]: value }))
      const parsed = parseReminderDateTime(value)
      if (!parsed) {
        setFirstRunErrors((errors) => ({ ...errors, [schedule.id]: 'Choose a valid first run date and time.' }))
        return
      }
      setFirstRunErrors((errors) => { const next = { ...errors }; delete next[schedule.id]; return next })
      update({ ...schedule, sendAt: parsed, nextRunAt: nextReminderRun({ ...schedule, nextRunAt: parsed }, nowIso()), updatedAt: nowIso() })
    }} />{firstRunErrors[schedule.id] && <small id={errorId} role="alert">{firstRunErrors[schedule.id]}</small>}</label><label className="checkbox-label"><input type="checkbox" checked={schedule.enabled} onChange={(event) => update({ ...schedule, enabled: event.target.checked, updatedAt: nowIso() })} />Enabled</label><button className="danger-link" type="button" onClick={() => { if (window.confirm(`Delete the “${schedule.name}” reminder schedule?`)) dispatch({ type: 'event/update', patch: { reminderSchedules: schedules.filter((item) => item.id !== schedule.id) }, at: nowIso() }) }}><Trash2 size={14}/>Delete</button></div>
  })}</section>
}
