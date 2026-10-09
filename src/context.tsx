import {createContext, useContext, useEffect, useMemo, useState, type ReactNode} from 'react'
import {set, type FieldProps, type Path} from 'sanity'

import type {JevPluginConfig} from './types'

type AnswerWriter = (value: unknown) => void

interface JevFormContextValue {
  config: JevPluginConfig

  /** By path. Each answer field registers its own `onChange` as its writer. */
  answerWriters: Map<string, AnswerWriter>
}

const JevFormContext = createContext<JevFormContextValue | null>(null)

export const toPathKey = (path: Path) => JSON.stringify(path)

/** Wraps a document form, so attached fields can reach the plugin config and answer fields. */
export function JevFormProvider({
  config,
  children,
}: {
  config: JevPluginConfig
  children: ReactNode
}) {
  const [answerWriters] = useState(() => new Map<string, AnswerWriter>())
  const value = useMemo(() => ({config, answerWriters}), [config, answerWriters])

  return <JevFormContext.Provider value={value}>{children}</JevFormContext.Provider>
}

export function useJevForm(): JevFormContextValue {
  const context = useContext(JevFormContext)

  if (!context) throw new Error('Jev questions need the jev() plugin in sanity.config.')

  return context
}

/**
 * Field component for answer fields: shows nothing (answers appear on the attached field) and
 * registers the field's own `onChange`, so the attached field can store answers through it.
 */
export function AnswerField(props: FieldProps) {
  const {answerWriters} = useJevForm()
  const pathKey = toPathKey(props.path)
  const onChange = props.inputProps.onChange

  useEffect(() => {
    answerWriters.set(pathKey, (value) => onChange(set(value)))

    return () => {
      answerWriters.delete(pathKey)
    }
  }, [answerWriters, pathKey, onChange])

  return null
}
