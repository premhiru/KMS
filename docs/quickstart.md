# OpenSpeaker quickstart

This guide runs OpenSpeaker locally, explains the difference between preview and production modes, and walks through the first complete conference workflow.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- Git

## Install and run

```bash
git clone https://github.com/premhiru/KMS.git
cd KMS
npm install
npm run dev
```

Open `http://localhost:5173`.

Local development uses versioned browser storage and seeded sample data. It does not require a database, hosting identity, Resend, Airtable, or Accelevents credentials.

## Explore the product

| Route | Purpose |
|---|---|
| `#/dashboard` | Organizer metrics and outstanding onboarding work |
| `#/cfp-builder` | Configure the call for proposals |
| `#/cfp` | Anonymous submission form |
| `#/submissions` | Edit, decide, and export proposals |
| `#/reviews` | Evaluation plans and reviewer workspace |
| `#/speakers` | Event roster, tasks, sessions, and deliverables |
| `#/crm` | Cross-event contact directory |
| `#/agenda` | Schedule, conflicts, and publishing |
| `#/communications` | Templates, messages, reminders, and calendar invites |
| `#/embeds` | Public widgets and native feed configuration |
| `#/portal` | Speaker self-service preview |
| `#/event/sessions` | Public program |
| `#/docs` | Interactive product and API documentation |

## Run the first workflow

1. Open **CFP form builder**, set dates, form questions, conditions, and routing rules, then publish it.
2. Open `#/cfp` in another tab and submit a proposal.
3. Return to **Submissions** and move the proposal into review.
4. Create an evaluation plan, assignment, and rubric in **Review workspace**.
5. Accept the proposal. OpenSpeaker creates speaker onboarding tasks exactly once.
6. Complete profile and file tasks in **Speaker portal**.
7. Drag the accepted session onto the agenda, resolve conflicts, and publish.
8. Open `#/event/sessions`, save an itinerary, and export it to iCalendar.

## Verify a change

```bash
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
npm audit --omit=dev
```

## Production mode

The production build uses the Worker API, D1, R2, and hosting-provided identity. See [Production deployment](deployment.md) before publishing. The live API contract is documented in [API reference](api-reference.md).
