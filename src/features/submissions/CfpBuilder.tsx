import { useState, type FormEvent } from 'react'
import { Check, Copy, GripVertical, Plus, Trash2 } from 'lucide-react'
import { createId, nowIso, useApp } from '../../core'
import type { CfpConfig, CfpFieldType, CfpQuestion } from '../../domain'
import './submissions.css'

const defaultConfig: CfpConfig = {
  open: true,
  closeAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  submissionLimit: 3,
  allowMultiple: true,
  welcomeMessage: 'Share your best practical lessons with our community.',
  thankYouMessage: 'Thanks for submitting. We will be in touch after committee review.',
  questions: [],
}

function toLocalDateTime(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export interface CfpBuilderProps {
  publicPath?: string
}

export function CfpBuilder({ publicPath }: CfpBuilderProps) {
  const { state, dispatch } = useApp()
  const initial = state.event.cfp ?? defaultConfig
  const [open, setOpen] = useState(initial.open)
  const [closeAt, setCloseAt] = useState(toLocalDateTime(initial.closeAt))
  const [submissionLimit, setSubmissionLimit] = useState(String(initial.submissionLimit))
  const [allowMultiple, setAllowMultiple] = useState(initial.allowMultiple)
  const [welcomeMessage, setWelcomeMessage] = useState(initial.welcomeMessage)
  const [thankYouMessage, setThankYouMessage] = useState(initial.thankYouMessage)
  const [questions, setQuestions] = useState<CfpQuestion[]>(initial.questions)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const link = publicPath ?? `/events/${state.event.slug}/cfp`

  function updateQuestion(id: string, patch: Partial<CfpQuestion>) {
    setQuestions((items) => items.map((question) => question.id === id ? { ...question, ...patch } : question))
  }

  function setCondition(id: string, field: '' | 'track' | 'format') {
    setQuestions((items) => items.map((question) => question.id === id
      ? { ...question, showWhen: field ? { field, equals: '' } : undefined }
      : question))
  }

  function addQuestion() {
    setQuestions((items) => [...items, { id: createId('question'), label: 'New question', type: 'text', required: false }])
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const limit = Number(submissionLimit)
    if (!closeAt || !Number.isInteger(limit) || limit < 1 || questions.some((question) => !question.label.trim() || (question.type === 'select' && !question.options?.some((option) => option.trim())))) return
    const config: CfpConfig = {
      open,
      closeAt: new Date(closeAt).toISOString(),
      submissionLimit: limit,
      allowMultiple,
      welcomeMessage: welcomeMessage.trim(),
      thankYouMessage: thankYouMessage.trim(),
      questions: questions.map((question) => ({
        ...question,
        label: question.label.trim(),
        options: question.type === 'select' ? question.options?.map((option) => option.trim()).filter(Boolean) : undefined,
        showWhen: question.showWhen?.equals.trim() ? { ...question.showWhen, equals: question.showWhen.equals.trim() } : undefined,
      })),
    }
    dispatch({ type: 'event/update', patch: { cfp: config }, at: nowIso() })
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }

  async function copyLink() {
    const url = link.startsWith('http') ? link : `${window.location.origin}${link}`
    await navigator.clipboard?.writeText(url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <section className="sb-feature" aria-labelledby="cfp-builder-title">
      <header className="sb-feature__header">
        <div>
          <p className="sb-eyebrow">Program · Submission form</p>
          <h1 id="cfp-builder-title">Call for speakers</h1>
          <p>Configure the public form, limits, messages, and conditional questions.</p>
        </div>
        <button className="sb-button" type="button" onClick={copyLink}><Copy aria-hidden="true" />{copied ? 'Copied' : 'Copy public link'}</button>
      </header>

      <form className="sb-builder" onSubmit={save}>
        <section className="sb-card" aria-labelledby="cfp-availability-title">
          <div className="sb-card__header"><div><p className="sb-eyebrow">Availability</p><h2 id="cfp-availability-title">Publishing rules</h2></div><label className="sb-switch"><input type="checkbox" checked={open} onChange={(event) => setOpen(event.target.checked)} /><span aria-hidden="true" />{open ? 'Open' : 'Closed'}</label></div>
          <div className="sb-form__row sb-form__row--two">
            <label>Close date and time<input required type="datetime-local" value={closeAt} onChange={(event) => setCloseAt(event.target.value)} /></label>
            <label>Maximum proposals per speaker<input required min="1" max="20" type="number" value={submissionLimit} onChange={(event) => setSubmissionLimit(event.target.value)} /></label>
          </div>
          <label className="sb-check"><input type="checkbox" checked={allowMultiple} onChange={(event) => setAllowMultiple(event.target.checked)} /><span><strong>Allow multiple submissions</strong><small>When disabled, each speaker email can submit once.</small></span></label>
          <div className="sb-public-link"><span>Public URL</span><code>{link}</code></div>
        </section>

        <section className="sb-card" aria-labelledby="cfp-messages-title">
          <div className="sb-card__header"><div><p className="sb-eyebrow">Copy</p><h2 id="cfp-messages-title">Welcome and confirmation</h2></div></div>
          <label>Welcome message<textarea required rows={3} value={welcomeMessage} onChange={(event) => setWelcomeMessage(event.target.value)} /></label>
          <label>Thank-you message<textarea required rows={3} value={thankYouMessage} onChange={(event) => setThankYouMessage(event.target.value)} /></label>
        </section>

        <section className="sb-card" aria-labelledby="cfp-questions-title">
          <div className="sb-card__header">
            <div><p className="sb-eyebrow">Form builder</p><h2 id="cfp-questions-title">Custom questions</h2><p>Questions can appear only for a chosen track or format.</p></div>
            <button className="sb-button" type="button" onClick={addQuestion}><Plus aria-hidden="true" />Add question</button>
          </div>
          <div className="sb-question-list">
            {questions.length === 0 && <div className="sb-empty sb-empty--compact"><p>No custom questions yet. Standard proposal and speaker fields are always included.</p></div>}
            {questions.map((question, index) => (
              <fieldset className="sb-question-editor" key={question.id}>
                <legend className="sb-sr-only">Question {index + 1}</legend>
                <GripVertical aria-hidden="true" className="sb-question-editor__grip" />
                <label className="sb-question-editor__label">Question label<input required value={question.label} onChange={(event) => updateQuestion(question.id, { label: event.target.value })} /></label>
                <label>Type<select value={question.type} onChange={(event) => updateQuestion(question.id, { type: event.target.value as CfpFieldType })}><option value="text">Short text</option><option value="textarea">Long text</option><option value="select">Select</option><option value="checkbox">Checkbox</option></select></label>
                {question.type === 'select' && <label className="sb-question-editor__wide">Options<input required value={question.options?.join(', ') ?? ''} onChange={(event) => updateQuestion(question.id, { options: event.target.value.split(',') })} placeholder="Beginner, Intermediate, Advanced" /></label>}
                <label>Show when<select value={question.showWhen?.field ?? ''} onChange={(event) => setCondition(question.id, event.target.value as '' | 'track' | 'format')}><option value="">Always</option><option value="track">Track is…</option><option value="format">Format is…</option></select></label>
                {question.showWhen && <label>Equals<input required value={question.showWhen.equals} onChange={(event) => updateQuestion(question.id, { showWhen: { field: question.showWhen!.field, equals: event.target.value } })} list={`cfp-values-${question.id}`} /><datalist id={`cfp-values-${question.id}`}>{question.showWhen.field === 'track' ? state.event.tracks.map((item) => <option key={item}>{item}</option>) : ['Talk', 'Workshop', 'Panel', 'Lightning talk'].map((item) => <option key={item}>{item}</option>)}</datalist></label>}
                <label className="sb-check sb-question-editor__required"><input type="checkbox" checked={question.required} onChange={(event) => updateQuestion(question.id, { required: event.target.checked })} /><span><strong>Required</strong></span></label>
                <button className="sb-icon-button sb-icon-button--danger" type="button" onClick={() => setQuestions((items) => items.filter((item) => item.id !== question.id))} aria-label={`Delete ${question.label}`}><Trash2 aria-hidden="true" /></button>
              </fieldset>
            ))}
          </div>
        </section>

        <div className="sb-sticky-actions"><span>{questions.length} custom question{questions.length === 1 ? '' : 's'}</span><button className="sb-button sb-button--primary" type="submit">{saved ? <><Check aria-hidden="true" />Saved</> : 'Save and publish'}</button></div>
      </form>
    </section>
  )
}
