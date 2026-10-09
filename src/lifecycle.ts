import {fingerprint} from './content'
import {evaluateQuestion, JevError, type JevErrorKind, type JevTransport} from './evaluate'
import {bindQuestionToKind, type Kind, type Reading, type StoredValue} from './kinds'
import {getQuestionTitle, type JevQuestion, type JevQuestions} from './questions'

export interface Clock {
  now(): Date

  /** Returns a function that cancels the call. */
  after(ms: number, callback: () => void): () => void
}

const realClock: Clock = {
  now: () => new Date(),
  after(ms, callback) {
    const timeout = setTimeout(callback, ms)

    return () => clearTimeout(timeout)
  },
}

/** Everything the lifecycle reads about one attached field. Passed whole on every update. */
export interface LifecycleInputs {
  questions: JevQuestions

  /** The attached field's value, flattened to text. */
  state: string

  /** Stored answers, by question key. */
  answers: Record<string, unknown>

  /** Without one, nothing is evaluated. */
  transport?: JevTransport

  /** Stores an answer in its question's answer field. Throws if there is no such field. */
  store: (key: string, value: StoredValue) => void

  model: string

  /** Reporting tags for every request. Each request also gets a tag naming its question. */
  tags: string[]

  /** Document type and field path the per-question tag starts with, e.g. `['article', 'seo']`. */
  tagPath: string[]

  readOnly: boolean

  debounceMs: number
}

export interface QuestionView {
  key: string

  question: JevQuestion

  title: string

  /** Why the question's config can't be asked, if it can't. */
  configError?: string

  /** Absent when the question is unanswered. */
  reading?: Reading

  /** The stored answer's state, question or model has changed since it was evaluated. */
  stale: boolean

  /** Waiting to evaluate, or evaluating. */
  loading: boolean

  /** Gateway errors also carry their kind, for translation. */
  error: QuestionError | null

  /** The Gateway rejected the API key on the last evaluation. */
  keyRejected: boolean
}

export interface QuestionError {
  /** In English. Shown as-is for errors that don't come from the Gateway. */
  message: string

  kind?: JevErrorKind

  status?: number

  /** The Gateway's own explanation, if it gave one. */
  detail?: string
}

export function toQuestionError(error: unknown): QuestionError {
  if (error instanceof JevError) {
    return {message: error.message, kind: error.kind, status: error.status, detail: error.detail}
  }

  return {message: error instanceof Error ? error.message : String(error)}
}

export interface LifecycleSnapshot {
  questions: QuestionView[]

  /** There is a transport and content, and the field is editable. */
  canRun: boolean

  empty: boolean

  /** Any question is loading. */
  loading: boolean
}

export interface Lifecycle {
  update: (inputs: LifecycleInputs) => void

  /** Call just before handing a local edit to the form, so the resulting state counts as local. */
  localEdit: () => void

  /** Evaluates the given questions (all by default) now, whoever edited the field last. */
  run: (keys?: string[]) => void

  subscribe: (listener: () => void) => () => void

  getSnapshot: () => LifecycleSnapshot

  /** Cancels timers and requests. A later update starts over with the same inputs. */
  dispose: () => void
}

type EvaluationStatus =
  | {state: 'loading'; hash: string}
  | {state: 'error'; hash: string; error: QuestionError}

interface BoundQuestion {
  key: string

  question: JevQuestion

  kind: Kind

  title: string

  /** Fingerprint of the state, question and model: what a stored answer must match to be fresh. */
  hash: string
}

const EMPTY_SNAPSHOT: LifecycleSnapshot = {
  questions: [],
  canRun: false,
  empty: true,
  loading: false,
}

/**
 * The Evaluation lifecycle of the questions on one attached field. Questions evaluate on their own
 * shortly after a local edit, only while the field's state is one this Studio produced; work for
 * a fingerprint that has since changed is cancelled and its answer dropped.
 */
