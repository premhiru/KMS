import { APP_SCHEMA_VERSION, type AppState, type OnboardingTask, type Speaker } from './types'

const SEEDED_AT = '2026-08-11T00:00:00.000Z'
const EVENT_START = '2026-09-16T16:00:00.000Z'
const EVENT_END = '2026-09-18T01:00:00.000Z'

const speakers: Speaker[] = [
  ['maya', 'Maya', 'Chen', 'maya@example.com', 'Signal Labs', 'Founder & CEO', 'Maya builds dependable agent systems and open evaluation tooling.', 'confirmed'],
  ['owen', 'Owen', 'Wallace', 'owen@example.com', 'Northstar AI', 'Research Lead', 'Owen leads production evaluation for large language model systems.', 'confirmed'],
  ['priya', 'Priya', 'Rao', 'priya@example.com', 'Edgeworks', 'Principal Engineer', 'Priya deploys efficient AI systems on resource-constrained devices.', 'invited'],
  ['jon', 'Jon', 'Bell', 'jon@example.com', 'Open Compute', 'Maintainer', 'Jon maintains inference infrastructure used by teams around the world.', 'confirmed'],
  ['amelia', 'Amelia', 'Hart', 'amelia@example.com', 'Fieldwork', 'VP Product', 'Amelia designs human-centered AI products and research practices.', 'confirmed'],
  ['leo', 'Leo', 'Martins', 'leo@example.com', 'Toolsmith', 'Developer Advocate', 'Leo helps developers ship reliable tools and workflows.', 'invited'],
].map(([id, firstName, lastName, email, company, jobTitle, bio, status]) => ({
  id: `speaker-${id}`,
  firstName,
  lastName,
  email,
  company,
  jobTitle,
  bio,
  status: status as Speaker['status'],
  availability: [{ startAt: EVENT_START, endAt: EVENT_END }],
  createdAt: SEEDED_AT,
  updatedAt: SEEDED_AT,
}))

const tasks: OnboardingTask[] = speakers.flatMap((speaker, speakerIndex) => {
  const definitions: Array<[OnboardingTask['kind'], string, string]> = [
    ['agreement', 'Sign speaker agreement', '2026-08-20T23:59:00.000Z'],
    ['profile', 'Complete bio and profile', '2026-08-25T23:59:00.000Z'],
    ['headshot', 'Upload headshot', '2026-08-25T23:59:00.000Z'],
    ['session-details', 'Confirm session details', '2026-09-01T23:59:00.000Z'],
    ['slides', 'Upload presentation slides', '2026-09-10T23:59:00.000Z'],
    ['supporting-document', 'Upload supporting document', '2026-09-10T23:59:00.000Z'],
  ]
  return definitions.map(([kind, title, dueAt], taskIndex) => ({
    id: `task-${speaker.id}-${kind}`,
    speakerId: speaker.id,
    kind,
    title,
    dueAt,
    completedAt: taskIndex < Math.max(1, 5 - speakerIndex) ? '2026-08-10T12:00:00.000Z' : undefined,
    updatedAt: SEEDED_AT,
  }))
})

