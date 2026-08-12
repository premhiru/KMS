# API reference and examples

The canonical behavioral contract is [`db/api-contract.md`](../db/api-contract.md). This guide focuses on common requests.

Replace `https://your-domain.example`, `workspace-demo`, and `event-devflow` with your deployment values. Never place provider keys in client requests.

## Response shape

Success uses `{ "data": ... }`. Errors use a stable envelope with a request ID:

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "The event changed before this update was saved.",
    "details": { "expectedRevision": 42, "actualRevision": 43 },
    "requestId": "req_01J9..."
  }
}
```

## Health

```bash
curl https://your-domain.example/api/health
```

Health verifies Worker, D1, and R2 availability. It does not prove optional provider credentials are configured.

## Anonymous CFP

```bash
curl https://your-domain.example/api/public/cfp/workspace-demo/devflow-2027
```

```bash
curl -X POST \
  https://your-domain.example/api/public/cfp/workspace-demo/devflow-2027 \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Reliable agents in production",
    "abstract": "Patterns for observable, recoverable agent systems.",
    "speakerName": "Maya Chen",
    "speakerEmail": "maya@example.com",
    "track": "AI Engineering",
    "format": "Talk",
    "consent": true,
    "customAnswers": { "experience": "Advanced" }
  }'
```

The server enforces close time, category routing, visible required fields, submission limits, values, and rate limits. It stamps the active CFP version.

Request a proposal access link:

```bash
curl -X POST \
  https://your-domain.example/api/public/cfp/workspace-demo/devflow-2027/claim \
  -H "Content-Type: application/json" \
  -d '{ "email": "maya@example.com", "returnUrl": "/#/portal" }'
```

The response is always `202` for a valid request shape, whether or not the address matches.

## Revisioned event state

```bash
curl -i https://your-domain.example/api/workspaces/workspace-demo/events/event-devflow/state
```

```bash
curl -X PUT \
  https://your-domain.example/api/workspaces/workspace-demo/events/event-devflow/state \
  -H "Content-Type: application/json" \
  -H 'If-Match: "42"' \
  -d '{
    "expectedRevision": 42,
    "event": { "name": "DevFlow 2027", "slug": "devflow-2027", "cfpOpen": true, "cfpConfig": {} },
    "state": { "schemaVersion": 1, "...": "complete AppState" }
  }'
```

On `409 REVISION_CONFLICT`, fetch the latest state, reconcile local intent, and retry against the new revision.

## Reviewer queue

```bash
curl https://your-domain.example/api/workspaces/workspace-demo/events/event-devflow/reviewer-queue
```

```bash
curl -X POST \
  https://your-domain.example/api/workspaces/workspace-demo/events/event-devflow/reviews \
  -H "Content-Type: application/json" \
  -H 'If-Match: "42"' \
  -d '{
    "expectedRevision": 42,
    "assignmentId": "assignment-104",
    "submissionId": "submission-208",
    "scores": { "relevance": 5, "clarity": 4 },
    "answers": { "recommendation": "accept" },
    "note": "Strong practical detail."
  }'
```

## Speaker files

```bash
curl -X POST \
  https://your-domain.example/api/workspaces/workspace-demo/events/event-devflow/assets \
  -H "X-File-Name: speaker-deck.pdf" \
  -H "Content-Type: application/pdf" \
  --data-binary @speaker-deck.pdf
```

The Worker checks size, MIME type, extension, actual signature/content, quotas, identity, and event scope.

## Public program feeds

```bash
curl https://your-domain.example/api/public/events/workspace-demo/devflow-2027/feeds/program.json
curl https://your-domain.example/api/public/events/workspace-demo/devflow-2027/feeds/program.xml
curl https://your-domain.example/api/public/events/workspace-demo/devflow-2027/feeds/program.ics
```

All feeds support exact `track`, `format`, and `room` query parameters, `HEAD`, wildcard CORS, cache headers, ETags, and `304 Not Modified`.

## Email and calendar

```bash
curl -X POST \
  https://your-domain.example/api/workspaces/workspace-demo/events/event-devflow/integrations/email/send \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "acceptance-speaker-42-v1",
    "messages": [{
      "speakerId": "speaker-42",
      "subject": "You are speaking at {{event.name}}",
      "html": "<p>Welcome, {{speaker.firstName}}.</p>",
      "attachment": { "filename": "session.ics", "type": "text/calendar" }
    }]
  }'
```

The server ignores client-authored calendar bytes and creates a recipient-scoped `METHOD:REQUEST` invitation from persisted published sessions.

## CRM and Airtable

```bash
curl https://your-domain.example/api/workspaces/workspace-demo/crm
```

```bash
curl -X POST \
  https://your-domain.example/api/workspaces/workspace-demo/crm/integrations/airtable/sync \
  -H "Content-Type: application/json" \
  -H 'If-Match: "8"' \
  -d '{ "expectedRevision": 8, "idempotencyKey": "airtable-2027-08-12T08:00Z" }'
```

D1 remains authoritative. Airtable never receives internal notes, activity, pipeline rationale, campaign previews, audit records, or tokens.

For every route and body, see the [complete Worker contract](../db/api-contract.md).
