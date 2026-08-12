import { useEffect, useMemo, useState, type FormEvent } from "react";
import { parseCsv, useApp } from "../../core";
import type { WorkspaceEventSummary } from "../../services";
import { CrmApi } from "./crm-api";
import {
  duplicateGroups,
  emptyCrm,
  filterContacts,
  mergeContacts,
  personalize,
} from "./model";
import type {
  AirtableIntegrationStatus,
  CrmContact,
  CrmDocument,
  CrmFilters,
  CrmPipelineCard,
} from "./types";
import "./crm.css";
import "./integrations.css";

const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const now = () => new Date().toISOString();
const personName = (contact: CrmContact) =>
  `${contact.firstName} ${contact.lastName}`.trim();
const blankContact = {
  firstName: "",
  lastName: "",
  email: "",
  company: "",
  jobTitle: "",
  bio: "",
};

export function CrmWorkspace() {
  const { api, session } = useApp();
  const crmApi = useMemo(
    () => (api ? new CrmApi(api.workspaceId) : undefined),
    [api],
  );
  const [crm, setCrm] = useState<CrmDocument>(() => emptyCrm());
  const [revision, setRevision] = useState(0);
  const [events, setEvents] = useState<WorkspaceEventSummary[]>([]);
  const [tab, setTab] = useState<
    "dashboard" | "directory" | "pipeline" | "segments" | "history"
  >("dashboard");
  const [filters, setFilters] = useState<CrmFilters>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openContactId, setOpenContactId] = useState("");
  const [draft, setDraft] = useState(blankContact);
  const [note, setNote] = useState("");
  const [tag, setTag] = useState("");
  const [field, setField] = useState({ name: "", value: "" });
  const [segmentName, setSegmentName] = useState("");
  const [campaign, setCampaign] = useState({
    subject: "",
    body: "Hi {{first_name}},\n\nWe would love to invite you to speak at our next event.",
  });
  const [pipelineNotes, setPipelineNotes] = useState<Record<string, string>>(
    {},
  );
  const [eventId, setEventId] = useState("");
  const [status, setStatus] = useState("Loading organization contacts…");
  const [busy, setBusy] = useState(false);
  const [airtable, setAirtable] = useState<AirtableIntegrationStatus>({
    configured: false,
  });
  const [airtableBusy, setAirtableBusy] = useState(false);
  const [airtableCheckError, setAirtableCheckError] = useState("");

  async function refreshAirtableStatus() {
    if (!crmApi) return;
    setAirtableBusy(true);
    setAirtableCheckError("");
    try {
      setAirtable(await crmApi.getAirtableStatus());
    } catch (error) {
      setAirtableCheckError(
        error instanceof Error
          ? error.message
          : "Unable to check the Airtable connection.",
      );
    } finally {
      setAirtableBusy(false);
    }
  }

  useEffect(() => {
    if (!crmApi || !api) return;
    const controller = new AbortController();
    void Promise.all([
      crmApi.get(controller.signal),
      api.listEvents({ signal: controller.signal }),
      crmApi
        .getAirtableStatus(controller.signal)
        .then((integration) => {
          setAirtableCheckError("");
          return integration;
        })
        .catch((error) => {
          setAirtableCheckError(
            error instanceof Error
              ? error.message
              : "Unable to check the Airtable connection.",
          );
          return undefined;
        }),
    ])
      .then(([loaded, eventList, airtableStatus]) => {
        setCrm(loaded.crm);
        setRevision(loaded.revision);
        setEvents(eventList.events);
        setEventId(eventList.events[0]?.id ?? "");
        if (airtableStatus) setAirtable(airtableStatus);
        setStatus("");
      })
      .catch((error) =>
        setStatus(
          error instanceof Error ? error.message : "Unable to load CRM.",
        ),
      );
    return () => controller.abort();
  }, [api, crmApi]);

  const commit = async (
    transform: (current: CrmDocument) => CrmDocument,
    message: string,
  ) => {
    if (!crmApi || busy) return;
    setBusy(true);
    try {
      const receipt = await crmApi.put(transform(crm), revision);
      setCrm(receipt.crm);
      setRevision(receipt.revision);
      setStatus(message);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "CRM update failed. Refresh and retry.",
      );
    } finally {
      setBusy(false);
    }
  };
  const contacts = useMemo(
    () => filterContacts(crm.contacts, filters),
    [crm.contacts, filters],
  );
  const openContact = crm.contacts.find(
    (contact) => contact.id === openContactId,
  );
  const companies = [
    ...new Set(crm.contacts.map((contact) => contact.company).filter(Boolean)),
  ].sort();
  const jobTitles = [
    ...new Set(crm.contacts.map((contact) => contact.jobTitle).filter(Boolean)),
  ].sort();
  const tags = [
    ...new Set(crm.contacts.flatMap((contact) => contact.tags)),
  ].sort();
  const duplicates = duplicateGroups(crm.contacts);
  const returning = crm.contacts.filter(
    (contact) => contact.eventLinks.length > 1,
  ).length;
  const topCompanies = [
    ...new Map(
      companies.map((company) => [
        company,
        crm.contacts.filter((contact) => contact.company === company).length,
      ]),
    ).entries(),
  ]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const createContact = (event: FormEvent) => {
    event.preventDefault();
    const email = draft.email.trim().toLowerCase();
    if (crm.contacts.some((contact) => contact.email.toLowerCase() === email))
      return setStatus("A contact with that email already exists.");
    const at = now();
    void commit(
      (current) => ({
        ...current,
        contacts: [
          ...current.contacts,
          {
            id: id("contact"),
            ...draft,
            email,
            tags: [],
            customFields: {},
            notes: [],
            eventLinks: [],
            activity: [
              {
                id: id("activity"),
                type: "created",
                summary: "Contact created manually.",
                createdAt: at,
              },
            ],
            createdAt: at,
            updatedAt: at,
          },
        ],
        updatedAt: at,
      }),
      "Contact created.",
    );
    setDraft(blankContact);
  };
  const importCsv = async (file?: File) => {
    if (!file) return;
    const parsed = parseCsv(await file.text());
    const header = (...names: string[]) =>
      parsed.headers.find((item) => names.includes(item.trim().toLowerCase()));
    const nameHeader = header("name", "full name");
    const firstHeader = header("first name", "firstname");
    const lastHeader = header("last name", "lastname");
    const emailHeader = header("email", "email address");
    if (!emailHeader || (!nameHeader && (!firstHeader || !lastHeader)))
      return setStatus(
        "Map-ready CSV requires name or first/last name, plus email.",
      );
    const existing = new Set(
      crm.contacts.map((item) => item.email.toLowerCase()),
    );
    const at = now();
    const imported: CrmContact[] = [];
    parsed.rows.forEach((row) => {
      const parts = (nameHeader ? row[nameHeader] : "").trim().split(/\s+/);
      const firstName = (
        firstHeader ? row[firstHeader] : (parts.shift() ?? "")
      ).trim();
      const lastName = (lastHeader ? row[lastHeader] : parts.join(" ")).trim();
      const email = row[emailHeader].trim().toLowerCase();
      if (!firstName || !lastName || !email || existing.has(email)) return;
      existing.add(email);
      imported.push({
        id: id("contact"),
        firstName,
        lastName,
        email,
        company: row[header("company", "organization") ?? ""] ?? "",
        jobTitle: row[header("title", "job title", "role") ?? ""] ?? "",
        bio: row[header("bio", "biography") ?? ""] ?? "",
        tags: [],
        customFields: {},
        notes: [],
        activity: [
          {
            id: id("activity"),
            type: "created",
            summary: `Imported from ${file.name}.`,
            createdAt: at,
          },
        ],
        eventLinks: [],
        createdAt: at,
        updatedAt: at,
      });
    });
    void commit(
      (current) => ({
        ...current,
        contacts: [...current.contacts, ...imported],
        updatedAt: at,
      }),
      `Imported ${imported.length} contacts; duplicates skipped.`,
    );
  };
  const updateContact = (
    contactId: string,
    transform: (contact: CrmContact) => CrmContact,
    message: string,
  ) =>
    void commit(
      (current) => ({
        ...current,
        contacts: current.contacts.map((contact) =>
          contact.id === contactId ? transform(contact) : contact,
        ),
        updatedAt: now(),
      }),
      message,
    );
  const addNote = () => {
    if (!openContact || !note.trim()) return;
    const at = now();
    updateContact(
      openContact.id,
      (contact) => ({
        ...contact,
        notes: [
          ...contact.notes,
          {
            id: id("note"),
            body: note.trim(),
            authorName: session?.user.name ?? "Organizer",
            createdAt: at,
          },
        ],
        activity: [
          ...contact.activity,
          {
            id: id("activity"),
            type: "note",
            summary: "Internal note added.",
            createdAt: at,
          },
        ],
        updatedAt: at,
      }),
      "Internal note saved.",
    );
    setNote("");
  };
  const addTag = () => {
    if (!openContact || !tag.trim()) return;
    updateContact(
      openContact.id,
      (contact) => ({
        ...contact,
        tags: [...new Set([...contact.tags, tag.trim()])],
        updatedAt: now(),
      }),
      "Tag saved.",
    );
    setTag("");
  };
  const addField = () => {
    if (!openContact || !field.name.trim()) return;
    updateContact(
      openContact.id,
      (contact) => ({
        ...contact,
        customFields: {
          ...contact.customFields,
          [field.name.trim()]: field.value.trim(),
        },
        updatedAt: now(),
      }),
      "Custom field saved.",
    );
    setField({ name: "", value: "" });
  };
  const mergeGroup = (group: CrmContact[]) => {
    const primary = group[0];
    const others = group.slice(1);
    void commit(
      (current) => ({
        ...current,
        contacts: [
          ...current.contacts.filter(
            (contact) => !group.some((item) => item.id === contact.id),
          ),
          mergeContacts(primary, others),
        ],
        pipeline: current.pipeline.map((card) =>
          others.some((item) => item.id === card.contactId)
            ? { ...card, contactId: primary.id }
            : card,
        ),
        updatedAt: now(),
      }),
      `Merged ${group.length} contacts into ${personName(primary)}.`,
    );
  };
  const saveSegment = () => {
    if (!segmentName.trim()) return;
    const at = now();
    void commit(
      (current) => ({
        ...current,
        segments: [
          ...current.segments,
          {
            id: id("segment"),
            name: segmentName.trim(),
            kind: "dynamic",
            filters,
            contactIds: contacts.map((contact) => contact.id),
            createdAt: at,
          },
        ],
        updatedAt: at,
      }),
      "Dynamic segment saved.",
    );
    setSegmentName("");
  };
  const enroll = (contactId: string) => {
    if (crm.pipeline.some((card) => card.contactId === contactId)) return;
    const at = now();
    void commit(
      (current) => ({
        ...current,
        pipeline: [
          ...current.pipeline,
          {
            id: id("card"),
            contactId,
            stageId: current.stages[1]?.id ?? current.stages[0].id,
            notes: [],
            stageHistory: [
              {
                id: id("transition"),
                toStageId: current.stages[1]?.id ?? current.stages[0].id,
                createdAt: at,
              },
            ],
            createdAt: at,
            updatedAt: at,
          },
        ],
        updatedAt: at,
      }),
      "Contact enrolled in pipeline.",
    );
  };
  const moveCard = (card: CrmPipelineCard, toStageId: string) => {
    const at = now();
    void commit(
      (current) => ({
        ...current,
        pipeline: current.pipeline.map((item) =>
          item.id === card.id
            ? {
                ...item,
                stageId: toStageId,
                stageHistory: [
                  ...item.stageHistory,
                  {
                    id: id("transition"),
                    fromStageId: item.stageId,
                    toStageId,
                    createdAt: at,
                  },
                ],
                updatedAt: at,
              }
            : item,
        ),
        updatedAt: at,
      }),
      "Pipeline stage updated.",
    );
  };
  const addPipelineNote = (card: CrmPipelineCard) => {
    const body = pipelineNotes[card.id]?.trim();
    if (!body) return;
    const at = now();
    void commit(
      (current) => ({
        ...current,
        pipeline: current.pipeline.map((item) =>
          item.id === card.id
            ? {
                ...item,
                notes: [
                  ...item.notes,
                  {
                    id: id("note"),
                    body,
                    authorName: session?.user.name ?? "Organizer",
                    createdAt: at,
                  },
                ],
                updatedAt: at,
              }
            : item,
        ),
        updatedAt: at,
      }),
      "Pipeline note saved.",
    );
    setPipelineNotes({ ...pipelineNotes, [card.id]: "" });
  };
  const addToEvent = async () => {
    if (!crmApi || !openContact || !eventId) return;
    setBusy(true);
    try {
      const receipt = await crmApi.addToEvent(
        openContact.id,
        eventId,
        revision,
      );
      setCrm(receipt.crm);
      setRevision(receipt.revision);
      setStatus("Contact added to the event with profile data preserved.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not add contact to event.",
      );
    } finally {
      setBusy(false);
    }
  };
  const sendCampaign = () => {
    const recipients = crm.contacts.filter((contact) =>
      selectedIds.includes(contact.id),
    );
    if (recipients.length < 2 || !campaign.subject.trim()) return;
    const at = now();
    const preview = recipients
      .map(
        (contact) =>
          `${personName(contact)}: ${personalize(campaign.body, contact)}`,
      )
      .join("\n\n");
    void commit(
      (current) => ({
        ...current,
        campaigns: [
          ...current.campaigns,
          {
            id: id("campaign"),
            contactIds: recipients.map((item) => item.id),
            subject: campaign.subject.trim(),
            body: campaign.body,
            preview,
            status: "queued",
            createdAt: at,
          },
        ],
        contacts: current.contacts.map((contact) =>
          selectedIds.includes(contact.id)
            ? {
                ...contact,
                activity: [
                  ...contact.activity,
                  {
                    id: id("activity"),
                    type: "campaign",
                    summary: `Queued campaign: ${campaign.subject.trim()}`,
                    createdAt: at,
                  },
                ],
              }
            : contact,
        ),
        updatedAt: at,
      }),
      `Queued outreach for ${recipients.length} contacts.`,
    );
  };
  const syncAirtable = async () => {
    if (!crmApi || !airtable.configured || airtableBusy) return;
    setAirtableBusy(true);
    try {
      const run = await crmApi.syncAirtable(revision);
      setAirtable({ ...airtable, lastRun: run });
      setStatus(
        run.status === "succeeded"
          ? `Airtable sync completed for ${run.synced?.contacts ?? 0} contacts.`
          : run.error || "Airtable sync failed. D1 records were not changed.",
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `${error.message} D1 records remain available.`
          : "Airtable sync failed. D1 records remain available.",
      );
    } finally {
      setAirtableBusy(false);
    }
  };

  return (
    <div className="crm">
      <header className="crm-hero">
        <div>
          <p>Organization workspace</p>
          <h1>Speaker CRM</h1>
          <span>
            Cross-event relationships, sourcing, history, and outreach.
          </span>
        </div>
        <nav aria-label="CRM sections">
          {(
            [
              "dashboard",
              "directory",
              "pipeline",
              "segments",
              "history",
            ] as const
          ).map((item) => (
            <button
              key={item}
              aria-pressed={tab === item}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </nav>
      </header>
      <aside
        className={`crm-airtable ${airtableCheckError ? "is-unavailable" : airtable.configured ? "is-connected" : "is-unavailable"}`}
        aria-label="Airtable connection"
      >
        <div>
          <strong>Airtable optional sync</strong>
          <span>
            {airtableCheckError
              ? "Connection check failed · D1 CRM remains fully operational."
              : airtable.configured
              ? "Connected · D1 remains the system of record"
              : "Unavailable · add Airtable credentials to enable optional sync. D1 CRM remains fully operational."}
          </span>
          {airtable.lastRun && (
            <small>
              Last run: {airtable.lastRun.status}
              {airtable.lastRun.completedAt
                ? ` · ${new Date(airtable.lastRun.completedAt).toLocaleString()}`
                : ""}
              {airtable.lastRun.error ? ` · ${airtable.lastRun.error}` : ""}
            </small>
          )}
        </div>
        <button
          disabled={airtableBusy || (!airtable.configured && !airtableCheckError)}
          onClick={() => void (airtableCheckError ? refreshAirtableStatus() : syncAirtable())}
        >
          {airtableBusy ? "Checking…" : airtableCheckError ? "Retry connection" : "Sync to Airtable"}
        </button>
      </aside>
      <p className="crm-status" role="status">
        {status}
      </p>
      {tab === "dashboard" && (
        <section className="crm-dashboard">
          <div className="crm-kpis">
            <article>
              <strong>{crm.contacts.length}</strong>
              <span>Total contacts</span>
            </article>
            <article>
              <strong>{events.length}</strong>
              <span>Events</span>
            </article>
            <article>
              <strong>{returning}</strong>
              <span>Returning speakers</span>
            </article>
            <article>
              <strong>
                {
                  crm.pipeline.filter(
                    (card) =>
                      crm.stages.find((stage) => stage.id === card.stageId)
                        ?.kind === "won",
                  ).length
                }
              </strong>
              <span>Confirmed prospects</span>
            </article>
          </div>
          <article className="crm-panel">
            <h2>Top companies</h2>
            {topCompanies.length ? (
              <ul>
                {topCompanies.map(([company, count]) => (
                  <li key={company}>
                    <button
                      onClick={() => {
                        setFilters({ company });
                        setTab("directory");
                      }}
                    >
                      {company}
                    </button>
                    <strong>{count}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No company data yet.</p>
            )}
          </article>
        </section>
      )}
      {tab === "directory" && (
        <section>
          <div className="crm-toolbar">
            <input
              aria-label="Search contacts"
              type="search"
              placeholder="Search contacts"
              value={filters.query ?? ""}
              onChange={(e) =>
                setFilters({ ...filters, query: e.target.value })
              }
            />
            <select
              aria-label="Filter by company"
              value={filters.company ?? ""}
              onChange={(e) =>
                setFilters({ ...filters, company: e.target.value || undefined })
              }
            >
              <option value="">All companies</option>
              {companies.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <select
              aria-label="Filter by job title"
              value={filters.jobTitle ?? ""}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  jobTitle: e.target.value || undefined,
                })
              }
            >
              <option value="">All job titles</option>
              {jobTitles.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <select
              aria-label="Filter by tag"
              value={filters.tag ?? ""}
              onChange={(e) =>
                setFilters({ ...filters, tag: e.target.value || undefined })
              }
            >
              <option value="">All tags</option>
              {tags.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <button onClick={() => setFilters({})}>Clear filters</button>
          </div>
          <div className="crm-directory-layout">
            <div>
              <div className="crm-actions">
                <label className="crm-button">
                  Import CSV
                  <input
                    hidden
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => void importCsv(e.target.files?.[0])}
                  />
                </label>
                <input
                  placeholder="Segment name"
                  value={segmentName}
                  onChange={(e) => setSegmentName(e.target.value)}
                />
                <button
                  disabled={!contacts.length || !segmentName.trim()}
                  onClick={saveSegment}
                >
                  Save dynamic segment
                </button>
              </div>
              <div className="crm-table" role="table">
                <div role="row" className="crm-table-head">
                  <span>Select</span>
                  <span>Contact</span>
                  <span>Company</span>
                  <span>History</span>
                  <span>Pipeline</span>
                </div>
                {contacts.map((contact) => (
                  <div
                    role="row"
                    key={contact.id}
                    className={openContactId === contact.id ? "is-open" : ""}
                  >
                    <span>
                      <input
                        aria-label={`Select ${personName(contact)}`}
                        type="checkbox"
                        checked={selectedIds.includes(contact.id)}
                        onChange={(e) =>
                          setSelectedIds(
                            e.target.checked
                              ? [...selectedIds, contact.id]
                              : selectedIds.filter(
                                  (item) => item !== contact.id,
                                ),
                          )
                        }
                      />
                    </span>
                    <span>
                      <button
                        className="crm-contact-open"
                        type="button"
                        onClick={() => setOpenContactId(contact.id)}
                      >
                        <strong>{personName(contact)}</strong>
                        <small>{contact.email}</small>
                      </button>
                    </span>
                    <span>
                      {contact.company}
                      <small>{contact.jobTitle}</small>
                    </span>
                    <span>{contact.eventLinks.length} events</span>
                    <span>
                      {crm.pipeline.some(
                        (card) => card.contactId === contact.id,
                      ) ? (
                        "Enrolled"
                      ) : (
                        <button
                          onClick={() => enroll(contact.id)}
                        >
                          Enroll
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              <details className="crm-panel">
                <summary>Create contact</summary>
                <form onSubmit={createContact}>
                  {Object.keys(blankContact).map((key) => (
                    <label key={key}>
                      {key}
                      <input
                        required={["firstName", "lastName", "email"].includes(
                          key,
                        )}
                        type={key === "email" ? "email" : "text"}
                        value={draft[key as keyof typeof draft]}
                        onChange={(e) =>
                          setDraft({ ...draft, [key]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                  <button disabled={busy}>Create contact</button>
                </form>
              </details>
              {duplicates.map((group) => (
                <aside
                  className="crm-duplicate"
                  key={group.map((item) => item.id).join("-")}
                >
                  <strong>Possible duplicate: {personName(group[0])}</strong>
                  <span>{group.map((item) => item.email).join(" · ")}</span>
                  <button disabled={busy} onClick={() => mergeGroup(group)}>
                    Merge into {group[0].email}
                  </button>
                </aside>
              ))}
            </div>
            {openContact && (
              <aside className="crm-profile">
                <h2>{personName(openContact)}</h2>
                <p>
                  {openContact.email}
                  <br />
                  {openContact.jobTitle} · {openContact.company}
                </p>
                <p>{openContact.bio || "No biography yet."}</p>
                <h3>Tags and custom fields</h3>
                <p>{openContact.tags.join(", ") || "No tags"}</p>
                <div>
                  <input
                    placeholder="Add tag"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                  />
                  <button onClick={addTag}>Add</button>
                </div>
                {Object.entries(openContact.customFields).map(
                  ([name, value]) => (
                    <p key={name}>
                      <strong>{name}:</strong> {value}
                    </p>
                  ),
                )}
                <div>
                  <input
                    placeholder="Field name"
                    value={field.name}
                    onChange={(e) =>
                      setField({ ...field, name: e.target.value })
                    }
                  />
                  <input
                    placeholder="Value"
                    value={field.value}
                    onChange={(e) =>
                      setField({ ...field, value: e.target.value })
                    }
                  />
                  <button onClick={addField}>Save field</button>
                </div>
                <h3>Internal notes</h3>
                {openContact.notes.map((item) => (
                  <blockquote key={item.id}>
                    {item.body}
                    <small>
                      {item.authorName} ·{" "}
                      {new Date(item.createdAt).toLocaleString()}
                    </small>
                  </blockquote>
                ))}
                <textarea
                  aria-label="Internal note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <button onClick={addNote}>Save internal note</button>
                <h3>Connections</h3>
                {openContact.eventLinks.map((link) => (
                  <p key={link.eventId}>
                    <strong>{link.eventName}</strong>
                    <br />
                    {link.sessionTitles.join(", ") || "No sessions"}
                  </p>
                ))}
                <select
                  aria-label="Target event"
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                >
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
                <button
                  disabled={busy || !eventId}
                  onClick={() => void addToEvent()}
                >
                  Add to event
                </button>
                <h3>Activity</h3>
                <ol>
                  {openContact.activity
                    .slice()
                    .reverse()
                    .map((item) => (
                      <li key={item.id}>
                        {item.summary}
                        <small>
                          {new Date(item.createdAt).toLocaleString()}
                        </small>
                      </li>
                    ))}
                </ol>
              </aside>
            )}
          </div>
          {selectedIds.length >= 2 && (
            <aside className="crm-composer">
              <h2>Bulk outreach ({selectedIds.length})</h2>
              <label>
                Subject
                <input
                  value={campaign.subject}
                  onChange={(e) =>
                    setCampaign({ ...campaign, subject: e.target.value })
                  }
                />
              </label>
              <label>
                Body
                <textarea
                  value={campaign.body}
                  onChange={(e) =>
                    setCampaign({ ...campaign, body: e.target.value })
                  }
                />
              </label>
              <p>
                <strong>Personalization preview:</strong>
                <br />
                {personalize(
                  campaign.body,
                  crm.contacts.find((item) => selectedIds.includes(item.id))!,
                )}
              </p>
              <button disabled={busy} onClick={sendCampaign}>
                Queue campaign
              </button>
            </aside>
          )}
        </section>
      )}
      {tab === "pipeline" && (
        <section className="crm-board">
          {crm.stages
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((stage) => (
              <div key={stage.id}>
                <h2>{stage.name}</h2>
                {crm.pipeline
                  .filter((card) => card.stageId === stage.id)
                  .map((card) => {
                    const contact = crm.contacts.find(
                      (item) => item.id === card.contactId,
                    );
                    return (
                      <article key={card.id}>
                        <strong>
                          {contact ? personName(contact) : "Unknown contact"}
                        </strong>
                        <small>{contact?.company}</small>
                        <select
                          aria-label={`Move ${contact ? personName(contact) : "contact"}`}
                          value={card.stageId}
                          onChange={(e) => moveCard(card, e.target.value)}
                        >
                          {crm.stages.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                        <details>
                          <summary>Notes and stage history</summary>
                          {card.notes.map((item) => (
                            <blockquote key={item.id}>
                              {item.body}
                              <small>
                                {item.authorName} ·{" "}
                                {new Date(item.createdAt).toLocaleString()}
                              </small>
                            </blockquote>
                          ))}
                          <label>
                            Internal note
                            <input
                              value={pipelineNotes[card.id] ?? ""}
                              onChange={(e) =>
                                setPipelineNotes({
                                  ...pipelineNotes,
                                  [card.id]: e.target.value,
                                })
                              }
                            />
                          </label>
                          <button onClick={() => addPipelineNote(card)}>
                            Save note
                          </button>
                          {card.stageHistory.map((entry) => (
                            <p key={entry.id}>
                              {
                                crm.stages.find(
                                  (item) => item.id === entry.toStageId,
                                )?.name
                              }{" "}
                              · {new Date(entry.createdAt).toLocaleString()}
                            </p>
                          ))}
                        </details>
                      </article>
                    );
                  })}
              </div>
            ))}
        </section>
      )}
      {tab === "segments" && (
        <section className="crm-grid">
          {crm.segments.map((segment) => (
            <article className="crm-panel" key={segment.id}>
              <h2>{segment.name}</h2>
              <p>
                {segment.kind} segment ·{" "}
                {filterContacts(crm.contacts, segment.filters).length} current
                members
              </p>
              <button
                onClick={() => {
                  setFilters(segment.filters);
                  setTab("directory");
                }}
              >
                Open members
              </button>
            </article>
          ))}
        </section>
      )}
      {tab === "history" && (
        <section className="crm-panel">
          <h2>Campaign history</h2>
          {crm.campaigns
            .slice()
            .reverse()
            .map((item) => (
              <details key={item.id}>
                <summary>
                  {item.subject} · {item.contactIds.length} recipients ·{" "}
                  {item.status}
                </summary>
                <pre>{item.preview}</pre>
                <small>{new Date(item.createdAt).toLocaleString()}</small>
              </details>
            ))}
        </section>
      )}
    </div>
  );
}
