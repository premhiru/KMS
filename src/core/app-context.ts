import { createContext, useContext, type Dispatch } from 'react'
import type { AppState, Submission } from '../domain/types'
import type { AppAction } from './reducer'
import type { ValidationResult } from './storage'
import type { DownloadedAsset, OpenSpeakerApiClient, PublicCfpSubmissionInput, PublicCfpSubmissionReceipt, ReviewerMutationInput, SpeakerProposalMutationInput, UploadedAsset, WorkspaceSession } from '../services'

export type PersistenceMode = 'local' | 'remote' | 'public-readonly'
export type SyncStatus = 'loading' | 'saved' | 'saving' | 'error' | 'unauthorized'

export interface AppContextValue {
  state: AppState
  dispatch: Dispatch<AppAction>
  persistenceError?: string
  persistenceMode: PersistenceMode
  syncStatus: SyncStatus
  api?: OpenSpeakerApiClient
  session?: WorkspaceSession
  reset: () => void
  importJson: (json: string) => ValidationResult
  exportJson: () => string
  submitCfp: (input: PublicCfpSubmissionInput) => Promise<PublicCfpSubmissionReceipt>
  uploadAsset: (file: File) => Promise<UploadedAsset>
  downloadAsset: (assetId: string) => Promise<DownloadedAsset>
  saveSpeakerProposal: (input: Omit<SpeakerProposalMutationInput, 'expectedRevision'>, submissionId?: string) => Promise<Submission>
  submitAssignedReview: (input: Omit<ReviewerMutationInput, 'expectedRevision'>) => Promise<void>
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used inside AppProvider.')
  return context
}

export function useAppState(): AppState {
  return useApp().state
}

export function useAppDispatch(): Dispatch<AppAction> {
  return useApp().dispatch
}
