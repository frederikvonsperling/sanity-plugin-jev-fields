export const DEFAULT_MODEL = 'typesafe-ai/jev'
export const DEFAULT_ENDPOINT = 'https://ai-gateway.vercel.sh/v1/evaluate'
export const DEFAULT_TAGS = ['feature:jev-fields']

// AI Gateway rejects requests with more than 10 tags or tags outside 1–64 characters.
const MAX_TAGS = 10
const MAX_TAG_LENGTH = 64

// Overloaded or rate limited: worth retrying. Everything else fails straight away.
const RETRY_STATUSES = new Set([429, 502, 503, 504, 529])
const DEFAULT_RETRY_DELAYS = [500, 1000, 2000]
const MAX_RETRY_AFTER_MS = 10_000

/** @public */
export type GatewayQuestion =
  | {type: 'boolean'; instructions: string; criteria: {true: string; false: string}}
  | {type: 'score'; instructions: string; criteria: string[]}
  | {type: 'choice'; instructions: string; criteria: Record<string, string>}

/** @public */
export type GatewayAnswer =
  | {type: 'boolean'; probability: number}
  | {type: 'score'; score: number; probabilities: Record<string, number>; confidence?: number}
  | {type: 'choice'; choice: string; probabilities: Record<string, number>; confidence?: number}

/**
 * Body of a request to AI Gateway's `/v1/evaluate`. A `transport` receives it as-is, so a
 * proxy only has to forward it with an `Authorization` header.
 * @public
 */
export interface JevRequest {
  model: string
  state: string | Record<string, string>
  questions: {q: GatewayQuestion}
  providerOptions: {gateway: {tags: string[]}}
}

/**
 * Sends one request and resolves with the HTTP response, which must carry AI Gateway's
 * status and JSON body. Errors and retries are handled by the plugin either way.
 * @public
 */
export type JevTransport = (request: JevRequest, init: {signal?: AbortSignal}) => Promise<Response>

export type JevErrorKind = 'auth' | 'invalid' | 'busy' | 'failed' | 'unexpected'

/**
 * An evaluation that failed. `message` is in English; the Studio shows a translated text built
 * from `kind`, `status` and `detail` (the Gateway's own explanation).
 */
export class JevError extends Error {
  kind: JevErrorKind
  status?: number
  detail?: string

  constructor(kind: JevErrorKind, message: string, status?: number, detail?: string) {
    super(message)
    this.name = 'JevError'
    this.kind = kind
    this.status = status
    this.detail = detail
  }
}

/** The default transport: calls AI Gateway directly from the browser with the API key. */
export function gatewayTransport(apiKey: string, endpoint = DEFAULT_ENDPOINT): JevTransport {
  return (request, {signal}) =>
    fetch(endpoint, {
      method: 'POST',
      signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })
}

interface EvaluateArgs {
  transport: JevTransport
  model: string
  state: string | Record<string, string>
  question: GatewayQuestion
  tags: string[]
  signal?: AbortSignal
  /** Waits before each retry of an overloaded or rate-limited request. */
  retryDelays?: number[]
}

interface EvaluateResponse {
  answers?: {q?: GatewayAnswer}
  model?: string
  error?: {message?: string} | string
}

/**
 * Asks the decision model a single typed question about the state. Resolves with the answer
 * and the model that gave it, as the Gateway names it.
 */
export async function evaluateQuestion({
  transport,
  model,
  state,
  question,
  tags,
  signal,
  retryDelays = DEFAULT_RETRY_DELAYS,
}: EvaluateArgs): Promise<{answer: GatewayAnswer; model: string}> {
  const request: JevRequest = {
    model,
    state,
    questions: {q: question},
    providerOptions: {gateway: {tags: normalizeTags(tags)}},
  }

  const send = async (attempt: number): Promise<{answer: GatewayAnswer; model: string}> => {
    const response = await transport(request, {signal})

    const body: EvaluateResponse = await response.json().catch(() => ({}))

    if (response.ok) {
      const answer = body.answers?.q

      if (answer?.type !== question.type) {
        throw new JevError('unexpected', 'AI Gateway returned no answer.', response.status)
      }
      return {answer, model: body.model ?? model}
    }

    if (RETRY_STATUSES.has(response.status) && attempt < retryDelays.length) {
      await sleep(retryDelay(response, retryDelays[attempt]), signal)
      return send(attempt + 1)
    }
    throw toError(response.status, errorMessage(body))
  }

  return send(0)
}

function toError(status: number, message: string | undefined): JevError {
  if (status === 401 || status === 403) {
    return new JevError(
      'auth',
      'AI Gateway rejected the API key. Check the key in the Jev tool.',
      status,
      message,
    )
  }
  if (status === 400 || status === 422) {
    return new JevError(
      'invalid',
      `AI Gateway rejected the question: ${message ?? status}`,
      status,
      message,
    )
  }
  if (RETRY_STATUSES.has(status)) {
    return new JevError('busy', 'AI Gateway is busy. Try again in a moment.', status, message)
  }
  const suffix = message ? `: ${message}` : ''
  return new JevError('failed', `AI Gateway responded with ${status}${suffix}`, status, message)
}

function errorMessage(body: EvaluateResponse): string | undefined {
  return (typeof body.error === 'string' ? body.error : body.error?.message) || undefined
}

/** Honours a short `Retry-After` (in seconds) when it asks for longer than our own backoff. */
function retryDelay(response: Response, backoff: number): number {
  const seconds = Number(response.headers.get('retry-after'))
  if (!Number.isFinite(seconds) || seconds <= 0) return backoff
  return Math.min(Math.max(backoff, seconds * 1000), MAX_RETRY_AFTER_MS)
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const timeout = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout)
        reject(signal.reason)
      },
      {once: true},
    )
  })
}

export function normalizeTags(tags: string[]): string[] {
  const cleaned = tags.map((tag) => tag.trim().slice(0, MAX_TAG_LENGTH)).filter(Boolean)
  return [...new Set(cleaned)].slice(0, MAX_TAGS)
}
