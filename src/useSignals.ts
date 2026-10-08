import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useFormValue, type Path} from 'sanity'

import {fingerprint, isRecord} from './content'
import {pathKey, useJevForm} from './context'
import {
  DEFAULT_MODEL,
  DEFAULT_TAGS,
  evaluateQuestion,
  gatewayTransport,
  JevError,
  type JevQuestion,
} from './evaluate'
import {toValue} from './mapping'
import {TYPE_NAMES} from './names'
import {useKeySource} from './secrets'
import {questionOf, titleOf, type JevSignal, type JevSignals} from './signals'
import type {ChoiceValue, NoulValue, ScoreValue} from './types'

type Status =
  | {state: 'idle'}
  | {state: 'loading'}
  | {state: 'error'; message: string; kind?: JevError['kind']}

const IDLE: Status = {state: 'idle'}

export type StoredAnswer = Partial<NoulValue & ScoreValue & ChoiceValue>

export interface SignalState {
  key: string
  signal: JevSignal
  title: string
  /** Why the signal's config can't be asked, if it can't. */
  problem?: string
  value: StoredAnswer | undefined
  stale: boolean
  loading: boolean
  error: string | null
  /** The Gateway rejected the API key on the last evaluation. */
  keyRejected: boolean
}

interface Args {
  signals: JevSignals
  /** Path of the attached field. Answers are stored next to it. */
  path: Path
  /** The attached field's value, flattened to text. */
  state: string
  /** True once the attached field was edited here; only then do signals evaluate on their own. */
  touched: boolean
  readOnly: boolean
}

/**
 * Evaluates the signals attached to one field: shortly after local edits (cancelling requests
 * for content that has since changed) and on demand, storing each answer in its own field.
 */
export function useSignals({signals, path, state, touched, readOnly}: Args) {
  const {config, writers} = useJevForm()
  const model = config.model ?? DEFAULT_MODEL
  const debounceMs = config.debounceMs ?? 500
  const parentPath = useMemo(() => path.slice(0, -1), [path])

  const keySource = useKeySource(config)
  const apiKey = keySource.apiKey
  const transport = useMemo(
    () => config.transport ?? (apiKey ? gatewayTransport(apiKey, config.endpoint) : undefined),
    [config.transport, apiKey, config.endpoint],
  )
  const setup: 'ready' | 'loading' | 'missing' = transport
    ? 'ready'
    : keySource.from === 'secrets' && keySource.loading
      ? 'loading'
      : 'missing'

  const parent = useFormValue(parentPath)
  const documentType = useFormValue(['_type'])
  const empty = state.trim() === ''

  const entries = useMemo(
    () =>
      Object.entries(signals).map(([key, signal]) => {
        const question = questionOf(signal)
        const valid = 'type' in question
        return {
          key,
          signal,
          question: valid ? question : null,
          problem: valid ? undefined : question.problem,
          hash: fingerprint([state, valid ? question : null, model]),
        }
      }),
    [signals, state, model],
  )

  const tags = useMemo(() => {
    // Array items have keyed path segments; collapse them so the tag names the field, not the item.
    const segments = parentPath.map((segment) => (typeof segment === 'string' ? segment : '[]'))
    const prefix = [typeof documentType === 'string' ? documentType : undefined, ...segments]
    return Object.fromEntries(
      entries.map(({key, signal}) => [
        key,
        [
          ...(config.tags ?? DEFAULT_TAGS),
          `${TYPE_NAMES[signal.type]}:${[...prefix, key].filter(Boolean).join('.')}`,
        ],
      ]),
    )
  }, [entries, parentPath, documentType, config.tags])

  const [statuses, setStatuses] = useState<Record<string, Status>>({})
  const setStatus = useCallback((key: string, status: Status) => {
    setStatuses((current) => ({...current, [key]: status}))
  }, [])

  const controllers = useRef(new Map<string, AbortController>())
  const latestHashes = useRef<Record<string, string>>({})
  useEffect(() => {
    latestHashes.current = Object.fromEntries(entries.map(({key, hash}) => [key, hash]))
  }, [entries])

  const canRun = !!transport && !empty && !readOnly

  const run = useCallback(
    (keys: string[]) => {
      if (!transport || empty || readOnly) return
      for (const entry of entries) {
        const question: JevQuestion | null = entry.question
        if (!keys.includes(entry.key) || !question) continue

        controllers.current.get(entry.key)?.abort()
        const controller = new AbortController()
        controllers.current.set(entry.key, controller)
        setStatus(entry.key, {state: 'loading'})

        const evaluate = async () => {
          try {
            const result = await evaluateQuestion({
              transport,
              model,
              state,
              question,
              tags: tags[entry.key],
              signal: controller.signal,
            })
            // Skip answers for content that changed while the request was out.
            if (controller.signal.aborted || latestHashes.current[entry.key] !== entry.hash) return
            const write = writers.get(pathKey([...parentPath, entry.key]))
            if (!write) {
              throw new Error(
                `There is no "${entry.key}" field to store this answer in. Wrap your schema ` +
                  'types with withJevAnswers() in sanity.config.',
              )
            }
            write({
              ...toValue(result.answer, question),
              _type: TYPE_NAMES[entry.signal.type],
              evaluatedAt: new Date().toISOString(),
              model: result.model,
              sourceHash: entry.hash,
            })
            setStatus(entry.key, IDLE)
          } catch (error) {
            if (controller.signal.aborted) return
            setStatus(entry.key, {
              state: 'error',
              message: error instanceof Error ? error.message : String(error),
              kind: error instanceof JevError ? error.kind : undefined,
            })
          }
        }
        void evaluate()
      }
    },
    [transport, empty, readOnly, entries, model, state, tags, writers, parentPath, setStatus],
  )

  const answers = isRecord(parent) ? parent : {}
  const staleKeys = entries
    .filter(({key, question, hash}) => {
      const value = answers[key]
      return question && (!isRecord(value) || value.sourceHash !== hash)
    })
    .map(({key}) => key)

  // Waiting out the debounce counts as working, so the spinner shows from the first keystroke.
  const pending = touched && canRun ? staleKeys : []
  const pendingKey = pending.join('\n')
  useEffect(() => {
    if (!pendingKey) return undefined
    const timeout = setTimeout(() => run(pendingKey.split('\n')), debounceMs)
    return () => clearTimeout(timeout)
  }, [pendingKey, run, debounceMs])

  // New content makes every request still out obsolete.
  useEffect(() => {
    const inFlight = controllers.current
    return () => {
      for (const [key, controller] of inFlight) {
        controller.abort()
        setStatus(key, IDLE)
      }
      inFlight.clear()
    }
  }, [state, setStatus])

  const signalStates: SignalState[] = entries.map(({key, signal, problem}) => {
    const status = statuses[key] ?? IDLE
    const value = answers[key]
    return {
      key,
      signal,
      title: titleOf(key, signal),
      problem,
      value: isRecord(value) ? value : undefined,
      stale: staleKeys.includes(key),
      loading: status.state === 'loading' || (pending.includes(key) && status.state !== 'error'),
      error: status.state === 'error' ? status.message : null,
      keyRejected: status.state === 'error' && status.kind === 'auth',
    }
  })

  return {
    setup,
    /** The key is stored with Studio secrets, so editors can set and change it here. */
    keyInSecrets: keySource.from === 'secrets',
    signals: signalStates,
    canRun,
    empty,
    run,
    runAll: () => run(entries.map(({key}) => key)),
  }
}
