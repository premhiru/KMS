# OpenSpeaker

An open-source, demo-ready speaker and conference program workspace. OpenSpeaker brings call-for-speakers review, speaker onboarding, scheduling, communications, and a public event experience into one fast interface.

![OpenSpeaker](https://img.shields.io/badge/license-MIT-6b5bd6) ![React](https://img.shields.io/badge/React-19-61dafb) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

## What is included

- **Organizer dashboard** with submissions, onboarding completion, missing assets, tasks, and deadlines.
- **Submission workspace** with search, workflow tabs, categories, review scores, and statuses.
- **Speaker CRM** with onboarding progress and bulk reminders.
- **Visual agenda builder** with an unscheduled queue, room lanes, view controls, and publishing flow.
- **Automated communications** for acceptance, onboarding, calendar invitations, and slide reminders.
- **Self-service speaker portal** for agreements, session details, headshots, slides, and resources.
- **Public event experience** with a responsive speaker gallery and agenda entry point.

The current version is an interactive front-end prototype designed for hackathon evaluation. Buttons, filters, navigation, responsive views, confirmations, and core demo flows work without accounts or configuration.

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Use the left navigation to move between the organizer and speaker experiences. The **Public event page** link previews the attendee-facing gallery.

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

## Roadmap

- Persistent storage adapters for Cloudflare D1 and Airtable
- Conditional form-builder and hosted CFP route
- Rubric editor and multi-round reviewer assignments
- Live room/speaker/track conflict detection
- Accelevents one-way synchronization
- Downloadable RFC 5545 calendar invitations and embed snippets
- REST API, authentication, and organization workspaces

## License

MIT © OpenSpeaker contributors
