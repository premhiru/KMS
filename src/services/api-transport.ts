import { ApiError } from './api-error'
import { isRecord } from './validation'

export interface ApiTransportOptions {
  baseUrl?: string
  fetch?: typeof fetch
  timeoutMs?: number
  maxGetRetries?: number
  retryBaseDelayMs?: number
  requestId?: () => string
}

export interface TransportRequest<T> {
  path: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown | FormData
  rawBody?: BodyInit
  responseType?: 'json' | 'blob'
  headers?: HeadersInit
  signal?: AbortSignal
  timeoutMs?: number
  parse: (value: unknown, response: Response) => T
}

interface ErrorPayload {
  code?: string
  message?: string
  details?: unknown
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

function randomRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `request-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function endpointBase(baseUrl?: string): URL {
  if (baseUrl) return new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  if (typeof location !== 'undefined') return new URL('/', location.origin)
  throw new Error('ApiTransport requires baseUrl outside a browser.')
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return undefined
  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function errorPayload(value: unknown): ErrorPayload {
  if (!isRecord(value)) return typeof value === 'string' ? { message: value.slice(0, 500) } : {}
  const nested = isRecord(value.error) ? value.error : value
  return {
    code: typeof nested.code === 'string' ? nested.code : undefined,
    message: typeof nested.message === 'string' ? nested.message : undefined,
    details: nested.details,
  }
}

function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get('retry-after')
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined
}

function abortError(requestId: string, method: string, url: string, cause?: unknown): ApiError {
  return new ApiError('Request was aborted.', { code: 'ABORTED', requestId, method, url, cause })
}

function wait(delayMs: number, signal: AbortSignal | undefined, requestId: string, method: string, url: string): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError(requestId, method, url, signal.reason))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, delayMs)
    function done() {
      signal?.removeEventListener('abort', aborted)
      resolve()
    }
    function aborted() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', aborted)
      reject(abortError(requestId, method, url, signal?.reason))
    }
    signal?.addEventListener('abort', aborted, { once: true })
  })
}

export class ApiTransport {
  private readonly baseUrl: URL
  private readonly fetcher: typeof fetch
  private readonly defaultTimeoutMs: number
  private readonly maxGetRetries: number
  private readonly retryBaseDelayMs: number
  private readonly makeRequestId: () => string
  private csrfToken?: string

  constructor(options: ApiTransportOptions = {}) {
    this.baseUrl = endpointBase(options.baseUrl)
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.defaultTimeoutMs = options.timeoutMs ?? 12_000
    this.maxGetRetries = Math.max(0, options.maxGetRetries ?? 2)
    this.retryBaseDelayMs = Math.max(0, options.retryBaseDelayMs ?? 200)
    this.makeRequestId = options.requestId ?? randomRequestId
  }

  setCsrfToken(token: string | undefined): void {
    this.csrfToken = token
  }

  async request<T>(request: TransportRequest<T>): Promise<T> {
    const method = request.method ?? 'GET'
    const url = new URL(request.path.replace(/^\//, ''), this.baseUrl).toString()
    const requestId = this.makeRequestId()
    const maxAttempts = method === 'GET' ? this.maxGetRetries + 1 : 1
    let lastError: ApiError | undefined

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return await this.attempt(request, method, url, requestId, attempt)
      } catch (error) {
        const apiError = error instanceof ApiError ? error : new ApiError('Unexpected API client failure.', {
          code: 'CLIENT_ERROR', requestId, method, url, cause: error,
        })
        lastError = apiError
        if (!apiError.retryable || attempt + 1 >= maxAttempts || request.signal?.aborted) throw apiError
        const responseDelay = isRecord(apiError.details) && typeof apiError.details.retryAfterMs === 'number' ? apiError.details.retryAfterMs : undefined
        const delay = responseDelay ?? this.retryBaseDelayMs * (2 ** attempt)
        await wait(delay, request.signal, requestId, method, url)
      }
    }
    throw lastError ?? new ApiError('API request failed.', { code: 'UNKNOWN', requestId, method, url })
  }

  private async attempt<T>(request: TransportRequest<T>, method: string, url: string, requestId: string, attempt: number): Promise<T> {
    if (request.signal?.aborted) throw abortError(requestId, method, url, request.signal.reason)
    const controller = new AbortController()
    let timedOut = false
    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs
    const timeout = timeoutMs > 0 ? setTimeout(() => {
      timedOut = true
      controller.abort(new DOMException('Request timed out.', 'TimeoutError'))
    }, timeoutMs) : undefined
    const onCallerAbort = () => controller.abort(request.signal?.reason)
    request.signal?.addEventListener('abort', onCallerAbort, { once: true })

    const headers = new Headers(request.headers)
    headers.set('accept', 'application/json')
    headers.set('x-request-id', requestId)
    headers.set('x-client-attempt', String(attempt + 1))
    if (this.csrfToken && method !== 'GET') headers.set('x-csrf-token', this.csrfToken)
    let body: BodyInit | undefined
    if (request.rawBody !== undefined) {
      body = request.rawBody
    } else if (request.body instanceof FormData) {
      body = request.body
    } else if (request.body !== undefined) {
      headers.set('content-type', 'application/json')
      body = JSON.stringify(request.body)
    }

    try {
      const response = await this.fetcher(url, { method, headers, body, credentials: 'include', signal: controller.signal })
      const responseRequestId = response.headers.get('x-request-id') ?? requestId
      const value = response.ok && request.responseType === 'blob' ? await response.blob() : await readBody(response)
      if (!response.ok) {
        const payload = errorPayload(value)
        const retryAfter = retryAfterMs(response)
        throw new ApiError(payload.message ?? `API request failed with status ${response.status}.`, {
          status: response.status,
          code: payload.code ?? `HTTP_${response.status}`,
          requestId: responseRequestId,
          method,
          url,
          retryable: method === 'GET' && RETRYABLE_STATUS.has(response.status),
          details: retryAfter === undefined ? payload.details : { server: payload.details, retryAfterMs: retryAfter },
        })
      }
      try {
        return await request.parse(value, response)
      } catch (error) {
        if (error instanceof ApiError) throw error
        throw new ApiError(error instanceof Error ? error.message : 'API response failed validation.', {
          status: response.status,
          code: 'INVALID_RESPONSE',
          requestId: responseRequestId,
          method,
          url,
          details: error instanceof Error && 'issues' in error ? error.issues : undefined,
          cause: error,
        })
      }
    } catch (error) {
      if (error instanceof ApiError) throw error
      if (timedOut) throw new ApiError(`Request timed out after ${timeoutMs} ms.`, {
        code: 'TIMEOUT', requestId, method, url, retryable: method === 'GET', cause: error,
      })
      if (request.signal?.aborted || controller.signal.aborted) throw abortError(requestId, method, url, error)
      throw new ApiError('Network request failed.', { code: 'NETWORK_ERROR', requestId, method, url, retryable: method === 'GET', cause: error })
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
      request.signal?.removeEventListener('abort', onCallerAbort)
    }
  }
}
