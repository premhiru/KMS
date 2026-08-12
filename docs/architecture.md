# Architecture

OpenSpeaker is a React and TypeScript single-page application backed by a Cloudflare-compatible Worker. The same typed event model drives organizer, reviewer, speaker, and public experiences.

## System shape

```text
Browser
  ├─ Organizer workspace ─┐
  ├─ Reviewer workspace  ├── Worker authorization + validation
  ├─ Speaker portal      ┤        ├─ D1: state, history, audit, CRM, jobs
  └─ Public CFP/program ─┘        ├─ R2: private event files
                                  └─ Providers: Resend, Airtable, Accelevents
```

## Data flow

1. Organizers publish a server-validated CFP configuration.
2. Anonymous submissions are stored separately, rate limited, and normalized into event state once.
3. Reviewers receive only email-matched assignments; blind rounds remove identity fields at the Worker boundary.
4. An acceptance creates onboarding tasks and makes the proposal eligible for scheduling.
5. Speaker changes are limited to the verified speaker's projected profile, tasks, files, sessions, resources, and proposals.
6. Publishing creates a privacy-safe read model of accepted submissions, confirmed speakers, and published sessions.
7. Public React views, iframe embeds, JSON, XML, and iCalendar feeds consume that same read model.

## Persistence

### Event state

The organizer model is stored as a validated `AppState` document with a monotonically increasing revision. Clients send `expectedRevision` and `If-Match`; stale writes receive `409 REVISION_CONFLICT`.

Every successful event write creates a full history snapshot. Rollback restores an earlier snapshot as a new revision, preserving the audit trail.

### Normalized operational records

D1 also stores workspace members, public submissions, assets, delivery rows, provider runs, rate limits, reminder schedules, one-time proposal claims, the cross-event CRM, and audit entries.

### Files

R2 stores private bytes. D1 stores event ownership, uploader metadata, task references, approval state, and immutable deliverable versions. Anonymous access is limited to the exact approved headshot used by a confirmed speaker in the published program.

## Authentication and authorization

Production identity comes from trusted hosting headers. Application clients must not manufacture those headers.

| Role | Scope |
|---|---|
| Owner | Workspace bootstrap, access management, audit, organizer capabilities |
| Organizer | Event configuration, submissions, speakers, reviews, agenda, communications, CRM |
| Reviewer | Assigned submissions and open evaluation rounds only |
| Speaker | Their own profile, proposals, tasks, files, sessions, and approved resources |
| Public | Anonymous CFP and published program projections |

Anonymous CFP submitters can request an enumeration-safe, one-time email link. Redemption creates an HttpOnly cookie scoped to one event's speaker portal path. It is not workspace membership and cannot access organizer, reviewer, CRM, audit, or integration routes.

## External integrations

- **Resend:** transactional messages, proposal confirmations, secure proposal links, automated reminders, and server-generated calendar invitations.
- **Accelevents:** native one-way create/update sync of accepted, confirmed, published program data.
- **Airtable:** optional one-way mirror of safe CRM contact fields. D1 remains authoritative.

Provider calls use durable run rows, idempotency keys, renewable leases, timeouts, and replayable receipts. Provider secrets remain server-side.
