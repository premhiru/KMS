// oxlint-disable react/only-export-components -- exported validation logic is covered by focused workflow tests.
import { useState, type FormEvent } from 'react'
import { Check, Copy, GripVertical, Plus, Trash2 } from 'lucide-react'
import { createId, nowIso, useApp } from '../../core'
import type { CfpConfig, CfpFieldType, CfpQuestion, CfpRoutingRule } from '../../domain'
import { normalizeCfpFormats } from './cfp-formats'
import './submissions.css'

const defaultConfig: CfpConfig = {
  open: true,
  closeAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  submissionLimit: 3,
  allowMultiple: true,
  welcomeMessage: 'Share your best practical lessons with our community.',
  thankYouMessage: 'Thanks for submitting. We will be in touch after committee review.',
  questions: [],
  version: 0,
  formats: [{ name: 'Talk', durationMinutes: 30 }, { name: 'Workshop', durationMinutes: 60 }],
  routingRules: [],
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

export interface CfpQuestionValidationError {
  questionId: string
  field: 'label' | 'options'
  message: string
}

export function validateCfpQuestions(questions: CfpQuestion[]): CfpQuestionValidationError | undefined {
  const missingLabel = questions.find((question) => !question.label.trim())
  if (missingLabel) return { questionId: missingLabel.id, field: 'label', message: 'Enter a question label.' }
  const missingOptions = questions.find((question) => question.type === 'select' && !question.options?.some((option) => option.trim()))
  if (missingOptions) return { questionId: missingOptions.id, field: 'options', message: `Add at least one option for “${missingOptions.label.trim()}”.` }
  return undefined
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
  const normalizedInitialFormats = normalizeCfpFormats(initial.formats)
  const [formats, setFormats] = useState(normalizedInitialFormats.length ? normalizedInitialFormats : defaultConfig.formats ?? [])
  const [routingRules, setRoutingRules] = useState<CfpRoutingRule[]>(initial.routingRules ?? [])
  const [version, setVersion] = useState(initial.version ?? 0)
  const [publishedAt, setPublishedAt] = useState(initial.publishedAt)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [questionError, setQuestionError] = useState<CfpQuestionValidationError>()
  const link = publicPath ?? `/events/${state.event.slug}/cfp`

  function updateQuestion(id: string, patch: Partial<CfpQuestion>) {
    setQuestions((items) => items.map((question) => question.id === id ? { ...question, ...patch } : question))
    if (questionError?.questionId === id) setQuestionError(undefined)
  }

  function setCondition(id: string, field: '' | 'track' | 'format') {
    setQuestions((items) => items.map((question) => question.id === id
      ? { ...question, showWhen: field ? { field, equals: '' } : undefined, conditions: undefined }
      : question))
  }

  function setPriorAnswerCondition(id: string, sourceQuestionId: string) {
    setQuestions((items) => items.map((question) => question.id === id ? { ...question, showWhen: undefined, conditions: sourceQuestionId ? [{ field: sourceQuestionId, operator: 'equals', value: '' }] : undefined } : question))
  }

  function addQuestion() {
    setQuestions((items) => [...items, { id: createId('question'), label: 'New question', type: 'text', required: false }])
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const limit = Number(submissionLimit)
    const validationError = validateCfpQuestions(questions)
    if (validationError) {
      setQuestionError(validationError)
      window.requestAnimationFrame(() => document.getElementById(`cfp-question-${validationError.questionId}-${validationError.field}`)?.focus())
      return
    }
    if (!closeAt || !Number.isInteger(limit) || limit < 1) return
    const savedAt = nowIso()
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
        conditions: question.conditions?.filter((condition) => condition.field && condition.value.trim()).map((condition) => ({ ...condition, value: condition.value.trim() }))
          ?? (question.showWhen?.equals.trim() ? [{ field: question.showWhen.field, operator: 'equals' as const, value: question.showWhen.equals.trim() }] : undefined),
      })),
      version: version + 1,
      publishedAt: savedAt,
      formats: formats.filter((item) => item.name.trim()).map((item) => ({ name: item.name.trim(), durationMinutes: Math.max(5, item.durationMinutes) })),
      routingRules: routingRules.filter((rule) => rule.category.trim() && rule.track).map((rule) => ({ ...rule, category: rule.category.trim().toLowerCase().replaceAll(' ', '-'), label: rule.label.trim() || rule.category.trim() })),
    }
    dispatch({ type: 'event/update', patch: { cfp: config }, at: savedAt })
    setVersion(config.version ?? version + 1)
    setPublishedAt(savedAt)
    setQuestionError(undefined)
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
          <p className="sb-version-note">Published form version <strong>{version}</strong>{publishedAt ? ` · ${new Date(publishedAt).toLocaleString()}` : ''}. Saving publishes the next version without changing past submission answers.</p>
          <div className="sb-form__row sb-form__row--two">
            <label>Close date and time<input required type="datetime-local" value={closeAt} onChange={(event) => setCloseAt(event.target.value)} /></label>
            <label>Maximum proposals per speaker<input required min="1" max="20" type="number" value={submissionLimit} onChange={(event) => setSubmissionLimit(event.target.value)} /></label>
          </div>
          <label className="sb-check"><input type="checkbox" checked={allowMultiple} onChange={(event) => setAllowMultiple(event.target.checked)} /><span><strong>Allow multiple submissions</strong><small>When disabled, each speaker email can submit once.</small></span></label>
          <div className="sb-public-link"><span>Public URL</span><code>{link}</code></div>
        </section>

        <section className="sb-card" aria-labelledby="cfp-routing-title">
          <div className="sb-card__header"><div><p className="sb-eyebrow">Taxonomy</p><h2 id="cfp-routing-title">Formats and category routing</h2><p>Categories set a default review track; applicants can see the routing decision.</p></div></div>
          <div className="sb-format-list">{formats.map((item, index) => <div key={`${item.name}-${index}`}><label>Format<input value={item.name} onChange={(event) => setFormats((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} /></label><label>Default minutes<input min="5" max="240" type="number" value={item.durationMinutes} onChange={(event) => setFormats((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, durationMinutes: Number(event.target.value) } : row))} /></label><button className="sb-icon-button sb-icon-button--danger" type="button" aria-label={`Delete ${item.name}`} onClick={() => setFormats((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 aria-hidden="true" /></button></div>)}<button className="sb-button" type="button" onClick={() => setFormats((rows) => [...rows, { name: 'New format', durationMinutes: 30 }])}><Plus aria-hidden="true" />Add format</button></div>
          <div className="sb-routing-list">{routingRules.map((rule) => <div key={rule.id}><label>Category key<input value={rule.category} onChange={(event) => setRoutingRules((rows) => rows.map((row) => row.id === rule.id ? { ...row, category: event.target.value } : row))} /></label><label>Public label<input value={rule.label} onChange={(event) => setRoutingRules((rows) => rows.map((row) => row.id === rule.id ? { ...row, label: event.target.value } : row))} /></label><label>Route to track<select value={rule.track} onChange={(event) => setRoutingRules((rows) => rows.map((row) => row.id === rule.id ? { ...row, track: event.target.value } : row))}>{state.event.tracks.map((item) => <option key={item}>{item}</option>)}</select></label><label className="sb-check"><input type="checkbox" checked={rule.enabled} onChange={(event) => setRoutingRules((rows) => rows.map((row) => row.id === rule.id ? { ...row, enabled: event.target.checked } : row))} /><span><strong>Enabled</strong></span></label><button className="sb-icon-button sb-icon-button--danger" type="button" aria-label={`Delete ${rule.label}`} onClick={() => setRoutingRules((rows) => rows.filter((row) => row.id !== rule.id))}><Trash2 aria-hidden="true" /></button></div>)}<button className="sb-button" type="button" onClick={() => setRoutingRules((rows) => [...rows, { id: createId('route'), category: 'new-category', label: 'New category', track: state.event.tracks[0] ?? 'General', enabled: true }])}><Plus aria-hidden="true" />Add routing rule</button></div>
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
                <label className="sb-question-editor__label">Question label<input id={`cfp-question-${question.id}-label`} required aria-invalid={questionError?.questionId === question.id && questionError.field === 'label'} aria-describedby={questionError?.questionId === question.id && questionError.field === 'label' ? `cfp-question-${question.id}-error` : undefined} value={question.label} onChange={(event) => updateQuestion(question.id, { label: event.target.value })} />{questionError?.questionId === question.id && questionError.field === 'label' && <small id={`cfp-question-${question.id}-error`} role="alert">{questionError.message}</small>}</label>
                <label>Type<select value={question.type} onChange={(event) => updateQuestion(question.id, { type: event.target.value as CfpFieldType })}><option value="text">Short text</option><option value="textarea">Long text</option><option value="select">Select</option><option value="checkbox">Checkbox</option></select></label>
                {question.type === 'select' && <label className="sb-question-editor__wide">Options<input id={`cfp-question-${question.id}-options`} required aria-invalid={questionError?.questionId === question.id && questionError.field === 'options'} aria-describedby={questionError?.questionId === question.id && questionError.field === 'options' ? `cfp-question-${question.id}-error` : undefined} value={question.options?.join(', ') ?? ''} onChange={(event) => updateQuestion(question.id, { options: event.target.value.split(',') })} placeholder="Beginner, Intermediate, Advanced" />{questionError?.questionId === question.id && questionError.field === 'options' && <small id={`cfp-question-${question.id}-error`} role="alert">{questionError.message}</small>}</label>}
                <label>Show when<select value={question.conditions?.[0] ? 'question' : question.showWhen?.field ?? ''} onChange={(event) => { if (event.target.value === 'question') setPriorAnswerCondition(question.id, questions.find((item) => item.id !== question.id)?.id ?? ''); else setCondition(question.id, event.target.value as '' | 'track' | 'format') }}><option value="">Always</option><option value="track">Track is…</option><option value="format">Format is…</option><option value="question">Prior answer is…</option></select></label>
                {question.showWhen && <label>Equals<input required value={question.showWhen.equals} onChange={(event) => updateQuestion(question.id, { showWhen: { field: question.showWhen!.field, equals: event.target.value } })} list={`cfp-values-${question.id}`} /><datalist id={`cfp-values-${question.id}`}>{question.showWhen.field === 'track' ? state.event.tracks.map((item) => <option key={item}>{item}</option>) : ['Talk', 'Workshop', 'Panel', 'Lightning talk'].map((item) => <option key={item}>{item}</option>)}</datalist></label>}
                {question.conditions?.[0] && <><label>Prior question<select value={question.conditions[0].field} onChange={(event) => updateQuestion(question.id, { conditions: [{ ...question.conditions![0], field: event.target.value }] })}>{questions.filter((item) => item.id !== question.id).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>Answer equals<input required value={question.conditions[0].value} onChange={(event) => updateQuestion(question.id, { conditions: [{ ...question.conditions![0], value: event.target.value }] })} /></label></>}
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
