import { createContext, useContext, type Dispatch } from 'react'
import type { AppState } from '../domain/types'
import type { AppAction } from './reducer'
import type { ValidationResult } from './storage'

export interface AppContextValue {
  state: AppState
  dispatch: Dispatch<AppAction>
  persistenceError?: string
  reset: () => void
  importJson: (json: string) => ValidationResult
  exportJson: () => string
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
