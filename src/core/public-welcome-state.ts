import { APP_SCHEMA_VERSION, type AppState } from '../domain/types'

export function createPublicWelcomeState(): AppState {
  const timestamp = '1970-01-01T00:00:00.000Z'
  return {
    schemaVersion: APP_SCHEMA_VERSION,
    lastUpdatedAt: timestamp,
    event: {
      id: 'public-welcome', name: 'OpenSpeaker', slug: 'welcome', venue: '', timezone: 'UTC',
      startAt: timestamp, endAt: timestamp, rooms: [], tracks: [], resources: [],
    },
    speakers: [], submissions: [], reviews: [], tasks: [], sessions: [], templates: [], communicationLog: [],
    evaluationPlans: [], evaluationRounds: [], evaluationAssignments: [], evaluationAdvancements: [],
  }
}
