export interface ApiErrorOptions {
  status?: number
  code: string
  requestId: string
  method: string
  url: string
  retryable?: boolean
  details?: unknown
  cause?: unknown
}

export class ApiError extends Error {
  readonly status?: number
  readonly code: string
  readonly requestId: string
  readonly method: string
  readonly url: string
  readonly retryable: boolean
  readonly details?: unknown

  constructor(message: string, options: ApiErrorOptions) {
    super(message, { cause: options.cause })
    this.name = 'ApiError'
    this.status = options.status
    this.code = options.code
    this.requestId = options.requestId
    this.method = options.method
    this.url = options.url
    this.retryable = options.retryable ?? false
    this.details = options.details
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

