import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import {useFormValue, type Path} from 'sanity'

import {isRecord} from './content'
import {pathKey, useJevForm} from './context'
import {DEFAULT_MODEL, DEFAULT_TAGS, gatewayTransport} from './evaluate'
import type {StoredValue} from './kinds'
import {createLifecycle} from './lifecycle'
import {useKeySource} from './secrets'
import type {JevSignals} from './signals'

export type {SignalView} from './lifecycle'

const NO_ANSWERS: Record<string, unknown> = {}

interface Args {
  signals: JevSignals
  /** Path of the attached field. Answers are stored next to it. */
  path: Path
  /** The attached field's value, flattened to text. */
  state: string
  readOnly: boolean
}

/** Connects the Evaluation lifecycle of one attached field to the Studio's form. */
export function useSignals({signals, path, state, readOnly}: Args) {
  const {config, writers} = useJevForm()
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

  // Each answer is stored next to the attached field, in the field named after its signal.
  const store = useCallback(
    (key: string, value: StoredValue) => {
      const write = writers.get(pathKey([...parentPath, key]))
      if (!write) {
        throw new Error(
          `There is no "${key}" field to store this answer in. Wrap your schema ` +
            'types with withJevAnswers() in sanity.config.',
        )
      }
      write(value)
    },
    [writers, parentPath],
  )

  // Array items have keyed path segments; collapse them so the tag names the field, not the item.
  const tagPath = useMemo(
    () => [
      typeof documentType === 'string' ? documentType : '',
      ...parentPath.map((segment) => (typeof segment === 'string' ? segment : '[]')),
    ],
    [documentType, parentPath],
  )

  const [lifecycle] = useState(() => createLifecycle())
  useLayoutEffect(() => {
    lifecycle.update({
      signals,
      state,
      answers: isRecord(parent) ? parent : NO_ANSWERS,
      transport,
      store,
      model: config.model ?? DEFAULT_MODEL,
      tags: config.tags ?? DEFAULT_TAGS,
      tagPath,
      readOnly,
      debounceMs: config.debounceMs ?? 500,
    })
  })
  useEffect(() => () => lifecycle.dispose(), [lifecycle])
  const snapshot = useSyncExternalStore(lifecycle.subscribe, lifecycle.getSnapshot)

  return {
    ...snapshot,
    setup,
    /** The key is stored with Studio secrets, so editors can set and change it here. */
    keyInSecrets: keySource.from === 'secrets',
    run: (key: string) => lifecycle.run([key]),
    runAll: () => lifecycle.run(),
    localEdit: lifecycle.localEdit,
  }
}
