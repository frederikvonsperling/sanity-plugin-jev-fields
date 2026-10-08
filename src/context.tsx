import {createContext, useContext, useEffect, useMemo, useState, type ReactNode} from 'react'
import {set, type FieldProps, type Path} from 'sanity'

import type {JevPluginConfig} from './types'

type Write = (value: unknown) => void

interface JevFormContext {
  config: JevPluginConfig
  /** Writers for answer fields, by path. Each answer field registers its own `onChange`. */
  writers: Map<string, Write>
}

const Context = createContext<JevFormContext | null>(null)

export const pathKey = (path: Path) => JSON.stringify(path)

/** Wraps a document form, so attached fields can reach the plugin config and answer fields. */
export function JevFormProvider({
  config,
  children,
}: {
  config: JevPluginConfig
  children: ReactNode
}) {
  const [writers] = useState(() => new Map<string, Write>())
  const value = useMemo(() => ({config, writers}), [config, writers])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useJevForm(): JevFormContext {
  const context = useContext(Context)
  if (!context) throw new Error('Jev questions need the jev() plugin in sanity.config.')
  return context
}

/**
 * Field component for answer fields: shows nothing (answers appear on the attached field) and
 * registers the field's own `onChange`, so the attached field can store answers through it.
 */
export function AnswerField(props: FieldProps) {
  const {writers} = useJevForm()
  const key = pathKey(props.path)
  const onChange = props.inputProps.onChange
  useEffect(() => {
    writers.set(key, (value) => onChange(set(value)))
    return () => {
      writers.delete(key)
    }
  }, [writers, key, onChange])
  return null
}
