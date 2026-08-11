import type { AppState } from '../domain/types'

const ENTITY_ARRAY_KEYS = [
  'speakers', 'submissions', 'reviews', 'tasks', 'sessions', 'templates', 'communicationLog',
  'evaluationPlans', 'evaluationRounds', 'evaluationAssignments', 'evaluationAdvancements',
] as const satisfies readonly (keyof AppState)[]

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function mergeObject(base: Record<string, unknown>, local: Record<string, unknown>, remote: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...remote }
  for (const key of new Set([...Object.keys(base), ...Object.keys(local)])) {
    if (same(local[key], base[key])) continue
    if (key in local) merged[key] = mergeValue(base[key], local[key], remote[key])
    else delete merged[key]
  }
  return merged
}

function mergeValue(base: unknown, local: unknown, remote: unknown): unknown {
  if (same(local, base)) return remote
  if (same(remote, base)) return local
  if (isRecord(base) && isRecord(local) && isRecord(remote)) return mergeObject(base, local, remote)
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    const containsEntities = [...base, ...local, ...remote].some((item) => isRecord(item) && typeof item.id === 'string')
    if (containsEntities) return mergeEntities(base, local, remote)
  }
  // Both sides changed the same scalar/non-entity array. Preserve the user's pending intent.
  return local
}

function mergeEntities(base: unknown, local: unknown, remote: unknown): unknown[] {
  type Entity = Record<string, unknown> & { id: string }
  const baseItems = Array.isArray(base) ? base : []
  const localItems = Array.isArray(local) ? local : []
  const remoteItems = Array.isArray(remote) ? remote : []
  const byId = (items: unknown[]): Map<string, Entity> => new Map(items.filter((item): item is Entity => Boolean(item && typeof item === 'object' && !Array.isArray(item) && 'id' in item && typeof item.id === 'string')).map((item) => [item.id, item]))
  const baseById = byId(baseItems)
  const localById = byId(localItems)
  const mergedById = byId(remoteItems)

  for (const [id, baseItem] of baseById) {
    if (!localById.has(id)) mergedById.delete(id)
    else if (!same(localById.get(id), baseItem)) {
      const localItem = localById.get(id)!
      const remoteItem = mergedById.get(id)
      mergedById.set(id, isRecord(baseItem) && isRecord(localItem) && isRecord(remoteItem)
        ? mergeObject(baseItem, localItem, remoteItem) as Entity
        : localItem)
    }
  }
  for (const [id, localItem] of localById) {
    if (!baseById.has(id)) mergedById.set(id, localItem)
  }
  return [...mergedById.values()]
}

export interface RemoteSnapshotGuard {
  incomingRevision: number
  currentRevision: number | null
  requestMutationVersion: number
  currentMutationVersion: number
  hasPendingChanges: boolean
  isSaving: boolean
  isCurrentRequest: boolean
}

/** Guards an asynchronous poll response from overwriting newer local or remote work. */
export function canAcceptRemoteSnapshot(guard: RemoteSnapshotGuard): boolean {
  return guard.isCurrentRequest
    && !guard.isSaving
    && !guard.hasPendingChanges
    && guard.requestMutationVersion === guard.currentMutationVersion
    && guard.incomingRevision > (guard.currentRevision ?? -1)
}

/** Applies server normalization while retaining edits dispatched during the save request. */
export function reconcileSavedState(written: AppState, pending: AppState, server: AppState): AppState {
  return pending === written ? server : rebaseAppState(written, pending, server)
}

/** Replays local entity/property changes over a newer remote revision. */
export function rebaseAppState(base: AppState, local: AppState, remote: AppState): AppState {
  const rebased = {
    ...remote,
    event: mergeObject(base.event as unknown as Record<string, unknown>, local.event as unknown as Record<string, unknown>, remote.event as unknown as Record<string, unknown>) as unknown as AppState['event'],
    lastUpdatedAt: local.lastUpdatedAt,
  }
  for (const key of ENTITY_ARRAY_KEYS) {
    ;(rebased as unknown as Record<string, unknown>)[key] = mergeEntities(base[key], local[key], remote[key])
  }
  if (!same(local.deletedSourceSubmissionIds, base.deletedSourceSubmissionIds)) {
    rebased.deletedSourceSubmissionIds = [...new Set([...(remote.deletedSourceSubmissionIds ?? []), ...(local.deletedSourceSubmissionIds ?? [])])]
  }
  return rebased
}
