import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react'
import type { AppState } from '../domain/types'
import { AppContext } from './app-context'
import { appReducer } from './reducer'
import { exportAppState, importAppState, loadAppState, resetAppState, saveAppState } from './storage'

export interface AppProviderProps {
  children: ReactNode
  initialState?: AppState
  storage?: Storage
}

export function AppProvider({ children, initialState, storage }: AppProviderProps) {
  const [state, dispatch] = useReducer(appReducer, initialState ?? loadAppState(storage))
  const [persistenceError, setPersistenceError] = useState<string>()

  useEffect(() => {
    const result = saveAppState(state, storage)
    setPersistenceError(result.ok ? undefined : result.error)
  }, [state, storage])

  const reset = useCallback(() => {
    dispatch({ type: 'state/replace', state: resetAppState(storage) })
  }, [storage])

  const importJson = useCallback((json: string) => {
    const result = importAppState(json)
    if (result.ok) dispatch({ type: 'state/replace', state: result.value })
    return result
  }, [])

  const exportJson = useCallback(() => exportAppState(state), [state])
  const value = useMemo(() => ({ state, dispatch, persistenceError, reset, importJson, exportJson }), [state, persistenceError, reset, importJson, exportJson])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
