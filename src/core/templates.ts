import type { EventConfig, MessageTemplate, OnboardingTask, Speaker, Submission } from '../domain/types'

export interface TemplateContext {
  event?: EventConfig
  speaker?: Speaker
  submission?: Submission
  task?: OnboardingTask
}

export interface RenderedTemplate {
  subject: string
  body: string
  unresolvedTokens: string[]
}

function lookup(context: TemplateContext, path: string): string | undefined {
  const parts = path.split('.')
  let value: unknown = context
  for (const part of parts) {
    if (typeof value !== 'object' || value === null || !(part in value)) return undefined
    value = (value as Record<string, unknown>)[part]
  }
  if (value === undefined || value === null) return undefined
  return Array.isArray(value) ? value.join(', ') : String(value)
}

export function interpolateTemplate(text: string, context: TemplateContext): { text: string; unresolvedTokens: string[] } {
  const unresolved = new Set<string>()
  const rendered = text.replace(/{{\s*([a-zA-Z][\w.-]*)\s*}}/g, (token, path: string) => {
    const value = lookup(context, path)
    if (value === undefined) {
      unresolved.add(path)
      return token
    }
    return value
  })
  return { text: rendered, unresolvedTokens: [...unresolved] }
}

export function renderTemplate(template: Pick<MessageTemplate, 'subject' | 'body'>, context: TemplateContext): RenderedTemplate {
  const subject = interpolateTemplate(template.subject, context)
  const body = interpolateTemplate(template.body, context)
  return {
    subject: subject.text,
    body: body.text,
    unresolvedTokens: [...new Set([...subject.unresolvedTokens, ...body.unresolvedTokens])],
  }
}

export function listTemplateTokens(text: string): string[] {
  return [...new Set([...text.matchAll(/{{\s*([a-zA-Z][\w.-]*)\s*}}/g)].map((match) => match[1]))]
}
