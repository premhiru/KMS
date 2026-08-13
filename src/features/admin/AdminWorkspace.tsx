import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, Check, Clock3, History, Link2, RefreshCw, Search, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react'
import { useApp } from '../../core'
import type { AuditEntry, MemberInput, WorkspaceMember, WorkspaceRole } from '../../services'
import { adminErrorMessage, auditMetadataLabel, filterAudit, filterMembers } from './admin-utils'
import './admin.css'

const roles: WorkspaceRole[] = ['owner', 'organizer', 'reviewer', 'speaker']

export interface AdminWorkspaceProps {
  initialView?: 'members' | 'audit'
}

export function AdminWorkspace({ initialView = 'members' }: AdminWorkspaceProps) {
  const { api, persistenceMode } = useApp()
  const [view, setView] = useState(initialView)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(Boolean(api))
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (silent = false) => {
    if (!api) return
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const [nextMembers, nextAudit] = await Promise.all([api.getMembers(), api.getAudit()])
      setMembers(nextMembers)
      setAudit(nextAudit)
    } catch (loadError) {
      setError(adminErrorMessage(loadError))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  if (!api || persistenceMode !== 'remote') {
    return <section className="admin-workspace admin-unavailable" aria-labelledby="admin-heading"><ShieldCheck aria-hidden="true" /><h1 id="admin-heading">Workspace access</h1><p>Member access and audit history are available in the deployed, authenticated workspace. Local preview does not have a hosting identity or remote administration API.</p></section>
  }

  return (
    <section className="admin-workspace" aria-labelledby="admin-heading">
      <header className="admin-header">
        <div><p className="admin-eyebrow">Workspace administration</p><h1 id="admin-heading">Access and audit</h1><p>Manage backend workspace membership and inspect recorded administrative activity.</p></div>
        <button className="admin-button" type="button" disabled={loading || refreshing} onClick={() => void load(true)}><RefreshCw aria-hidden="true" className={refreshing ? 'is-spinning' : ''} />Refresh</button>
      </header>
      <div className="admin-security-note"><ShieldCheck aria-hidden="true" /><p><strong>Roles are enforced by the backend.</strong> This screen reflects server decisions; hiding controls in the frontend would not secure them. User IDs are stable identity IDs supplied by the hosting authentication provider, not IDs invented by OpenSpeaker.</p></div>
      {error && <div className="admin-error" role="alert"><AlertTriangle aria-hidden="true" /><span>{error}</span><button type="button" onClick={() => void load()}>Try again</button></div>}
      <div className="admin-tabs" role="tablist" aria-label="Workspace administration">
        <button type="button" role="tab" aria-selected={view === 'members'} className={view === 'members' ? 'is-selected' : ''} onClick={() => setView('members')}><Users aria-hidden="true" />Members <span>{members.length}</span></button>
        <button type="button" role="tab" aria-selected={view === 'audit'} className={view === 'audit' ? 'is-selected' : ''} onClick={() => setView('audit')}><History aria-hidden="true" />Audit log <span>{audit.length}</span></button>
      </div>
      {loading ? <AdminLoading /> : view === 'members'
        ? <MembersPanel members={members} onChanged={() => load(true)} />
        : <AuditPanel entries={audit} />}
    </section>
  )
}

function AdminLoading() {
  return <div className="admin-loading" role="status"><RefreshCw className="is-spinning" aria-hidden="true" /><span>Loading workspace administration…</span></div>
}

function MembersPanel({ members, onChanged }: { members: WorkspaceMember[]; onChanged: () => Promise<void> }) {
  const { api, session } = useApp()
  const [query, setQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<WorkspaceRole>('reviewer')
  const [busyId, setBusyId] = useState('')
  const [confirmRemoveId, setConfirmRemoveId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const rows = useMemo(() => filterMembers(members, query), [members, query])
  const [inviteCount, setInviteCount] = useState(10)
  const [accessDays, setAccessDays] = useState(30)
  const [inviteLinks, setInviteLinks] = useState<string[]>([])
  const [generatingInvites, setGeneratingInvites] = useState(false)

  async function mutate(id: string, operation: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusyId(id)
    setError('')
    setNotice('')
    try {
      await operation()
      await onChanged()
      setNotice(success)
      return true
    } catch (mutationError) {
      setError(adminErrorMessage(mutationError))
      return false
    } finally {
      setBusyId('')
    }
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!api) return
    const input: MemberInput = { userId: userId.trim(), email: email.trim(), name: name.trim() || undefined, role }
    const succeeded = await mutate(input.userId, () => api.addMember(input), `Added ${input.email} as ${input.role}.`)
    if (succeeded) { setUserId(''); setEmail(''); setName(''); setRole('reviewer'); setFormOpen(false) }
  }

  async function generateEvaluatorLinks(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!api || session?.role !== 'owner') return
    setGeneratingInvites(true)
    setError('')
    setNotice('')
    setInviteLinks([])
    try {
      const returnUrl = new URL(window.location.href)
      returnUrl.searchParams.delete('organizerToken')
      returnUrl.hash = '#/dashboard'
      const batch = await api.createOrganizerInvitations({ count: inviteCount, accessDays, returnUrl: returnUrl.toString() })
      setInviteLinks(batch.invitations.map((invitation) => invitation.url))
      setNotice(`${batch.count} one-time organizer links created. They expire ${new Date(batch.expiresAt).toLocaleString()}.`)
    } catch (invitationError) {
      setError(adminErrorMessage(invitationError))
    } finally {
      setGeneratingInvites(false)
    }
  }

  return (
    <div className="admin-panel" role="tabpanel">
      <div className="admin-toolbar"><label className="admin-search"><Search aria-hidden="true" /><span className="admin-sr-only">Search members</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, ID, or role" /></label><button className="admin-button admin-button--primary" type="button" onClick={() => setFormOpen((open) => !open)}><UserPlus aria-hidden="true" />Add member</button></div>
      {notice && <p className="admin-notice" role="status"><Check aria-hidden="true" />{notice}</p>}
      {error && <p className="admin-inline-error" role="alert"><AlertTriangle aria-hidden="true" />{error}</p>}
      <section className="admin-evaluator-access" aria-labelledby="evaluator-access-heading">
        <div><Link2 aria-hidden="true" /><div><h2 id="evaluator-access-heading">Evaluator organizer access</h2><p>Create one-time links that bind a signed-in evaluator to a temporary organizer membership. Raw links appear once and are never stored in plaintext.</p></div></div>
        {session?.role === 'owner' ? <form onSubmit={(event) => void generateEvaluatorLinks(event)}><label>Number of links<input type="number" min="1" max="10" value={inviteCount} onChange={(event) => setInviteCount(Number(event.target.value))} /></label><label>Access duration<input type="number" min="1" max="60" value={accessDays} onChange={(event) => setAccessDays(Number(event.target.value))} /><span>days</span></label><button className="admin-button admin-button--primary" type="submit" disabled={generatingInvites}>{generatingInvites ? 'Generating…' : `Generate ${inviteCount} links`}</button></form> : <p className="admin-owner-only">Only a workspace owner can generate temporary organizer access.</p>}
        {inviteLinks.length > 0 && <div className="admin-invite-output"><label htmlFor="evaluator-invite-links">Private evaluator links</label><textarea id="evaluator-invite-links" readOnly rows={Math.min(10, inviteLinks.length)} value={inviteLinks.map((link, index) => `${index + 1}. ${link}`).join('\n')} onFocus={(event) => event.currentTarget.select()} /><p><strong>Keep these private.</strong> Each link can be redeemed once and should be placed only in the evaluator handoff—not GitHub.</p></div>}
      </section>
      {formOpen && <form className="admin-add-form" onSubmit={(event) => void add(event)}><div><label>Hosting user ID<input required value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="Identity ID from your hosting provider" /></label><label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@example.com" /></label><label>Display name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Optional" /></label><label>Role<select value={role} onChange={(event) => setRole(event.target.value as WorkspaceRole)}>{roles.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div><p>Ask the person to sign in through the hosting provider first, then copy their stable identity user ID. Email alone does not establish identity.</p><div><button className="admin-button admin-button--primary" disabled={Boolean(busyId)} type="submit">{busyId ? 'Adding…' : 'Add access'}</button><button className="admin-button" type="button" onClick={() => setFormOpen(false)}>Cancel</button></div></form>}
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Member</th><th>Hosting identity ID</th><th>Role</th><th>Added</th><th><span className="admin-sr-only">Actions</span></th></tr></thead><tbody>{rows.map((member) => <tr key={member.id}><td><strong>{member.name || 'Unnamed member'}</strong><small>{member.email}</small></td><td><code>{member.id}</code></td><td><label><span className="admin-sr-only">Role for {member.email}</span><select value={member.role} disabled={busyId === member.id} onChange={(event) => { const nextRole = event.target.value as WorkspaceRole; if (api) void mutate(member.id, () => api.updateMemberRole(member.id, nextRole), `Updated ${member.email} to ${nextRole}.`) }}>{roles.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></td><td>{new Date(member.createdAt).toLocaleDateString()}</td><td>{confirmRemoveId === member.id ? <div className="admin-confirm" role="group" aria-label={`Confirm removal of ${member.email}`}><span>Remove access?</span><button className="admin-button admin-button--danger" disabled={busyId === member.id} type="button" onClick={() => { if (api) void mutate(member.id, () => api.removeMember(member.id), `Removed ${member.email}.`).then((succeeded) => { if (succeeded) setConfirmRemoveId('') }) }}>Confirm</button><button className="admin-button" type="button" onClick={() => setConfirmRemoveId('')}>Cancel</button></div> : <button className="admin-icon-button" type="button" disabled={Boolean(busyId)} aria-label={`Remove ${member.email} from workspace`} onClick={() => setConfirmRemoveId(member.id)}><Trash2 aria-hidden="true" /></button>}</td></tr>)}{rows.length === 0 && <tr><td className="admin-empty-cell" colSpan={5}>No workspace members match this search.</td></tr>}</tbody></table></div>
    </div>
  )
}

function AuditPanel({ entries }: { entries: AuditEntry[] }) {
  const [query, setQuery] = useState('')
  const rows = useMemo(() => filterAudit(entries, query), [entries, query])
  return <div className="admin-panel" role="tabpanel"><div className="admin-toolbar"><label className="admin-search"><Search aria-hidden="true" /><span className="admin-sr-only">Search audit log</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search action, actor, entity, request ID" /></label></div><div className="admin-audit-list">{rows.map((entry) => <article key={entry.id}><div className="admin-audit-icon"><Clock3 aria-hidden="true" /></div><div><header><strong>{entry.action}</strong><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time></header><p><span>{entry.entityType}</span> <code>{entry.entityId}</code> · actor <code>{entry.actorUserId ?? 'system'}</code></p><details><summary>Technical details</summary><dl><div><dt>Request ID</dt><dd><code>{entry.requestId}</code></dd></div><div><dt>Metadata</dt><dd>{auditMetadataLabel(entry.metadata)}</dd></div></dl></details></div></article>)}{rows.length === 0 && <div className="admin-empty-cell">No audit entries match this search.</div>}</div></div>
}
