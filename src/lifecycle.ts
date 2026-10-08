import {fingerprint} from './content'
import {evaluateQuestion, JevError, type JevErrorKind, type JevTransport} from './evaluate'
import {kindOf, type Kind, type Reading, type StoredValue} from './kinds'
import {titleOf, type JevSignal, type JevSignals} from './signals'

export interface Clock {
  now(): Date
  /** Calls back after `ms`. Returns a function that cancels the call. */
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
  signals: JevSignals
  /** The attached field's value, flattened to text. */
  state: string
  /** Stored answers, by signal key. */
  answers: Record<string, unknown>
  /** How to reach the Gateway. Without one, nothing is evaluated. */
  transport?: JevTransport
  /** Stores an answer in its signal's answer field. Throws if there is no such field. */
  store: (key: string, value: StoredValue) => void
  model: string
  /** Reporting tags for every request. Each request also gets a tag naming its signal. */
  tags: string[]
  /** Document type and field path the per-signal tag starts with, e.g. `['article', 'seo']`. */
  tagPath: string[]
  readOnly: boolean
  debounceMs: number
}

export interface SignalView {
  key: string
  signal: JevSignal
  title: string
  /** Why the signal's config can't be asked, if it can't. */
  problem?: string
  /** The stored answer, as its kind reads it. Absent when the signal is unanswered. */
  reading?: Reading
  /** The stored answer's state, question or model has changed since it was evaluated. */
  stale: boolean
  /** Waiting to evaluate, or evaluating. */
  loading: boolean
  /** Why the last evaluation failed. Gateway errors also carry their kind, for translation. */
  error: SignalError | null
  /** The Gateway rejected the API key on the last evaluation. */
  keyRejected: boolean
}

export interface SignalError {
  /** In English. Shown as-is for errors that don't come from the Gateway. */
  message: string
  kind?: JevErrorKind
  status?: number
  /** The Gateway's own explanation, if it gave one. */
  detail?: string
}

export interface LifecycleSnapshot {
  signals: SignalView[]
  /** Evaluation is possible: there is a transport, content, and the field is editable. */
  canRun: boolean
  empty: boolean
  /** Any signal is loading. */
  loading: boolean
}

export interface Lifecycle {
  update: (inputs: LifecycleInputs) => void
  /** Call just before handing a local edit to the form, so the resulting state counts as local. */
  localEdit: () => void
  /** Evaluates the given signals (all by default) now, whoever edited the field last. */
  run: (keys?: string[]) => void
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => LifecycleSnapshot
  /** Cancels timers and requests. A later update starts over with the same inputs. */
  dispose: () => void
}

type Status = {state: 'loading'; hash: string} | {state: 'error'; hash: string; error: SignalError}

interface Entry {
  key: string
  signal: JevSignal
  kind: Kind
  title: string
  /** Fingerprint of the state, question and model: what a stored answer must match to be fresh. */
  hash: string
}

const EMPTY: LifecycleSnapshot = {signals: [], canRun: false, empty: true, loading: false}

/**
 * The Evaluation lifecycle of the signals on one attached field. Signals evaluate on their own
 * shortly after a local edit, only while the field's state is one this Studio produced; work for
 * a fingerprint that has since changed is cancelled and its answer dropped.
 */
