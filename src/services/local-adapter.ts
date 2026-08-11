import type { AppState } from '../domain'
import { ApiError } from './api-error'
import type { AppStateDataSource, RequestOptions, StateWriteOptions, VersionedAppState } from './contracts'

export interface LocalAppStateAccess {
  read(): AppState
  replace(state: AppState): void
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ApiError('Request was aborted.', {
    code: 'ABORTED', requestId: 'local-adapter', method: 'LOCAL', url: 'local://app-state', cause: signal.reason,
  })
}

/** Bridges the same async AppStateDataSource contract to an existing local reducer/store. */
export class LocalAppStateAdapter implements AppStateDataSource {
  private readonly access: LocalAppStateAccess
  private revision: number

  constructor(access: LocalAppStateAccess, initialRevision = 0) {
    this.access = access
    this.revision = initialRevision
  }

  async getState(options: RequestOptions = {}): Promise<VersionedAppState> {
    throwIfAborted(options.signal)
    const state = structuredClone(this.access.read())
    return {
      event: { id: state.event.id, name: state.event.name, slug: state.event.slug, cfpOpen: state.event.cfp?.open ?? false, cfpConfig: (state.event.cfp ?? {}) as unknown as Record<string, unknown> },
      state, revision: this.revision, updatedAt: state.lastUpdatedAt,
    }
  }

  async putState(state: AppState, options: StateWriteOptions): Promise<VersionedAppState> {
    throwIfAborted(options.signal)
    if (options.revision !== this.revision) throw new ApiError('Local state changed since it was read.', {
      status: 409,
      code: 'REVISION_CONFLICT',
      requestId: 'local-adapter',
      method: 'PUT',
      url: 'local://app-state',
      details: { expected: this.revision, received: options.revision },
    })
    const copy = structuredClone(state)
    this.access.replace(copy)
    this.revision += 1
    return {
      event: { id: copy.event.id, name: copy.event.name, slug: copy.event.slug, cfpOpen: copy.event.cfp?.open ?? false, cfpConfig: (copy.event.cfp ?? {}) as unknown as Record<string, unknown> },
      state: structuredClone(copy), revision: this.revision, updatedAt: copy.lastUpdatedAt,
    }
  }
}
