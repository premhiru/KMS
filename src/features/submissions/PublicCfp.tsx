import { cloneElement, isValidElement, useEffect, useMemo, useRef, useState, type FormEvent, type ReactElement } from 'react'
import { ArrowRight, CalendarClock, CheckCircle2, KeyRound, Route, Sparkles, UserPlus } from 'lucide-react'
import { createSpeaker, createSubmission, nowIso, useApp } from '../../core'
import type { CfpQuestion, Id } from '../../domain'
import './submissions.css'

const fallbackCategories = [
  { value: 'case-study', label: 'Practical case study', trackHints: ['Applied AI', 'Product & design'] },
  { value: 'open-source', label: 'Open-source project', trackHints: ['Developer tools', 'Infrastructure'] },
  { value: 'research', label: 'Research & evaluation', trackHints: ['Evaluation'] },
  { value: 'leadership', label: 'Leadership & strategy', trackHints: ['Product & design', 'Agents & orchestration'] },
] as const

type Category = string

interface SpeakerDraft {
  firstName: string
  lastName: string
  email: string
  company: string
  jobTitle: string
  bio: string
}

interface ProposalDraft {
  category: Category
  title: string
  abstract: string
  track: string
  format: string
  duration: string
  tags: string
  result: string
  workshopPlan: string
}

const blankSpeaker: SpeakerDraft = { firstName: '', lastName: '', email: '', company: '', jobTitle: '', bio: '' }

export interface PublicCfpProps {
  onSubmitted?: (submissionId: Id) => void
}