export function createLifecycle(clock: Clock = realClock): Lifecycle {
  let inputs: LifecycleInputs | undefined
  let entries: Entry[] = []
  /** The state the last local edit produced. Signals only evaluate on their own for it. */
  let localState: string | undefined
  let expectLocal = false

  // Requests, statuses and automatic attempts all belong to one fingerprint per signal.
  const requests = new Map<string, {controller: AbortController; hash: string}>()
  const statuses = new Map<string, Status>()
  const attempted = new Map<string, string>()

  let scheduled: {signature: string; cancel: () => void} | undefined
  let snapshot = EMPTY
  let dirty = true
  const listeners = new Set<() => void>()

  const canRun = (current: LifecycleInputs) =>
    !!current.transport && !current.readOnly && current.state.trim() !== ''

  function update(next: LifecycleInputs) {
    const previous = inputs
    inputs = next

    if (next.state !== previous?.state) {
      localState = expectLocal ? next.state : undefined
      expectLocal = false
    }

    if (
      !previous ||
      next.signals !== previous.signals ||
      next.state !== previous.state ||
      next.model !== previous.model
    ) {
      entries = Object.entries(next.signals).map(([key, signal]) => {
        const kind = kindOf(signal)
        return {
          key,
          signal,
          kind,
          title: titleOf(key, signal),
          hash: fingerprint([next.state, kind.question ?? null, next.model]),
        }
      })
      forgetObsoleteWork()
      dirty = true
    }

    if (
      previous &&
      (canRun(next) !== canRun(previous) ||
        entries.some(({key}) => next.answers[key] !== previous.answers[key]))
    ) {
      dirty = true
    }

    refresh()
  }

  function forgetObsoleteWork() {
    const hashes = new Map(entries.map(({key, hash}) => [key, hash]))
    for (const [key, request] of requests) {
      if (hashes.get(key) !== request.hash) {
        request.controller.abort()
        requests.delete(key)
      }
    }
    for (const [key, status] of statuses) {
      if (hashes.get(key) !== status.hash) statuses.delete(key)
    }
    for (const [key, hash] of attempted) {
      if (hashes.get(key) !== hash) attempted.delete(key)
    }
  }

  /** Signals that would evaluate on their own: unanswered or stale, and not tried yet. */
  function pendingKeys(current: LifecycleInputs, views: SignalView[]): string[] {
    if (!canRun(current) || localState !== current.state) return []
    return entries
      .filter((entry, index) => {
        const view = views[index]
        return (
          entry.kind.question &&
          (!view.reading || view.stale) &&
          attempted.get(entry.key) !== entry.hash
        )
      })
      .map(({key}) => key)
  }

  /** Rebuilds the snapshot and the debounce after anything they depend on changed. */
  function refresh() {
    const current = inputs
    if (!current || !dirty) return
    dirty = false

    const views = entries.map((entry): SignalView => {
      const reading = entry.kind.read(current.answers[entry.key])
      const status = statuses.get(entry.key)
      return {
        key: entry.key,
        signal: entry.signal,
        title: entry.title,
        problem: entry.kind.problem,
        reading,
        stale: !!reading && reading.value.sourceHash !== entry.hash,
        loading: status?.state === 'loading',
        error: status?.state === 'error' ? status.error : null,
        keyRejected: status?.state === 'error' && status.error.kind === 'auth',
      }
    })
    const pending = pendingKeys(current, views)
    // Waiting out the debounce counts as loading, so the spinner shows from the first keystroke.
    for (const view of views) if (pending.includes(view.key)) view.loading = true
    snapshot = {
      signals: views,
      canRun: canRun(current),
      empty: current.state.trim() === '',
      loading: views.some((view) => view.loading),
    }
    schedule(pending, current.debounceMs)
    for (const listener of listeners) listener()
  }

  function schedule(keys: string[], debounceMs: number) {
    const hashes = new Map(entries.map(({key, hash}) => [key, hash]))
    const signature = keys.map((key) => `${key}:${hashes.get(key)}`).join('\n')
    if (signature === scheduled?.signature) return
    scheduled?.cancel()
    scheduled = undefined
    if (!signature) return
    scheduled = {signature, cancel: clock.after(debounceMs, () => run(keys))}
  }

  function setStatus(key: string, status: Status | undefined) {
    if (status) statuses.set(key, status)
    else statuses.delete(key)
    dirty = true
    refresh()
  }

  function run(keys?: string[]) {
    const current = inputs
    if (!current?.transport || !canRun(current)) return
    const {transport, model, state} = current

    for (const entry of entries) {
      const question = entry.kind.question
      if ((keys && !keys.includes(entry.key)) || !question) continue

      requests.get(entry.key)?.controller.abort()
      const controller = new AbortController()
      requests.set(entry.key, {controller, hash: entry.hash})
      attempted.set(entry.key, entry.hash)
      setStatus(entry.key, {state: 'loading', hash: entry.hash})

      const tag = `${entry.kind.typeName}:${[...current.tagPath, entry.key].filter(Boolean).join('.')}`
      const evaluate = async () => {
        try {
          const result = await evaluateQuestion({
            transport,
            model,
            state,
            question,
            tags: [...current.tags, tag],
            signal: controller.signal,
          })
          if (controller.signal.aborted) return
          // The latest store, so a re-registered answer field still gets its answer.
          inputs?.store(entry.key, {
            ...entry.kind.toStored(result.answer),
            evaluatedAt: clock.now().toISOString(),
            model: result.model,
            sourceHash: entry.hash,
          })
          requests.delete(entry.key)
          setStatus(entry.key, undefined)
        } catch (error) {
          if (controller.signal.aborted) return
          requests.delete(entry.key)
          setStatus(entry.key, {
            state: 'error',
            hash: entry.hash,
            error:
              error instanceof JevError
                ? {
                    message: error.message,
                    kind: error.kind,
                    status: error.status,
                    detail: error.detail,
                  }
                : {message: error instanceof Error ? error.message : String(error)},
          })
        }
      }
      void evaluate()
    }
  }

  return {
    update,
    localEdit() {
      expectLocal = true
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
      scheduled?.cancel()
      scheduled = undefined
      // Requests cut short here were never answered, so they may run again.
      for (const [key, request] of requests) {
        request.controller.abort()
        statuses.delete(key)
        attempted.delete(key)
      }
      requests.clear()
      dirty = true
    },
  }
}
