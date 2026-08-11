import { useEffect, useMemo, useState } from 'react'
import { CalendarPlus, Check, Download, Edit3, Mail, Plus, Send, Trash2, X } from 'lucide-react'
import { agendaToIcs, createId, downloadIcs, nowIso, renderTemplate, selectAudienceSpeakerIds, speakerName, useApp } from '../../core'
import type { MessageAudience, MessageTemplate } from '../../domain'
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

export function CommunicationsCenter() {
  const { state, dispatch, api, persistenceMode } = useApp()
  const [draft, setDraft] = useState<TemplateDraft>()
  const [selectedTemplateId, setSelectedTemplateId] = useState(state.templates[0]?.id ?? '')
  const [audience, setAudience] = useState<MessageAudience>(state.templates[0]?.audience ?? 'accepted')
  const [customIds, setCustomIds] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [emailConfigured, setEmailConfigured] = useState(false)
  const [sending, setSending] = useState(false)
  const selectedTemplate = state.templates.find((template) => template.id === selectedTemplateId)
  const recipientIds = selectAudienceSpeakerIds(state, audience, customIds)
  const previewSpeaker = state.speakers.find((speaker) => speaker.id === recipientIds[0])
  const previewSubmission = state.submissions.find((submission) => previewSpeaker && submission.speakerIds.includes(previewSpeaker.id))
  const previewTask = state.tasks.find((task) => previewSpeaker && task.speakerId === previewSpeaker.id && !task.completedAt)
  const preview = selectedTemplate ? renderTemplate(selectedTemplate, { event: state.event, speaker: previewSpeaker, submission: previewSubmission, task: previewTask }) : undefined
  const outbox = useMemo(() => [...state.communicationLog].sort((left, right) => right.sentAt.localeCompare(left.sentAt)), [state.communicationLog])

  useEffect(() => {
    if (!api || persistenceMode !== 'remote') return
    void api.getIntegrationStatus().then((status) => setEmailConfigured(status.configured.resend)).catch(() => setEmailConfigured(false))
  }, [api, persistenceMode])

  const chooseTemplate = (template: MessageTemplate) => {
    setSelectedTemplateId(template.id)
    setAudience(template.audience)
  }

  const editTemplate = (template: MessageTemplate) => setDraft({
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
        body: rendered.body, channel: 'in-app-outbox', status: 'sent', sentAt: at,
      }, at })
    }
    setNotice(`${recipientIds.length} personalized message${recipientIds.length === 1 ? '' : 's'} saved to the in-app outbox.`)
  }

  const sendExternal = async () => {
    if (!api || !selectedTemplate || recipientIds.length === 0) { setNotice('Choose a template and at least one recipient.'); return }
    setSending(true)
    try {
      const calendar = agendaToIcs(state)
      const messages = recipientIds.flatMap((speakerId) => {
        const speaker = state.speakers.find((item) => item.id === speakerId)
        if (!speaker) return []
        const submission = state.submissions.find((item) => item.speakerIds.includes(speakerId))
        const task = state.tasks.find((item) => item.speakerId === speakerId && !item.completedAt)
        const rendered = renderTemplate(selectedTemplate, { event: state.event, speaker, submission, task })
        return [{ speakerId, subject: rendered.subject, text: rendered.body, attachment: { filename: `${state.event.slug}.ics`, content: calendar, type: 'text/calendar' as const } }]
      })
      const receipt = await api.sendEmail({ idempotencyKey: `email-${crypto.randomUUID()}`, messages })
      const at = nowIso()
      for (const message of messages) dispatch({ type: 'communication/log', entry: { id: createId('message'), templateId: selectedTemplate.id, recipientSpeakerIds: [message.speakerId], subject: message.subject, body: message.text, channel: 'email', status: receipt.status === 'failed' ? 'failed' : 'sent', sentAt: at }, at })
      setNotice(`${receipt.result.sent ?? messages.length} email${messages.length === 1 ? '' : 's'} sent with calendar attachment. Run ${receipt.runId}.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Email delivery failed.')
    } finally {
      setSending(false)
    }
  }

  return <section className="communications-feature">
    <header className="feature-heading"><div><p>SPEAKER COMMUNICATIONS</p><h1>Communications</h1><span>Create reusable templates, preview personalization, and keep a durable delivery log.</span></div><div className="feature-actions"><button className="feature-button secondary" onClick={() => downloadIcs(`${state.event.slug}-calendar.ics`, agendaToIcs(state))}><CalendarPlus size={16}/>Download calendar invite</button><button className="feature-button primary" onClick={() => setDraft(emptyDraft)}><Plus size={16}/>New template</button></div></header>
    <div className="delivery-disclosure"><Mail size={17}/><p><b>{emailConfigured ? 'Resend delivery connected' : 'Email provider not configured'}</b> {emailConfigured ? 'Personalized messages are delivered with an iCalendar attachment and logged server-side.' : 'The in-app outbox remains available; configure RESEND_API_KEY and EMAIL_FROM for external delivery.'}</p></div>
    {notice && <div className="feature-notice" role="status">{notice}<button aria-label="Dismiss notice" onClick={() => setNotice('')}><X size={14}/></button></div>}

    <div className="communications-layout">
      <aside className="template-list"><div className="section-title"><div><h2>Templates</h2><span>{state.templates.length} reusable messages</span></div></div>{state.templates.map((template) => <article className={selectedTemplateId === template.id ? 'selected' : ''} key={template.id} onClick={() => chooseTemplate(template)}>
        <span className={`template-status ${template.enabled ? 'enabled' : ''}`}><Mail size={15}/></span><div><strong>{template.name}</strong><small>{template.subject}</small><em>{template.audience.replaceAll('-', ' ')}</em></div><button aria-label={`Edit ${template.name}`} onClick={(event) => { event.stopPropagation(); editTemplate(template) }}><Edit3 size={15}/></button>
      </article>)}</aside>

      <main className="message-composer">
        <div className="section-title"><div><h2>Compose and preview</h2><span>Template fields are rendered once per recipient.</span></div>{selectedTemplate && <button className="danger-link" onClick={() => { dispatch({ type: 'template/delete', id: selectedTemplate.id, at: nowIso() }); setSelectedTemplateId('') }}><Trash2 size={14}/>Delete</button>}</div>
        {!selectedTemplate && <div className="communications-empty">Choose or create a template.</div>}
        {selectedTemplate && <>
          <label className="field-label">Audience<select value={audience} onChange={(event) => setAudience(event.target.value as MessageAudience)}><option value="accepted">Accepted speakers</option><option value="confirmed">Confirmed speakers</option><option value="incomplete-onboarding">Incomplete onboarding</option><option value="overdue-tasks">Overdue tasks</option><option value="custom">Specific speakers</option></select></label>
          {audience === 'custom' && <div className="recipient-picker">{state.speakers.map((speaker) => <label key={speaker.id}><input type="checkbox" checked={customIds.includes(speaker.id)} onChange={(event) => setCustomIds(event.target.checked ? [...customIds, speaker.id] : customIds.filter((id) => id !== speaker.id))}/>{speakerName(speaker)}</label>)}</div>}
          <div className="recipient-count">{recipientIds.length} recipient{recipientIds.length === 1 ? '' : 's'}</div>
          <div className="message-preview"><span>PREVIEW {previewSpeaker ? `FOR ${speakerName(previewSpeaker).toUpperCase()}` : ''}</span><h3>{preview?.subject ?? selectedTemplate.subject}</h3><p>{preview?.body ?? selectedTemplate.body}</p>{preview && preview.unresolvedTokens.length > 0 && <small>Unresolved for this recipient: {preview.unresolvedTokens.join(', ')}</small>}</div>
          <div className="feature-actions"><button className="feature-button secondary send-button" onClick={sendToOutbox}><Send size={16}/>Save to outbox</button>{persistenceMode === 'remote' && <button className="feature-button primary send-button" disabled={!emailConfigured || sending} onClick={sendExternal}><Send size={16}/>{sending ? 'Sending…' : 'Send email + calendar'}</button>}</div>
        </>}
      </main>
    </div>

    <section className="outbox"><div className="section-title"><div><h2>Delivery log</h2><span>Durable messages created in this browser</span></div><button className="feature-button secondary" onClick={() => downloadIcs(`${state.event.slug}-calendar.ics`, agendaToIcs(state))}><Download size={15}/>Agenda ICS</button></div>{outbox.length === 0 && <div className="communications-empty">No messages sent yet.</div>}{outbox.map((entry) => { const speaker = state.speakers.find((item) => item.id === entry.recipientSpeakerIds[0]); return <article key={entry.id}><span><Check size={14}/></span><div><strong>{entry.subject}</strong><small>To {speaker ? `${speakerName(speaker)} · ${speaker.email}` : 'Unknown recipient'}</small></div><time>{new Date(entry.sentAt).toLocaleString()}</time><em>{entry.channel.replaceAll('-', ' ')}</em></article> })}</section>

    {draft && <div className="template-modal" role="dialog" aria-modal="true" aria-label="Template editor"><form onSubmit={(event) => { event.preventDefault(); saveTemplate() }}><button type="button" className="panel-close" aria-label="Close editor" onClick={() => setDraft(undefined)}><X/></button><h2>{draft.id ? 'Edit template' : 'New template'}</h2><p>Available tokens include {'{{event.name}}'}, {'{{speaker.firstName}}'}, {'{{submission.title}}'}, {'{{task.title}}'}, and {'{{task.dueAt}}'}.</p><label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/></label><label>Subject<input value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })}/></label><label>Default audience<select value={draft.audience} onChange={(event) => setDraft({ ...draft, audience: event.target.value as MessageAudience })}><option value="accepted">Accepted speakers</option><option value="confirmed">Confirmed speakers</option><option value="incomplete-onboarding">Incomplete onboarding</option><option value="overdue-tasks">Overdue tasks</option><option value="custom">Specific speakers</option></select></label><label>Body<textarea rows={8} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })}/></label><label className="checkbox-label"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}/>Template active</label><button className="feature-button primary" type="submit">Save template</button></form></div>}
  </section>
}
