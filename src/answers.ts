import {defineField, type Rule, type SchemaTypeDefinition} from 'sanity'

import {kindOf, type RuleLevel} from './kinds'
import {TYPE_NAMES} from './names'
import {titleOf, type JevSignals} from './signals'

type Definition = Record<string, unknown>

const isRecord = (value: unknown): value is Definition =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export function signalsOf(definition: unknown): JevSignals | undefined {
  if (!isRecord(definition) || !isRecord(definition.options)) return undefined
  const {jev} = definition.options
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `options.jev` is typed for schema authors via declaration merging
  return isRecord(jev) ? (jev as JevSignals) : undefined
}

/**
 * Adds a field that stores each signal's answer next to every field with `options.jev`.
 * Plugins can't see the Studio's own schema types, so wrap them in `sanity.config`:
 *
 * ```ts
 * schema: {types: withJevAnswers(schemaTypes)}
 * ```
 * @public
 */
export function withJevAnswers<T extends SchemaTypeDefinition>(types: T[]): T[] {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- only `fields` are rewritten
  return types.map((type) => withAnswerFields(type) as T)
}

/** Rewrites `fields` (and inline object members) of a type or field definition, recursively. */
function withAnswerFields(definition: unknown): unknown {
  if (!isRecord(definition)) return definition
  let result = definition

  if (Array.isArray(definition.of)) {
    result = {...result, of: definition.of.map(withAnswerFields)}
  }

  if (Array.isArray(definition.fields)) {
    // Existing field types by name, so answer fields declared already (or added by an earlier
    // call) are kept rather than duplicated.
    const existing = new Map(
      definition.fields.filter(isRecord).map((field) => [field.name, field.type] as const),
    )
    const fields = definition.fields.flatMap((field: unknown) => {
      const rewritten = withAnswerFields(field)
      const signals = signalsOf(field)
      if (!signals || !isRecord(field) || !isRecord(rewritten)) return [rewritten]
      return [withRules(rewritten, signals), ...answerFieldsFor(field, signals, existing)]
    })
    result = {...result, fields}
  }

  return result
}

function answerFieldsFor(field: Definition, signals: JevSignals, existing: Map<unknown, unknown>) {
  return Object.entries(signals).flatMap(([key, signal]) => {
    const type = TYPE_NAMES[signal.type]
    if (existing.get(key) === type) return []
    if (existing.has(key)) {
      throw new Error(
        `Jev: the signal "${key}" on "${String(field.name)}" needs a field called "${key}" to ` +
          'store its answer, but that name is already taken. Rename the signal.',
      )
    }
    existing.set(key, type)
    return [
      defineField({
        name: key,
        title: titleOf(key, signal),
        type,
        // Same group and fieldset as the attached field, so the answer field is mounted (and
        // can store answers) whenever the attached field is. Its type renders nothing.
        group:
          typeof field.group === 'string' || Array.isArray(field.group) ? field.group : undefined,
        fieldset: typeof field.fieldset === 'string' ? field.fieldset : undefined,
      }),
    ]
  })
}

const LEVELS: RuleLevel[] = ['warn', 'require']

/**
 * Adds a validation rule to the attached field for each signal's `warn` and `require`, after
 * the field's own validation. Rules judge the stored answer, so they say nothing until there is
 * one.
 */
function withRules(field: Definition, signals: JevSignals): Definition {
  const checks = Object.entries(signals).flatMap(([key, signal]) =>
    LEVELS.filter((level) => signal[level]).map((level) => ({key, signal, level})),
  )
  if (checks.length === 0) return field

  const own = field.validation
  const validation = (rule: Rule) => {
    const ownRules = (Array.isArray(own) ? own : own ? [own] : []).flatMap((entry: unknown) => {
      const result: unknown = typeof entry === 'function' ? entry(rule) : entry
      return Array.isArray(result) ? result : result ? [result] : []
    })
    const jevRules = checks.map(({key, signal, level}) => {
      const kind = kindOf(signal)
      const title = titleOf(key, signal)
      const custom = rule.custom((_value, context) => {
        const stored = isRecord(context.parent) ? context.parent[key] : undefined
        return kind.check(level, stored, title) ?? true
      })
      return level === 'require' ? custom.error() : custom.warning()
    })
    return [...ownRules, ...jevRules]
  }
  return {...field, validation}
}
