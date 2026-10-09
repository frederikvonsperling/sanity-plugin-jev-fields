import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import {useFormValue, type Path, type PathSegment} from 'sanity'

import {isDocumentObjectValue, isDocumentValue, isString, type DocumentObject} from './content'
import {toPathKey, useJevForm} from './context'
import {DEFAULT_MODEL, DEFAULT_TAGS, resolveTransport} from './evaluate'
import type {StoredValue} from './kinds'
import {createLifecycle} from './lifecycle'
import type {JevQuestions} from './questions'
import {useKeySource, type KeySource} from './secrets'

export type {QuestionView} from './lifecycle'

/** Whether there is a way to reach the Gateway yet. */
export type SetupStatus = 'ready' | 'loading' | 'missing'

const NO_ANSWERS: DocumentObject = {}

const DEFAULT_DEBOUNCE_MS = 500

interface UseQuestionsArgs {
  questions: JevQuestions

  /** Path of the attached field. Answers are stored next to it. */
  path: Path

  /** The attached field's value, flattened to text. */
  state: string

  readOnly: boolean
}

const isFieldName = (segment: PathSegment): segment is string => typeof segment === 'string'

function getSetupStatus(hasTransport: boolean, keySource: KeySource): SetupStatus {
  if (hasTransport) return 'ready'

  if (keySource.from === 'secrets' && keySource.loading) return 'loading'

  return 'missing'
}

/** Connects the Evaluation lifecycle of one attached field to the Studio's form. */
export function useQuestions({questions, path, state, readOnly}: UseQuestionsArgs) {
  const {config, answerWriters} = useJevForm()
  const parentPath = useMemo(() => path.slice(0, -1), [path])

  const keySource = useKeySource(config)
  const {apiKey} = keySource

  const transport = useMemo(
    () => resolveTransport({transport: config.transport, endpoint: config.endpoint}, apiKey),
    [config.transport, config.endpoint, apiKey],
  )

  const parent = useFormValue(parentPath)
  const documentType = useFormValue(['_type'])

  // Each answer is stored next to the attached field, in the field named after its question.
  const store = useCallback(
    (key: string, value: StoredValue) => {
      const writeAnswer = answerWriters.get(toPathKey([...parentPath, key]))

      if (!writeAnswer) {
        throw new Error(
          `There is no "${key}" field to store this answer in. Wrap your schema ` +
            'types with withJevAnswers() in sanity.config.',
        )
      }

      writeAnswer(value)
    },
    [answerWriters, parentPath],
  )

  // Array items have keyed path segments; collapse them so the tag names the field, not the item.
  const tagPath = useMemo(
    () => [
      isDocumentValue(documentType) && isString(documentType) ? documentType : '',
      ...parentPath.map((segment) => (isFieldName(segment) ? segment : '[]')),
    ],
    [documentType, parentPath],
  )

  const [lifecycle] = useState(() => createLifecycle())

  useLayoutEffect(() => {
    lifecycle.update({
      questions,
      state,
      answers: isDocumentObjectValue(parent) ? parent : NO_ANSWERS,
      transport,
      store,
      model: config.model ?? DEFAULT_MODEL,
      tags: config.tags ?? DEFAULT_TAGS,
      tagPath,
      readOnly,
      debounceMs: config.debounceMs ?? DEFAULT_DEBOUNCE_MS,
    })
  })

  useEffect(() => () => lifecycle.dispose(), [lifecycle])

  const snapshot = useSyncExternalStore(lifecycle.subscribe, lifecycle.getSnapshot)

  return {
    ...snapshot,
    setupStatus: getSetupStatus(!!transport, keySource),
    /** Editors can set and change the key here, since it is stored with Studio secrets. */
    isKeyStoredInSecrets: keySource.from === 'secrets',
    evaluateNow: (key: string) => lifecycle.run([key]),
    evaluateAllNow: () => lifecycle.run(),
    localEdit: lifecycle.localEdit,
  }
}
