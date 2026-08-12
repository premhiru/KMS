# OpenSpeaker

OpenSpeaker is an open-source conference program operations SaaS: collect proposals, run committee reviews, onboard speakers, build the agenda, communicate, and publish the attendee experience.

**[Read the live documentation](https://openspeaker-kms.premhiru.chatgpt.site/#/docs)** · [Quickstart](docs/quickstart.md) · [API reference](docs/api-reference.md) · [Production deployment](docs/deployment.md)

![OpenSpeaker](https://img.shields.io/badge/license-MIT-6b5bd6) ![React](https://img.shields.io/badge/React-19-61dafb) ![TypeScript](https://img.shields.io/badge/TypeScript-6-blue)

## Product capabilities

- Hosted CFP builder with deadlines, validation, conditional questions, category routing, co-speakers, per-email limits, abuse throttling, and server-side persistence.
- Normalized multi-round evaluation plans with weighted rubrics, blind review, identity-scoped assignments, abstention, advancement, and decisions.
- Speaker CRM and authenticated self-service portal for invitation responses, profile edits, onboarding tasks, private headshot/slide uploads, downloads, and resource/wiki pages.
- Multi-day drag-and-drop agenda with automatic scheduling, room/speaker/track/availability conflicts, list/day/week/track/room views, publish gates, and iCalendar export.
- Personalized email delivery through Resend with `.ics` attachments, provider idempotency, and durable delivery logs.
- Native one-way Accelevents program sync with a published/accepted/confirmed read model, idempotency, and run/error history.
- Responsive public speaker gallery and schedule, personal itinerary, and copyable iframe embed.
- Workspace roles, server-enforced tenant authorization, optimistic concurrency, audit history, and JSON/CSV/ICS portability.

## Architecture

The deployed build uses the Sites runtime with:

- D1 for workspace membership, revisioned event state, public submissions, asset metadata, rate limits, audit entries, integration runs, and delivery logs.
- R2 for private event-scoped file bytes.
- Trusted hosting identity headers for owner, organizer, reviewer, and speaker access.
- A Worker API documented in [`db/api-contract.md`](db/api-contract.md).

Local development intentionally uses versioned `localStorage` as an offline preview. Production builds use the shared Worker API and do not treat browser storage as the source of truth.

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

- `http://localhost:5173/#/cfp` — public proposal form
- `http://localhost:5173/#/reviews` — committee workspace
- `http://localhost:5173/#/portal` — participant portal preview
- `http://localhost:5173/#/event` — public gallery and agenda

## Verification

```bash
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
npm audit --omit=dev
```

The suite covers domain invariants, evaluation rounds, API transport, D1/R2 lifecycle contracts, tenant/RBAC boundaries, CFP enforcement, blind review isolation, optimistic concurrency, provider idempotency, and Resend calendar payloads. Playwright release tests exercise organizer, anonymous CFP, reviewer, speaker, and public-attendee workflows against a deterministic remote API stub, including accessibility, mobile layout, hydration failure, and revision-rebase scenarios.

## Documentation

The repository includes task-oriented guides alongside the exact Worker contract:

- [`docs/quickstart.md`](docs/quickstart.md) — install, local modes, routes, and first workflow
- [`docs/architecture.md`](docs/architecture.md) — components, trust boundaries, roles, and data flow
- [`docs/api-reference.md`](docs/api-reference.md) — authenticated and public API examples
- [`docs/deployment.md`](docs/deployment.md) — D1/R2 bindings, hosted secrets, provider setup, and release checks
- [`db/api-contract.md`](db/api-contract.md) — canonical route and behavior contract
- [`db/operations.md`](db/operations.md) — backup, restore, retention, and monitoring

## Production configuration

Required bindings are declared in `.openai/hosting.json`:

- `DB` — D1 database
- `FILES` — R2 bucket

Optional runtime configuration:

- `RESEND_API_KEY` and `EMAIL_FROM` — external email/calendar delivery
- `ACCELEVENTS_API_KEY` and `ACCELEVENTS_EVENT_URL` — native one-way program sync
- `CRON_SECRET` — authenticated maintenance/reminder fallback trigger
- `ALLOWED_ORIGINS` — additional trusted cross-origin clients
- `CFP_RATE_LIMIT`, `CFP_RATE_WINDOW_SECONDS`, `MAX_ASSET_BYTES`, and `ALLOWED_ASSET_TYPES` — operational limits

The UI reports provider configuration honestly. Without provider credentials, local outbox, ICS, CSV, and all core program workflows remain available, while external email or Accelevents actions stay disabled.

## Product principles

1. Speakers should always know their next action.
2. Organizers should never maintain a parallel spreadsheet.
3. AI may assist a reviewer, but never silently replace human judgment.
4. Public schedules and profiles should be fast and mobile-first.
5. Event data should remain portable and integration-friendly.

## License

MIT © OpenSpeaker contributors
