export interface DocsSectionMeta {
  id: string
  label: string
  group: 'Start' | 'Build' | 'Operate'
  summary: string
  keywords: string[]
}

export const docsSections: DocsSectionMeta[] = [
  { id: 'quickstart', label: 'Quickstart', group: 'Start', summary: 'Run OpenSpeaker locally in under five minutes.', keywords: ['install', 'npm', 'local', 'development'] },
  { id: 'how-it-works', label: 'How it works', group: 'Start', summary: 'Understand the event lifecycle and production architecture.', keywords: ['architecture', 'workflow', 'D1', 'R2', 'Worker'] },
  { id: 'authentication', label: 'Authentication & roles', group: 'Start', summary: 'Hosting identity, roles, and proposal access links.', keywords: ['auth', 'owner', 'organizer', 'reviewer', 'speaker', 'claim'] },
  { id: 'events-state', label: 'Events & state', group: 'Build', summary: 'Create events and safely update revisioned state.', keywords: ['ETag', 'revision', 'optimistic concurrency', 'rollback'] },
  { id: 'cfp', label: 'Call for proposals', group: 'Build', summary: 'Configure, publish, submit, and claim proposals.', keywords: ['CFP', 'submission', 'conditional fields', 'routing'] },
  { id: 'reviews', label: 'Reviews', group: 'Build', summary: 'Run blind, multi-round evaluation workflows.', keywords: ['rubric', 'assignment', 'score', 'round'] },
  { id: 'speaker-portal', label: 'Speaker portal & files', group: 'Build', summary: 'Manage profiles, tasks, sessions, and private assets.', keywords: ['portal', 'upload', 'headshot', 'slides', 'R2'] },
  { id: 'agenda-public', label: 'Agenda, embeds & feeds', group: 'Build', summary: 'Publish the program as UI, iframe, JSON, XML, and iCalendar.', keywords: ['schedule', 'feed', 'JSON', 'XML', 'ICS', 'embed'] },
  { id: 'communications', label: 'Email & calendar', group: 'Build', summary: 'Send personalized Resend messages and calendar invitations.', keywords: ['Resend', 'email', 'ICS', 'reminder', 'cron'] },
  { id: 'crm-airtable', label: 'CRM & Airtable', group: 'Build', summary: 'Use the cross-event directory and optional Airtable mirror.', keywords: ['CRM', 'contact', 'Airtable', 'sync'] },
  { id: 'deployment', label: 'Production setup', group: 'Operate', summary: 'Configure bindings, secrets, providers, and deployment.', keywords: ['deploy', 'environment', 'secret', 'Cloudflare', 'Sites'] },
  { id: 'errors', label: 'Errors & troubleshooting', group: 'Operate', summary: 'Handle errors, retries, idempotency, and common setup issues.', keywords: ['error', '409', '503', 'debug', 'request ID'] },
]

export const examples = {
  healthCurl: `curl https://your-domain.example/api/health`,
  healthJs: `const response = await fetch('/api/health')
const { data } = await response.json()

console.log(data.database) // "ok"`,
  cfpCurl: `curl -X POST \\
  https://your-domain.example/api/public/cfp/workspace-demo/devflow-2027 \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Reliable agents in production",
    "abstract": "Patterns for observable, recoverable agent systems.",
    "speakerName": "Maya Chen",
    "speakerEmail": "maya@example.com",
    "track": "AI Engineering",
    "format": "Talk",
    "consent": true,
    "customAnswers": { "experience": "Advanced" }
  }'`,
  cfpJs: `const response = await fetch(
  '/api/public/cfp/workspace-demo/devflow-2027',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Reliable agents in production',
      abstract: 'Patterns for observable, recoverable agent systems.',
      speakerName: 'Maya Chen',
      speakerEmail: 'maya@example.com',
      track: 'AI Engineering',
      format: 'Talk',
      consent: true,
      customAnswers: { experience: 'Advanced' }
    })
  }
)

const { data } = await response.json()`,
  stateCurl: `curl https://your-domain.example/api/workspaces/workspace-demo/events/event-devflow/state \\
  -H "Accept: application/json" \\
  --cookie openspeaker_session=…`,
  updateStateCurl: `curl -X PUT \\
  https://your-domain.example/api/workspaces/workspace-demo/events/event-devflow/state \\
  -H "Content-Type: application/json" \\
  -H 'If-Match: "42"' \\
  -d '{
    "expectedRevision": 42,
    "event": {
      "name": "DevFlow 2027",
      "slug": "devflow-2027",
      "cfpOpen": true,
      "cfpConfig": {}
    },
    "state": { "schemaVersion": 1, "…": "complete AppState" }
  }'`,
  reviewCurl: `curl -X POST \\
  https://your-domain.example/api/workspaces/workspace-demo/events/event-devflow/reviews \\
  -H "Content-Type: application/json" \\
  -H 'If-Match: "42"' \\
  -d '{
    "expectedRevision": 42,
    "assignmentId": "assignment-104",
    "submissionId": "submission-208",
    "scores": { "relevance": 5, "clarity": 4 },
    "answers": { "recommendation": "accept" },
    "note": "Strong practical detail."
  }'`,
  portalPatch: `curl -X PATCH \\
  https://your-domain.example/api/workspaces/workspace-demo/events/event-devflow/speaker-portal \\
  -H "Content-Type: application/json" \\
  -H 'If-Match: "42"' \\
  -d '{
    "expectedRevision": 42,
    "profile": { "bio": "Staff engineer and conference speaker." },
    "taskUpdates": [{ "id": "task-headshot", "completed": true }]
  }'`,
  emailCurl: `curl -X POST \\
  https://your-domain.example/api/workspaces/workspace-demo/events/event-devflow/integrations/email/send \\
  -H "Content-Type: application/json" \\
  -d '{
    "idempotencyKey": "acceptance-speaker-42-v1",
    "replyTo": "program@example.com",
    "messages": [{
      "speakerId": "speaker-42",
      "subject": "You are speaking at {{event.name}}",
      "html": "<p>Welcome, {{speaker.firstName}}.</p>",
      "attachment": {
        "filename": "devflow-session.ics",
        "type": "text/calendar"
      }
    }]
  }'`,
  airtableCurl: `curl -X POST \\
  https://your-domain.example/api/workspaces/workspace-demo/crm/integrations/airtable/sync \\
  -H "Content-Type: application/json" \\
  -H 'If-Match: "8"' \\
  -d '{
    "expectedRevision": 8,
    "idempotencyKey": "airtable-2027-08-12T08:00Z"
  }'`,
  errorJson: `{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "The event changed before this update was saved.",
    "details": { "expectedRevision": 42, "actualRevision": 43 },
    "requestId": "req_01J9…"
  }
}`,
}
