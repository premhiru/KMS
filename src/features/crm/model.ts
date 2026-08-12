import type { CrmContact, CrmDocument, CrmFilters } from './types'

export const defaultStages = [
  { id: 'researching', name: 'Researching', kind: 'open' as const, order: 0 }, { id: 'identified', name: 'Identified', kind: 'open' as const, order: 1 },
  { id: 'contacted', name: 'Contacted', kind: 'open' as const, order: 2 }, { id: 'interested', name: 'Interested', kind: 'open' as const, order: 3 },
  { id: 'confirmed', name: 'Confirmed', kind: 'won' as const, order: 4 }, { id: 'future-fit', name: 'Future fit', kind: 'nurture' as const, order: 5 }, { id: 'declined', name: 'Declined', kind: 'lost' as const, order: 6 },
]
export function emptyCrm(now = new Date().toISOString()): CrmDocument { return { contacts: [], segments: [], stages: defaultStages, pipeline: [], campaigns: [], updatedAt: now } }
export function filterContacts(contacts: CrmContact[], filters: CrmFilters): CrmContact[] {
  const query = filters.query?.trim().toLowerCase()
  return contacts.filter((contact) => (!query || `${contact.firstName} ${contact.lastName} ${contact.email} ${contact.company} ${contact.jobTitle} ${contact.tags.join(' ')}`.toLowerCase().includes(query)) && (!filters.company || contact.company === filters.company) && (!filters.jobTitle || contact.jobTitle === filters.jobTitle) && (!filters.tag || contact.tags.includes(filters.tag)))
}
export function duplicateGroups(contacts: CrmContact[]): CrmContact[][] {
  const groups = new Map<string, CrmContact[]>()
  contacts.forEach((contact) => { const key = `${contact.firstName} ${contact.lastName}`.trim().toLowerCase().replace(/[^a-z0-9]/g, ''); groups.set(key, [...(groups.get(key) ?? []), contact]) })
  return [...groups.values()].filter((group) => group.length > 1)
}
export function mergeContacts(primary: CrmContact, duplicates: CrmContact[], at = new Date().toISOString()): CrmContact {
  const all = [primary, ...duplicates]
  return { ...primary, company: primary.company || all.find((item) => item.company)?.company || '', jobTitle: primary.jobTitle || all.find((item) => item.jobTitle)?.jobTitle || '', bio: primary.bio || all.find((item) => item.bio)?.bio || '', tags: [...new Set(all.flatMap((item) => item.tags))], customFields: Object.assign({}, ...all.map((item) => item.customFields)), notes: all.flatMap((item) => item.notes).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)), activity: [...all.flatMap((item) => item.activity), { id: crypto.randomUUID(), type: 'merge', summary: `Merged ${duplicates.length} duplicate contact${duplicates.length===1?'':'s'}.`, createdAt: at }], eventLinks: [...new Map(all.flatMap((item) => item.eventLinks).map((link) => [link.eventId, link])).values()], updatedAt: at }
}
export function personalize(source: string, contact: CrmContact): string { return source.replaceAll('{{first_name}}', contact.firstName).replaceAll('{{last_name}}', contact.lastName).replaceAll('{{company}}', contact.company).replaceAll('{{email}}', contact.email) }
