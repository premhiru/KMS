# Production deployment

OpenSpeaker targets a Cloudflare-compatible Worker runtime with D1 and R2. The checked-in hosting manifest contains logical bindings only; secrets belong in the hosted environment.

## Build

```bash
npm install
npm run build
```

The build emits the React client and Worker entry, copies `.openai/hosting.json`, and packages database migrations.

## Required bindings

```json
{
  "project_id": "your-sites-project-id",
  "d1": "DB",
  "r2": "FILES"
}
```

- `DB` stores application state, history, members, normalized submissions, CRM, rate limits, jobs, and audit entries.
- `FILES` stores private event-scoped file bytes.

## Runtime configuration

| Capability | Variables |
|---|---|
| Initial owner | `BOOTSTRAP_OWNER_EMAIL` |
| Resend email, proposal links, reminders, invitations | `RESEND_API_KEY`, `EMAIL_FROM` |
| Accelevents one-way sync | `ACCELEVENTS_API_KEY`, `ACCELEVENTS_EVENT_URL` |
| Airtable CRM mirror | `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, optional `AIRTABLE_TABLE_NAME` |
| HTTP maintenance fallback | `CRON_SECRET` |

`BOOTSTRAP_OWNER_EMAIL` must exactly match the trusted hosting email allowed to initialize or repair owner membership. `BOOTSTRAP_OWNER_ID` is optional metadata, not an authorization match.

Never add provider values to source files, examples, tests, commits, issues, or screenshots. Configure them in the hosted runtime's secret manager.

## Airtable table

The default table is `Speaker CRM Contacts`. Create these case-sensitive fields:

- `OpenSpeaker Contact ID` (primary text)
- `First Name`, `Last Name`, `Email`
- `Company`, `Job Title`, `Biography`
- `LinkedIn URL`, `Twitter URL`, `Travel Preferences`
- `Tags`, `Custom Fields JSON`, `Event Links JSON`, `Updated At`

The integration is a one-way D1-to-Airtable mirror. D1 remains authoritative.

## Release checks

```bash
npm test
npm run lint
npm run build
npm run test:e2e
npm audit --omit=dev
```

After deployment, verify:

1. `/api/health` reports healthy D1 and R2 bindings.
2. The configured owner can open the organizer workspace.
3. Anonymous visitors can read the CFP and public program.
4. A reversible proposal submission persists and appears to the organizer.
5. A reviewer sees only assigned records.
6. A speaker can edit their own profile and upload/download a private file.
7. JSON, XML, and iCalendar feeds return native MIME types.
8. Provider status is visible before external delivery or sync.
9. A Resend test reaches a controlled inbox with a valid invitation.
10. Airtable and Accelevents operations replay idempotently.

See [`db/operations.md`](../db/operations.md) for backup, restore, retention, and monitoring.
