import type { MessageTemplate, Speaker, SpeakerInput, Submission, SubmissionInput } from '../domain/types'
import { createId, nowIso } from './ids'

export function createSpeaker(input: SpeakerInput, at = nowIso()): Speaker {
  return {
    id: createId('speaker'),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: input.email.trim().toLowerCase(),
    company: input.company?.trim() ?? '',
    jobTitle: input.jobTitle?.trim() ?? '',
    bio: input.bio?.trim() ?? '',
    pronouns: input.pronouns?.trim() || undefined,
    photoUrl: input.photoUrl?.trim() || undefined,
    status: input.status ?? 'invited',
    availability: input.availability ?? [],
    createdAt: at,
    updatedAt: at,
  }
}

export function createSubmission(input: SubmissionInput, at = nowIso()): Submission {
  return {
    id: createId('submission'),
    title: input.title.trim(),
    abstract: input.abstract.trim(),
    track: input.track,
    format: input.format,
    durationMinutes: input.durationMinutes,
    speakerIds: [...new Set(input.speakerIds)],
    status: input.status ?? 'needs-review',
    tags: input.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [],
    createdAt: at,
    updatedAt: at,
  }
}

export function createMessageTemplate(input: Omit<MessageTemplate, 'id' | 'updatedAt'>, at = nowIso()): MessageTemplate {
  return { ...input, id: createId('template'), updatedAt: at }
}