export function createLifecycle(clock: Clock = realClock): Lifecycle {
  let inputs: LifecycleInputs | undefined
  let boundQuestions: BoundQuestion[] = []

  /** Questions only evaluate on their own for this state. */
  let stateFromLastLocalEdit: string | undefined
  let nextStateIsFromLocalEdit = false

  // Requests, statuses and automatic attempts all belong to one fingerprint per question.
  const requestsInFlight = new Map<string, {controller: AbortController; hash: string}>()
  const evaluationStatuses = new Map<string, EvaluationStatus>()
  const lastAttemptedHashes = new Map<string, string>()

  let scheduledEvaluation: {signature: string; cancel: () => void} | undefined
  let snapshot = EMPTY_SNAPSHOT
  let snapshotIsOutdated = true
  const listeners = new Set<() => void>()

  const canRun = (current: LifecycleInputs) =>
    !!current.transport && !current.readOnly && current.state.trim() !== ''

  const getHashesByKey = () => new Map(boundQuestions.map(({key, hash}) => [key, hash]))

  function update(next: LifecycleInputs) {
    const previous = inputs
    inputs = next

    if (next.state !== previous?.state) {
      stateFromLastLocalEdit = nextStateIsFromLocalEdit ? next.state : undefined
      nextStateIsFromLocalEdit = false
    }

    const questionsNeedRebinding =
      !previous ||
      next.questions !== previous.questions ||
      next.state !== previous.state ||
      next.model !== previous.model

    if (questionsNeedRebinding) {
      boundQuestions = Object.entries(next.questions).map(([key, question]) => {
        const kind = bindQuestionToKind(question)

        return {
          key,
          question,
          kind,
          title: getQuestionTitle(key, question),
          hash: fingerprint([next.state, kind.gatewayQuestion ?? null, next.model]),
        }
      })

      cancelWorkForChangedHashes()
      snapshotIsOutdated = true
    }

    const canRunChanged = previous && canRun(next) !== canRun(previous)

    const answersChanged =
      previous && boundQuestions.some(({key}) => next.answers[key] !== previous.answers[key])

    if (canRunChanged || answersChanged) {
      snapshotIsOutdated = true
    }

    rebuildSnapshotIfOutdated()
  }

  function cancelWorkForChangedHashes() {
    const hashesByKey = getHashesByKey()

    for (const [key, request] of requestsInFlight) {
      if (hashesByKey.get(key) !== request.hash) {
        request.controller.abort()
        requestsInFlight.delete(key)
      }
    }

    for (const [key, status] of evaluationStatuses) {
      if (hashesByKey.get(key) !== status.hash) evaluationStatuses.delete(key)
    }

    for (const [key, hash] of lastAttemptedHashes) {
      if (hashesByKey.get(key) !== hash) lastAttemptedHashes.delete(key)
    }
  }

  /** Unanswered or stale, and not tried yet for the current fingerprint. */
  function getKeysToEvaluateAutomatically(
    current: LifecycleInputs,
    views: QuestionView[],
  ): string[] {
    if (!canRun(current) || stateFromLastLocalEdit !== current.state) return []

    return boundQuestions
      .filter((boundQuestion, index) => {
        const view = views[index]
        const needsAnswer = !view.reading || view.stale
        const alreadyAttempted = lastAttemptedHashes.get(boundQuestion.key) === boundQuestion.hash

        return boundQuestion.kind.gatewayQuestion && needsAnswer && !alreadyAttempted
      })
      .map(({key}) => key)
  }

  function rebuildSnapshotIfOutdated() {
    const current = inputs

    if (!current || !snapshotIsOutdated) return

    snapshotIsOutdated = false

    const views = boundQuestions.map((boundQuestion): QuestionView => {
      const reading = boundQuestion.kind.readStoredValue(current.answers[boundQuestion.key])
      const status = evaluationStatuses.get(boundQuestion.key)

      return {
        key: boundQuestion.key,
        question: boundQuestion.question,
        title: boundQuestion.title,
        configError: boundQuestion.kind.configError,
        reading,
        stale: !!reading && reading.value.sourceHash !== boundQuestion.hash,
        loading: status?.state === 'loading',
        error: status?.state === 'error' ? status.error : null,
        keyRejected: status?.state === 'error' && status.error.kind === 'auth',
      }
    })

    const keysToEvaluate = getKeysToEvaluateAutomatically(current, views)

    // Waiting out the debounce counts as loading, so the spinner shows from the first keystroke.
    for (const view of views) {
      if (keysToEvaluate.includes(view.key)) view.loading = true
    }

    snapshot = {
      questions: views,
      canRun: canRun(current),
      empty: current.state.trim() === '',
      loading: views.some((view) => view.loading),
    }

    scheduleEvaluationAfterDebounce(keysToEvaluate, current.debounceMs)

    for (const listener of listeners) listener()
  }

  function scheduleEvaluationAfterDebounce(keys: string[], debounceMs: number) {
    const hashesByKey = getHashesByKey()
    const signature = keys.map((key) => `${key}:${hashesByKey.get(key)}`).join('\n')

    if (signature === scheduledEvaluation?.signature) return

    scheduledEvaluation?.cancel()
    scheduledEvaluation = undefined

    if (!signature) return

    scheduledEvaluation = {signature, cancel: clock.after(debounceMs, () => run(keys))}
  }

  function setEvaluationStatus(key: string, status: EvaluationStatus | undefined) {
    if (status) evaluationStatuses.set(key, status)
    else evaluationStatuses.delete(key)

    snapshotIsOutdated = true
    rebuildSnapshotIfOutdated()
  }

  function run(keys?: string[]) {
    const current = inputs

    if (!current?.transport || !canRun(current)) return

    const {transport, model, state} = current

    for (const boundQuestion of boundQuestions) {
      const {key, kind, hash} = boundQuestion
      const gatewayQuestion = kind.gatewayQuestion

      if ((keys && !keys.includes(key)) || !gatewayQuestion) continue

      requestsInFlight.get(key)?.controller.abort()

      const controller = new AbortController()
      requestsInFlight.set(key, {controller, hash})
      lastAttemptedHashes.set(key, hash)
      setEvaluationStatus(key, {state: 'loading', hash})

      const fieldPath = [...current.tagPath, key].filter(Boolean).join('.')
      const questionTag = `${kind.typeName}:${fieldPath}`

      const evaluateAndStore = async () => {
        try {
          const result = await evaluateQuestion({
            transport,
            model,
            state,
            question: gatewayQuestion,
            tags: [...current.tags, questionTag],
            signal: controller.signal,
          })

          if (controller.signal.aborted) return

          // The latest store, so a re-registered answer field still gets its answer.
          inputs?.store(key, {
            ...kind.toStoredValue(result.answer),
            evaluatedAt: clock.now().toISOString(),
            model: result.model,
            sourceHash: hash,
          })

          requestsInFlight.delete(key)
          setEvaluationStatus(key, undefined)
        } catch (error) {
          if (controller.signal.aborted) return

          requestsInFlight.delete(key)
          setEvaluationStatus(key, {state: 'error', hash, error: toQuestionError(error)})
        }
      }

      void evaluateAndStore()
    }
  }

  return {
    update,

    localEdit() {
      nextStateIsFromLocalEdit = true
    },

    run,

    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },

    getSnapshot: () => snapshot,

    dispose() {
      scheduledEvaluation?.cancel()
      scheduledEvaluation = undefined

      // Requests cut short here were never answered, so they may run again.
      for (const [key, request] of requestsInFlight) {
        request.controller.abort()
        evaluationStatuses.delete(key)
        lastAttemptedHashes.delete(key)
      }

      requestsInFlight.clear()
      snapshotIsOutdated = true
    },
  }
}