export function PublicCfp({ onSubmitted }: PublicCfpProps) {
  const { state, dispatch, persistenceMode, submitCfp, requestCfpClaim, verifyCfpClaim } = useApp()
  const cfp = state.event.cfp
  const categories = cfp?.routingRules?.filter((rule) => rule.enabled).map((rule) => ({ value: rule.category, label: rule.label, trackHints: [rule.track] })) ?? fallbackCategories
  const formats = cfp?.formats?.length ? cfp.formats : [{ name: 'Talk', durationMinutes: 30 }, { name: 'Workshop', durationMinutes: 60 }, { name: 'Panel', durationMinutes: 45 }, { name: 'Lightning talk', durationMinutes: 10 }]
  const defaultTrack = state.event.tracks[0] ?? 'General'
  const tracks = state.event.tracks.length > 0 ? state.event.tracks : [defaultTrack]
  const [speaker, setSpeaker] = useState<SpeakerDraft>(blankSpeaker)
  const [coSpeaker, setCoSpeaker] = useState<SpeakerDraft>(blankSpeaker)
  const [includeCoSpeaker, setIncludeCoSpeaker] = useState(false)
  const [proposal, setProposal] = useState<ProposalDraft>({ category: categories[0]?.value ?? 'general', title: '', abstract: '', track: categories[0]?.trackHints[0] ?? defaultTrack, format: formats[0]?.name ?? 'Talk', duration: String(formats[0]?.durationMinutes ?? 30), tags: '', result: '', workshopPlan: '' })
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState<{ id: Id; title: string; email: string }>()
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string>()
  const [claimEmail, setClaimEmail] = useState('')
  const [claimStatus, setClaimStatus] = useState<'idle' | 'requesting' | 'sent' | 'verifying' | 'failed'>('idle')
  const [claimMessage, setClaimMessage] = useState('')
  const claimVerificationStarted = useRef(false)
  const claimToken = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('claimToken') ?? params.get('cfpClaim')
  }, [])

  useEffect(() => {
    if (!claimToken || persistenceMode === 'local' || claimVerificationStarted.current) return
    claimVerificationStarted.current = true
    setClaimStatus('verifying')
    setClaimMessage('Verifying your one-time access link…')
    void verifyCfpClaim(claimToken).then((receipt) => {
      const next = new URL(window.location.href)
      next.searchParams.delete('claimToken')
      next.searchParams.delete('cfpClaim')
      next.searchParams.set('eventId', receipt.eventId)
      next.hash = '/portal'
      window.location.replace(next.toString())
    }).catch(() => {
      setClaimStatus('failed')
      setClaimMessage('This access link is invalid, expired, or already used. Request a new link below.')
    })
  }, [claimToken, persistenceMode, verifyCfpClaim])

  const visibleQuestions = useMemo(() => (cfp?.questions ?? []).filter((question) => {
    if (question.conditions?.length) return question.conditions.every((condition) => {
      const actual = condition.field === 'track' ? proposal.track : condition.field === 'format' ? proposal.format : answers[condition.field] ?? ''
      return condition.operator === 'notEquals' ? actual !== condition.value : actual === condition.value
    })
    if (!question.showWhen) return true
    return question.showWhen.field === 'track'
      ? question.showWhen.equals === proposal.track
      : question.showWhen.equals === proposal.format
  }), [answers, cfp?.questions, proposal.format, proposal.track])

  const closed = cfp ? !cfp.open || Date.parse(cfp.closeAt) < Date.now() : false

  function updateSpeaker(field: keyof SpeakerDraft, value: string, co = false) {
    const update = (current: SpeakerDraft) => ({ ...current, [field]: value })
    if (co) setCoSpeaker(update)
    else setSpeaker(update)
  }

  function updateProposal(field: keyof ProposalDraft, value: string) {
    setProposal((current) => ({ ...current, [field]: value }))
  }

  function routeCategory(category: Category) {
    const definition = categories.find((item) => item.value === category)
    const routedTrack = definition?.trackHints.find((hint) => state.event.tracks.includes(hint)) ?? defaultTrack
    setProposal((current) => ({ ...current, category, track: routedTrack }))
  }

  function changeFormat(format: string) {
    const duration = String(formats.find((item) => item.name === format)?.durationMinutes ?? 30)
    setProposal((current) => ({ ...current, format, duration }))
    if (format === 'Panel') setIncludeCoSpeaker(true)
  }

  function validate(): Record<string, string> {
    const next: Record<string, string> = {}
    if (!speaker.firstName.trim()) next.firstName = 'Enter your first name.'
    if (!speaker.lastName.trim()) next.lastName = 'Enter your last name.'
    if (!/^\S+@\S+\.\S+$/.test(speaker.email.trim())) next.email = 'Enter a valid email address.'
    if (speaker.bio.trim().length < 40) next.bio = 'Add a bio of at least 40 characters.'
    if (proposal.title.trim().length < 8) next.title = 'Use a title of at least 8 characters.'
    if (proposal.abstract.trim().length < 80) next.abstract = 'Describe the proposal in at least 80 characters.'
    if (!proposal.track) next.track = 'Choose a track.'
    if (proposal.category === 'case-study' && proposal.result.trim().length < 20) next.result = 'Describe a concrete result or lesson.'
    if (proposal.format === 'Workshop' && proposal.workshopPlan.trim().length < 20) next.workshopPlan = 'Describe the hands-on activity.'
    if (includeCoSpeaker) {
      if (!coSpeaker.firstName.trim() || !coSpeaker.lastName.trim()) next.coSpeakerName = 'Enter the co-speaker name.'
      if (!/^\S+@\S+\.\S+$/.test(coSpeaker.email.trim())) next.coSpeakerEmail = 'Enter a valid co-speaker email.'
      if (coSpeaker.email.trim().toLowerCase() === speaker.email.trim().toLowerCase()) next.coSpeakerEmail = 'Use a different email for the co-speaker.'
    }
    for (const question of visibleQuestions) {
      const answer = answers[question.id] ?? ''
      if (question.required && (question.type === 'checkbox' ? answer !== 'true' : !answer.trim())) next[`question-${question.id}`] = 'This answer is required.'
    }
    return next
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (closed) return
    const nextErrors = validate()
    const existingSpeaker = state.speakers.find((item) => item.email.toLowerCase() === speaker.email.trim().toLowerCase())
    if (existingSpeaker) {
      const count = state.submissions.filter((item) => item.speakerIds.includes(existingSpeaker.id)).length
      const limit = cfp ? (cfp.allowMultiple ? cfp.submissionLimit : 1) : 3
      if (count >= limit) nextErrors.email = `This email has reached the limit of ${limit} proposal${limit === 1 ? '' : 's'}.`
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }

    if (persistenceMode !== 'local') {
      setSubmitting(true)
      setServerError(undefined)
      try {
        const receipt = await submitCfp({
          title: proposal.title.trim(), abstract: proposal.abstract.trim(),
          speakerName: `${speaker.firstName.trim()} ${speaker.lastName.trim()}`,
          speakerEmail: speaker.email.trim().toLowerCase(), track: proposal.track, format: proposal.format, consent: true,
          category: proposal.category, durationMinutes: Number(proposal.duration),
          tags: proposal.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
          speakerProfile: { ...speaker, email: speaker.email.trim().toLowerCase() },
          coSpeakers: includeCoSpeaker ? [{ name: `${coSpeaker.firstName.trim()} ${coSpeaker.lastName.trim()}`, ...coSpeaker, email: coSpeaker.email.trim().toLowerCase() }] : [],
          customAnswers: { ...answers, result: proposal.result.trim(), workshopPlan: proposal.workshopPlan.trim() },
          cfpVersion: cfp?.version ?? 1,
        })
        setSubmitted({ id: receipt.id, title: proposal.title.trim(), email: speaker.email.trim().toLowerCase() })
        setClaimEmail(speaker.email.trim().toLowerCase())
        onSubmitted?.(receipt.id)
      } catch (error) {
        setServerError(error instanceof Error ? error.message : 'The proposal could not be submitted. Please try again.')
      } finally {
        setSubmitting(false)
      }
      return
    }

    const at = nowIso()
    const primary = existingSpeaker ?? createSpeaker({ ...speaker, status: 'invited' }, at)
    if (!existingSpeaker) dispatch({ type: 'speaker/create', speaker: primary, at })
    const speakerIds = [primary.id]
    if (includeCoSpeaker) {
      const existingCoSpeaker = state.speakers.find((item) => item.email.toLowerCase() === coSpeaker.email.trim().toLowerCase())
      const createdCoSpeaker = existingCoSpeaker ?? createSpeaker({ ...coSpeaker, status: 'invited' }, at)
      if (!existingCoSpeaker) dispatch({ type: 'speaker/create', speaker: createdCoSpeaker, at })
      speakerIds.push(createdCoSpeaker.id)
    }

    const customAnswers = visibleQuestions
      .map((question) => `${question.label}: ${question.type === 'checkbox' ? (answers[question.id] === 'true' ? 'Yes' : 'No') : answers[question.id] ?? ''}`)
      .filter((line) => !line.endsWith(': '))
    const conditionalDetails = [
      proposal.result.trim() ? `Result or lesson: ${proposal.result.trim()}` : '',
      proposal.workshopPlan.trim() ? `Workshop activity: ${proposal.workshopPlan.trim()}` : '',
      ...customAnswers,
    ].filter(Boolean)
    const abstract = conditionalDetails.length > 0 ? `${proposal.abstract.trim()}\n\nAdditional submission details\n${conditionalDetails.join('\n')}` : proposal.abstract.trim()
    const submission = createSubmission({
      title: proposal.title,
      abstract,
      track: proposal.track,
      format: proposal.format,
      durationMinutes: Number(proposal.duration),
      speakerIds,
      status: 'needs-review',
      tags: [`category:${proposal.category}`, ...proposal.tags.split(',')],
    }, at)
    dispatch({ type: 'submission/create', submission: { ...submission, origin: 'cfp', cfpVersion: cfp?.version ?? 1 }, at })
    setSubmitted({ id: submission.id, title: submission.title, email: primary.email })
    setClaimEmail(primary.email)
    onSubmitted?.(submission.id)
  }

  async function requestAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = claimEmail.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setClaimStatus('failed')
      setClaimMessage('Enter the email address used for your proposal.')
      return
    }
    const returnUrl = new URL(window.location.href)
    returnUrl.searchParams.delete('claimToken')
    returnUrl.searchParams.delete('cfpClaim')
    returnUrl.hash = '/cfp'
    setClaimStatus('requesting')
    setClaimMessage('')
    try {
      await requestCfpClaim({ email, returnUrl: returnUrl.toString() })
      setClaimStatus('sent')
      setClaimMessage('If that address is associated with this event, a one-time access link is on its way. Check your inbox and spam folder.')
    } catch (error) {
      setClaimStatus('failed')
      setClaimMessage(error instanceof Error ? error.message : 'The access link could not be requested. Please try again.')
    }
  }

  function startAnother() {
    setProposal({ category: categories[0]?.value ?? 'general', title: '', abstract: '', track: categories[0]?.trackHints[0] ?? defaultTrack, format: formats[0]?.name ?? 'Talk', duration: String(formats[0]?.durationMinutes ?? 30), tags: '', result: '', workshopPlan: '' })
    setCoSpeaker(blankSpeaker)
    setIncludeCoSpeaker(false)
    setAnswers({})
    setErrors({})
    setSubmitted(undefined)
  }

  if (claimToken && claimStatus === 'verifying') {
    return <main className="sb-cfp-public sb-cfp-public--confirmation"><div className="sb-confirmation" role="status"><span className="sb-confirmation__icon"><KeyRound aria-hidden="true" /></span><p className="sb-eyebrow">Secure speaker access</p><h1>Opening your proposal dashboard</h1><p>{claimMessage}</p></div></main>
  }

  if (submitted) {
    return (
      <main className="sb-cfp-public sb-cfp-public--confirmation">
        <div className="sb-confirmation">
          <span className="sb-confirmation__icon"><CheckCircle2 aria-hidden="true" /></span>
          <p className="sb-eyebrow" role="status">Proposal received</p>
          <h1>Thank you, {speaker.firstName}.</h1>
          <p>{cfp?.thankYouMessage ?? 'Thanks for submitting. We will be in touch after committee review.'}</p>
          <dl><div><dt>Proposal</dt><dd>{submitted.title}</dd></div><div><dt>Contact email</dt><dd>{submitted.email}</dd></div><div><dt>Reference</dt><dd>{submitted.id}</dd></div></dl>
          {persistenceMode !== 'local' && <ClaimAccessForm email={claimEmail} status={claimStatus} message={claimMessage} onEmailChange={setClaimEmail} onSubmit={requestAccess} />}
          {cfp?.allowMultiple && <button className="sb-button sb-button--primary" type="button" onClick={startAnother}>Submit another proposal <ArrowRight aria-hidden="true" /></button>}
        </div>
      </main>
    )
  }

  return (
    <main className="sb-cfp-public">
      <header className="sb-cfp-hero">
        <div className="sb-cfp-hero__mark"><Sparkles aria-hidden="true" /></div>
        <p className="sb-eyebrow">{state.event.name} · Call for speakers</p>
        <h1>Share what you learned building the future.</h1>
        <p>{cfp?.welcomeMessage ?? 'Share your best practical lessons with our community.'}</p>
        {cfp && <span className="sb-cfp-deadline"><CalendarClock aria-hidden="true" />Closes {new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(cfp.closeAt))}</span>}
      </header>

      {persistenceMode !== 'local' && <ClaimAccessForm email={claimEmail} status={claimStatus} message={claimMessage} onEmailChange={setClaimEmail} onSubmit={requestAccess} />}

      {closed ? (
        <section className="sb-cfp-form sb-empty"><CalendarClock aria-hidden="true" /><h2>Submissions are closed</h2><p>The call for speakers is not accepting new proposals.</p></section>
      ) : (
        <form className="sb-cfp-form" onSubmit={submit} noValidate>
          <section aria-labelledby="cfp-proposal-title">
            <div className="sb-section-heading"><span>1</span><div><h2 id="cfp-proposal-title">Your proposal</h2><p>Choose a category first; we will route it to the best-fit review track.</p></div></div>
            <div className="sb-category-grid" role="radiogroup" aria-label="Proposal category">
              {categories.map((category) => <label key={category.value} className={proposal.category === category.value ? 'is-selected' : ''}><input type="radio" name="category" checked={proposal.category === category.value} onChange={() => routeCategory(category.value)} /><Route aria-hidden="true" /><strong>{category.label}</strong><small>Routes to {category.trackHints[0]}</small></label>)}
            </div>
            <div className="sb-route-note"><Route aria-hidden="true" /><span><strong>Routed to {proposal.track}</strong> The published category rule assigns this track automatically.</span></div>
            <div className="sb-form sb-form--public">
              <Field label="Session title" error={errors.title}><input required aria-invalid={Boolean(errors.title)} value={proposal.title} onChange={(event) => updateProposal('title', event.target.value)} placeholder="A clear, specific title" /></Field>
              <Field label="Abstract" error={errors.abstract} hint={`${proposal.abstract.length}/800 characters`}><textarea required aria-invalid={Boolean(errors.abstract)} maxLength={800} rows={7} value={proposal.abstract} onChange={(event) => updateProposal('abstract', event.target.value)} placeholder="What problem did you solve, what did you learn, and what can attendees use?" /></Field>
              <div className="sb-form__row">
                <Field label="Track" error={errors.track}><select required disabled aria-invalid={Boolean(errors.track)} value={proposal.track}>{tracks.map((item) => <option key={item}>{item}</option>)}</select></Field>
                <Field label="Format"><select value={proposal.format} onChange={(event) => changeFormat(event.target.value)}>{formats.map((item) => <option key={item.name}>{item.name}</option>)}</select></Field>
                <Field label="Minutes"><input min="5" max="180" type="number" value={proposal.duration} onChange={(event) => updateProposal('duration', event.target.value)} /></Field>
              </div>
              {proposal.category === 'case-study' && <Field label="What measurable result or hard-won lesson can you share?" error={errors.result}><textarea required aria-invalid={Boolean(errors.result)} rows={3} value={proposal.result} onChange={(event) => updateProposal('result', event.target.value)} /></Field>}
              {proposal.format === 'Workshop' && <Field label="Describe the hands-on activity" error={errors.workshopPlan}><textarea required aria-invalid={Boolean(errors.workshopPlan)} rows={3} value={proposal.workshopPlan} onChange={(event) => updateProposal('workshopPlan', event.target.value)} /></Field>}
              <Field label="Tags" hint="Separate keywords with commas"><input value={proposal.tags} onChange={(event) => updateProposal('tags', event.target.value)} placeholder="agents, evaluation, open source" /></Field>
              {visibleQuestions.map((question) => <CustomQuestion key={question.id} question={question} value={answers[question.id] ?? ''} error={errors[`question-${question.id}`]} onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))} />)}
            </div>
          </section>

          <section aria-labelledby="cfp-speaker-title">
            <div className="sb-section-heading"><span>2</span><div><h2 id="cfp-speaker-title">Speaker details</h2><p>This information creates your speaker portal profile.</p></div></div>
            <div className="sb-form sb-form--public">
              <div className="sb-form__row sb-form__row--two"><Field label="First name" error={errors.firstName}><input required aria-invalid={Boolean(errors.firstName)} autoComplete="given-name" value={speaker.firstName} onChange={(event) => updateSpeaker('firstName', event.target.value)} /></Field><Field label="Last name" error={errors.lastName}><input required aria-invalid={Boolean(errors.lastName)} autoComplete="family-name" value={speaker.lastName} onChange={(event) => updateSpeaker('lastName', event.target.value)} /></Field></div>
              <Field label="Email" error={errors.email} hint="Used for your private portal and status updates"><input required aria-invalid={Boolean(errors.email)} type="email" autoComplete="email" value={speaker.email} onChange={(event) => updateSpeaker('email', event.target.value)} /></Field>
              <div className="sb-form__row sb-form__row--two"><Field label="Company"><input autoComplete="organization" value={speaker.company} onChange={(event) => updateSpeaker('company', event.target.value)} /></Field><Field label="Job title"><input autoComplete="organization-title" value={speaker.jobTitle} onChange={(event) => updateSpeaker('jobTitle', event.target.value)} /></Field></div>
              <Field label="Short bio" error={errors.bio} hint="Minimum 40 characters"><textarea required aria-invalid={Boolean(errors.bio)} rows={4} value={speaker.bio} onChange={(event) => updateSpeaker('bio', event.target.value)} /></Field>
              <label className="sb-check"><input type="checkbox" checked={includeCoSpeaker} onChange={(event) => setIncludeCoSpeaker(event.target.checked)} /><span><strong>Add a co-speaker</strong><small>They will receive their own portal access and tasks.</small></span><UserPlus aria-hidden="true" /></label>
              {includeCoSpeaker && <fieldset className="sb-co-speaker"><legend>Co-speaker</legend><div className="sb-form__row sb-form__row--two"><Field label="First name" error={errors.coSpeakerName}><input required aria-invalid={Boolean(errors.coSpeakerName)} value={coSpeaker.firstName} onChange={(event) => updateSpeaker('firstName', event.target.value, true)} /></Field><Field label="Last name"><input required value={coSpeaker.lastName} onChange={(event) => updateSpeaker('lastName', event.target.value, true)} /></Field></div><Field label="Email" error={errors.coSpeakerEmail}><input required aria-invalid={Boolean(errors.coSpeakerEmail)} type="email" value={coSpeaker.email} onChange={(event) => updateSpeaker('email', event.target.value, true)} /></Field><div className="sb-form__row sb-form__row--two"><Field label="Company"><input value={coSpeaker.company} onChange={(event) => updateSpeaker('company', event.target.value, true)} /></Field><Field label="Job title"><input value={coSpeaker.jobTitle} onChange={(event) => updateSpeaker('jobTitle', event.target.value, true)} /></Field></div></fieldset>}
            </div>
          </section>

          {Object.keys(errors).length > 0 && <div className="sb-form-error" role="alert">Please correct the highlighted fields before submitting.</div>}
          {serverError && <div className="sb-form-error" role="alert">{serverError}</div>}
          <div className="sb-cfp-submit"><p>By submitting, you agree that the program committee may review and contact you about this proposal.</p><button className="sb-button sb-button--primary sb-button--large" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit proposal'} {!submitting && <ArrowRight aria-hidden="true" />}</button></div>
        </form>
      )}
    </main>
  )
}

