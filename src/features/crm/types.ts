export type CrmStageKind = 'open' | 'won' | 'nurture' | 'lost'

export interface CrmEventLink { eventId: string; eventName: string; speakerId: string; sessionTitles: string[]; linkedAt: string }
export interface CrmNote { id: string; body: string; authorName: string; createdAt: string }
export interface CrmActivity { id: string; type: 'created'|'updated'|'note'|'stage'|'event'|'campaign'|'merge'; summary: string; createdAt: string }
export interface CrmContact {
  id: string; firstName: string; lastName: string; email: string; company: string; jobTitle: string; bio: string
  photoUrl?: string; linkedinUrl?: string; twitterUrl?: string; travelPreferences?: string
  tags: string[]; customFields: Record<string, string>; notes: CrmNote[]; activity: CrmActivity[]; eventLinks: CrmEventLink[]
  createdAt: string; updatedAt: string
}
export interface CrmSegment { id: string; name: string; kind: 'dynamic'|'curated'; filters: CrmFilters; contactIds: string[]; createdAt: string }
export interface CrmFilters { query?: string; company?: string; jobTitle?: string; tag?: string }
export interface CrmStage { id: string; name: string; kind: CrmStageKind; order: number }
export interface CrmPipelineCard { id: string; contactId: string; stageId: string; score?: number; rationale?: string; notes: CrmNote[]; stageHistory: Array<{ id: string; fromStageId?: string; toStageId: string; createdAt: string }>; createdAt: string; updatedAt: string }
export interface CrmCampaign { id: string; contactIds: string[]; subject: string; body: string; preview: string; status: 'queued'|'sent'|'failed'; createdAt: string }
export interface CrmDocument { contacts: CrmContact[]; segments: CrmSegment[]; stages: CrmStage[]; pipeline: CrmPipelineCard[]; campaigns: CrmCampaign[]; updatedAt: string }
export interface VersionedCrmDocument { crm: CrmDocument; revision: number }
export interface AirtableSyncRun { runId?: string; status: 'succeeded'|'failed'; synced?: { contacts: number }; replayed?: boolean; error?: string; completedAt?: string }
export interface AirtableIntegrationStatus { configured: boolean; lastRun?: AirtableSyncRun }