export function createSeedState(): AppState {
  return {
    schemaVersion: APP_SCHEMA_VERSION,
    lastUpdatedAt: SEEDED_AT,
    event: {
      id: 'event-ai-engineer-2026',
      name: 'AI Engineer Summit',
      slug: 'ai-engineer-summit-2026',
      venue: 'San Francisco, CA',
      timezone: 'America/Los_Angeles',
      startAt: EVENT_START,
      endAt: EVENT_END,
      rooms: ['Main stage', 'Studio A', 'Studio B'],
      tracks: ['Agents & orchestration', 'Evaluation', 'Applied AI', 'Infrastructure', 'Product & design', 'Developer tools'],
      agendaPublishedAt: '2026-08-10T16:00:00.000Z',
      description: 'Two days of practical insights from the engineers, researchers, and product leaders shaping the future of AI.',
      cfp: {
        open: true,
        closeAt: '2026-08-31T23:59:00.000Z',
        submissionLimit: 3,
        allowMultiple: true,
        welcomeMessage: 'Share the practical lessons, tools, and hard-won insights our AI engineering community can use.',
        thankYouMessage: 'Thanks for submitting. You can track your proposal and complete speaker details in the portal.',
        version: 1,
        publishedAt: SEEDED_AT,
        formats: [{ name: 'Talk', durationMinutes: 30 }, { name: 'Workshop', durationMinutes: 60 }, { name: 'Panel', durationMinutes: 45 }, { name: 'Lightning talk', durationMinutes: 10 }],
        routingRules: [
          { id: 'route-case-study', category: 'case-study', label: 'Practical case study', track: 'Applied AI', enabled: true },
          { id: 'route-open-source', category: 'open-source', label: 'Open-source project', track: 'Developer tools', enabled: true },
          { id: 'route-research', category: 'research', label: 'Research & evaluation', track: 'Evaluation', enabled: true },
          { id: 'route-leadership', category: 'leadership', label: 'Leadership & strategy', track: 'Product & design', enabled: true },
        ],
        questions: [
          { id: 'question-outcomes', label: 'What will attendees learn?', type: 'textarea', required: true },
          { id: 'question-workshop', label: 'What should attendees install before this workshop?', type: 'textarea', required: true, showWhen: { field: 'format', equals: 'Workshop' } },
          { id: 'question-level', label: 'Audience experience level', type: 'select', required: true, options: ['Beginner', 'Intermediate', 'Advanced'] },
        ],
      },
      resources: [
        { id: 'resource-handbook', title: 'Speaker handbook', body: 'Deadlines, production guidance, venue access, and day-of-event contacts.', version: 1, approvalStatus: 'approved', updatedAt: SEEDED_AT, files: [] },
        { id: 'resource-av', title: 'AV and slide guidelines', body: 'Use 16:9 slides, embed fonts, and bring a local backup.', version: 1, approvalStatus: 'approved', updatedAt: SEEDED_AT, files: [] },
        { id: 'resource-venue', title: 'Venue and travel', body: 'Moscone West, San Francisco. Speaker check-in opens at 7:30 AM.', version: 1, approvalStatus: 'approved', updatedAt: SEEDED_AT, files: [] },
      ],
      reminderSchedules: [{ id: 'reminder-onboarding', name: 'Upcoming onboarding deadlines', templateId: 'template-onboarding', audience: 'incomplete-onboarding', enabled: false, cadence: 'daily', daysBeforeDue: 3, timezone: 'America/Los_Angeles', createdAt: SEEDED_AT, updatedAt: SEEDED_AT }],
      publicProgram: { defaultView: 'day', enabledViews: ['list', 'day', 'week', 'track', 'room'], showSpeakers: true, showItinerary: true, showCalendarDownloads: true, embedHeight: 720 },
      accelevents: { sessionTitle: 'title', description: 'abstract', track: 'track', type: 'format', location: 'room', speakers: 'speakers', includeOnlyConfirmedSpeakers: true, includeOnlyPublishedSessions: true, destinationFields: { title: 'Session Name', description: 'Description', track: 'Track', type: 'Type', location: 'Location', speakers: 'Speakers' }, lastStatus: 'idle' },
    },
    speakers: structuredClone(speakers),
    submissions: [
      { id: 'submission-agents', title: 'Beyond the chatbot: building reliable AI agents', abstract: 'Patterns for planning, tools, memory, and graceful recovery in production agent systems.', track: 'Agents & orchestration', format: 'Talk', durationMinutes: 30, speakerIds: ['speaker-maya'], status: 'accepted', tags: ['agents', 'reliability'], origin: 'cfp', cfpVersion: 1, createdAt: '2026-07-01T09:00:00.000Z', updatedAt: SEEDED_AT },
      { id: 'submission-evals', title: 'Evaluating LLM systems in production', abstract: 'A practical evaluation stack spanning offline test sets, traces, and human review.', track: 'Evaluation', format: 'Talk', durationMinutes: 30, speakerIds: ['speaker-owen'], status: 'accepted', tags: ['evaluation'], createdAt: '2026-07-02T09:00:00.000Z', updatedAt: SEEDED_AT },
      { id: 'submission-edge', title: 'Small models, big impact: edge AI in practice', abstract: 'Case studies and constraints for useful models running close to users.', track: 'Applied AI', format: 'Talk', durationMinutes: 20, speakerIds: ['speaker-priya'], status: 'in-review', tags: ['edge'], createdAt: '2026-07-03T09:00:00.000Z', updatedAt: SEEDED_AT },
      { id: 'submission-inference', title: 'The open-source inference stack', abstract: 'A guided tour of modern inference servers, kernels, and observability.', track: 'Infrastructure', format: 'Panel', durationMinutes: 45, speakerIds: ['speaker-jon'], status: 'waitlisted', tags: ['open-source', 'inference'], createdAt: '2026-07-04T09:00:00.000Z', updatedAt: SEEDED_AT },
      { id: 'submission-design', title: 'Designing human-centered AI products', abstract: 'Hands-on methods for learning where AI helps and where it should step aside.', track: 'Product & design', format: 'Workshop', durationMinutes: 60, speakerIds: ['speaker-amelia'], status: 'accepted', tags: ['design', 'product'], createdAt: '2026-07-05T09:00:00.000Z', updatedAt: SEEDED_AT },
      { id: 'submission-tools', title: 'Developer experience for probabilistic software', abstract: 'Tooling patterns that make nondeterministic systems understandable.', track: 'Developer tools', format: 'Talk', durationMinutes: 30, speakerIds: ['speaker-leo'], status: 'needs-review', tags: ['developer-tools'], createdAt: '2026-07-06T09:00:00.000Z', updatedAt: SEEDED_AT },
    ],
    evaluationPlans: [
      { id: 'evaluation-plan-program', name: 'Program committee review', instructions: 'Prioritize practical, original sessions with clear takeaways for AI engineers.', createdAt: SEEDED_AT, updatedAt: SEEDED_AT },
    ],
    evaluationRounds: [
      {
        id: 'evaluation-round-committee', planId: 'evaluation-plan-program', name: 'Committee review', position: 1, status: 'open', opensAt: '2026-08-11T00:00:00.000Z', dueAt: '2026-08-24T23:59:00.000Z', blind: false,
        instructions: 'Review the complete proposal and leave evidence for your score.',
        rubric: [
          { id: 'relevance', label: 'Relevance', description: 'Fit for the event audience and track.', weight: 35, maxScore: 5 },
          { id: 'originality', label: 'Originality', description: 'Fresh evidence or practical insight.', weight: 25, maxScore: 5 },
          { id: 'clarity', label: 'Clarity', description: 'Focused premise and takeaways.', weight: 20, maxScore: 5 },
          { id: 'speaker-fit', label: 'Speaker fit', description: 'Experience to deliver this session.', weight: 20, maxScore: 5 },
        ],
        filter: { submissionStatuses: ['needs-review', 'in-review', 'accepted'] }, createdAt: SEEDED_AT, updatedAt: SEEDED_AT,
      },
      {
        id: 'evaluation-round-final', planId: 'evaluation-plan-program', name: 'Final programming review', position: 2, status: 'draft', dueAt: '2026-09-01T23:59:00.000Z', blind: true,
        instructions: 'Review finalists without speaker identity and focus on program balance.',
        rubric: [
          { id: 'program-fit', label: 'Program fit', weight: 60, maxScore: 5 },
          { id: 'distinctiveness', label: 'Distinctiveness', weight: 40, maxScore: 5 },
        ],
        createdAt: SEEDED_AT, updatedAt: SEEDED_AT,
      },
    ],
    evaluationAssignments: [
      { id: 'assignment-agents-sarah', roundId: 'evaluation-round-committee', submissionId: 'submission-agents', reviewerName: 'Sarah Lin', reviewerEmail: 'sarah@example.com', status: 'completed', assignedAt: SEEDED_AT, completedAt: SEEDED_AT, updatedAt: SEEDED_AT },
      { id: 'assignment-evals-sarah', roundId: 'evaluation-round-committee', submissionId: 'submission-evals', reviewerName: 'Sarah Lin', reviewerEmail: 'sarah@example.com', status: 'completed', assignedAt: SEEDED_AT, completedAt: SEEDED_AT, updatedAt: SEEDED_AT },
      { id: 'assignment-edge-nora', roundId: 'evaluation-round-committee', submissionId: 'submission-edge', reviewerName: 'Nora James', reviewerEmail: 'nora@example.com', status: 'completed', assignedAt: SEEDED_AT, completedAt: SEEDED_AT, updatedAt: SEEDED_AT },
      { id: 'assignment-tools-sarah', roundId: 'evaluation-round-committee', submissionId: 'submission-tools', reviewerName: 'Sarah Lin', reviewerEmail: 'sarah@example.com', status: 'assigned', assignedAt: SEEDED_AT, updatedAt: SEEDED_AT },
    ],
    evaluationAdvancements: [],
    reviews: [
      { id: 'review-agents-1', submissionId: 'submission-agents', roundId: 'evaluation-round-committee', assignmentId: 'assignment-agents-sarah', reviewerName: 'Sarah Lin', scores: { relevance: 5, originality: 5, clarity: 5, 'speaker-fit': 4 }, note: 'Strong practical story and clear takeaways.', updatedAt: SEEDED_AT },
      { id: 'review-evals-1', submissionId: 'submission-evals', roundId: 'evaluation-round-committee', assignmentId: 'assignment-evals-sarah', reviewerName: 'Sarah Lin', scores: { relevance: 5, originality: 4, clarity: 5, 'speaker-fit': 5 }, note: 'Excellent fit for the audience.', updatedAt: SEEDED_AT },
      { id: 'review-edge-1', submissionId: 'submission-edge', roundId: 'evaluation-round-committee', assignmentId: 'assignment-edge-nora', reviewerName: 'Nora James', scores: { relevance: 4, originality: 5, clarity: 4, 'speaker-fit': 4 }, note: 'Needs a little more detail on the live demo.', updatedAt: SEEDED_AT },
    ],
    tasks: structuredClone(tasks),
    sessions: [
      { id: 'session-agents', submissionId: 'submission-agents', room: 'Main stage', startAt: '2026-09-16T17:00:00.000Z', endAt: '2026-09-16T17:30:00.000Z', published: true, updatedAt: SEEDED_AT },
      { id: 'session-evals', submissionId: 'submission-evals', room: 'Studio A', startAt: '2026-09-16T17:00:00.000Z', endAt: '2026-09-16T17:30:00.000Z', published: true, updatedAt: SEEDED_AT },
      { id: 'session-design', submissionId: 'submission-design', room: 'Studio A', startAt: '2026-09-16T18:00:00.000Z', endAt: '2026-09-16T19:00:00.000Z', published: true, updatedAt: SEEDED_AT },
    ],
    templates: [
      { id: 'template-acceptance', name: 'Acceptance email', subject: 'You are speaking at {{event.name}}!', body: 'Hi {{speaker.firstName}},\n\nWe are delighted to accept “{{submission.title}}”. Please visit your speaker portal to complete onboarding.', audience: 'accepted', enabled: true, updatedAt: SEEDED_AT },
      { id: 'template-onboarding', name: 'Onboarding reminder', subject: 'Reminder: {{task.title}}', body: 'Hi {{speaker.firstName}},\n\nPlease complete {{task.title}} before {{task.dueAt}}.', audience: 'incomplete-onboarding', enabled: true, updatedAt: SEEDED_AT },
      { id: 'template-slides', name: 'Slides due', subject: 'Slides for {{event.name}} are due soon', body: 'Hi {{speaker.firstName}},\n\nPlease upload your slides so our production team can prepare.', audience: 'overdue-tasks', enabled: false, updatedAt: SEEDED_AT },
    ],
    communicationLog: [],
  }
}

export const seedState = createSeedState()
