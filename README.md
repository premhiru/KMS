# OpenSpeaker

An open-source, demo-ready speaker and conference program workspace. OpenSpeaker brings call-for-speakers review, speaker onboarding, scheduling, communications, and a public event experience into one fast interface.

![OpenSpeaker](https://img.shields.io/badge/license-MIT-6b5bd6) ![React](https://img.shields.io/badge/React-19-61dafb) ![TypeScript](https://img.shields.io/badge/TypeScript-6-blue)

## What is included

- **Hosted CFP and form builder** with validation, conditional questions, category routing, co-speakers, limits, and confirmation references.
- **Submission and committee workspaces** with search, editing, multi-round rubrics, reviewer notes, aggregate scores, and decisions.
- **Speaker CRM and participant portal** with invitation responses, editable profiles, onboarding tasks, asset metadata, reminders, resources, and safe HTML previews.
- **Agenda builder** with drag/drop and accessible assignment, automatic scheduling, room/speaker/availability conflicts, list/day/track/room views, publishing, and ICS.
- **Communications center** with template CRUD, audience segmentation, personalization, unresolved-token checks, and a durable in-app outbox.
- **Public event experience** with a responsive speaker gallery, published agenda, filters, personal itinerary, and copyable iframe embed.
- **Portable data** through versioned JSON import/export, submissions CSV, calendar ICS, and one-way Accelevents-ready CSV.

The current version is a functional browser-local MVP designed for hackathon evaluation. Data is persisted in versioned `localStorage`, survives reloads, and flows between the public, speaker, reviewer, and organizer experiences. Seeded data makes every workspace immediately testable.

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Use the left navigation to move between the organizer and speaker experiences. The **Public event page** link previews the attendee-facing gallery.

Useful direct routes:

- `http://localhost:5173/#/cfp` — anonymous proposal form
- `http://localhost:5173/#/reviews` — committee workspace
- `http://localhost:5173/#/portal` — participant portal simulator
- `http://localhost:5173/#/event` — published speaker gallery and agenda

## Verification

```bash
npm test
npm run lint
npm run build
```

The automated suite covers decisions and onboarding task creation, schedule conflicts, persistence validation, and template rendering.

## Integration boundaries

- Selected headshots and slide decks persist as file metadata; a static browser app cannot retain file bytes without object storage.
- Messages are personalized and saved to a durable in-app outbox. External Gmail/Outlook delivery requires provider credentials and a server-side transport.
- Calendar delivery is provided through standards-compatible ICS downloads.
- Accelevents is available as a documented one-way CSV export. Direct API sync requires an authenticated Accelevents account.
- Role selection is simulated for evaluation; production authentication, authorization, multi-tenancy, and server-side audit logging require a backend.

## Production build

```bash
npm run build
npm run preview
```

The generated `dist/` directory can be deployed to Cloudflare Pages, Netlify, Vercel, or any static host.

## Product principles

1. Speakers should always know their next action.
2. Organizers should never maintain a parallel spreadsheet.
3. AI may assist a reviewer, but never silently replace human judgment.
4. Public schedules and profiles should be fast and mobile-first.
5. Event data should remain portable and integration-friendly.

## License

MIT © OpenSpeaker contributors