interface ClaimAccessFormProps {
  email: string
  status: 'idle' | 'requesting' | 'sent' | 'verifying' | 'failed'
  message: string
  onEmailChange: (email: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

function ClaimAccessForm({ email, status, message, onEmailChange, onSubmit }: ClaimAccessFormProps) {
  return <section className="sb-cfp-access" aria-labelledby="cfp-access-title"><div><KeyRound aria-hidden="true" /><span><strong id="cfp-access-title">Already submitted?</strong><small>Use a one-time email link to view and edit only your proposals. No password is stored.</small></span></div><form onSubmit={onSubmit}><label><span>Email used for your proposal</span><input required type="email" autoComplete="email" value={email} onChange={(event) => onEmailChange(event.target.value)} /></label><button className="sb-button sb-button--primary" disabled={status === 'requesting'}>{status === 'requesting' ? 'Requesting…' : status === 'sent' ? 'Send another link' : 'Email me a secure access link'}</button></form>{message && <p className={status === 'failed' ? 'sb-field__error' : ''} role={status === 'failed' ? 'alert' : 'status'}>{message}</p>}</section>
}

interface FieldProps {
  label: string
  hint?: string
  error?: string
  children: ReactElement<Record<string, unknown>>
}

function Field({ label, hint, error, children }: FieldProps) {
  const messageId = `field-message-${String(children.props.name ?? children.props.id ?? label).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const control = isValidElement(children) && (error || hint)
    ? cloneElement(children, { 'aria-describedby': messageId })
    : children
  return <label className="sb-field"><span>{label}</span>{control}{error ? <small id={messageId} className="sb-field__error">{error}</small> : hint ? <small id={messageId}>{hint}</small> : null}</label>
}

interface CustomQuestionProps {
  question: CfpQuestion
  value: string
  error?: string
  onChange: (value: string) => void
}

function CustomQuestion({ question, value, error, onChange }: CustomQuestionProps) {
  if (question.type === 'checkbox') {
    return <label className="sb-check"><input type="checkbox" required={question.required} aria-invalid={Boolean(error)} checked={value === 'true'} onChange={(event) => onChange(String(event.target.checked))} /><span><strong>{question.label}{question.required ? ' *' : ''}</strong>{error && <small className="sb-field__error">{error}</small>}</span></label>
  }
  return (
    <Field label={`${question.label}${question.required ? ' *' : ''}`} error={error}>
      {question.type === 'textarea'
        ? <textarea required={question.required} aria-invalid={Boolean(error)} rows={4} value={value} onChange={(event) => onChange(event.target.value)} />
        : question.type === 'select'
          ? <select required={question.required} aria-invalid={Boolean(error)} value={value} onChange={(event) => onChange(event.target.value)}><option value="">Select an option</option>{question.options?.map((option) => <option key={option}>{option}</option>)}</select>
          : <input required={question.required} aria-invalid={Boolean(error)} value={value} onChange={(event) => onChange(event.target.value)} />}
    </Field>
  )
}
