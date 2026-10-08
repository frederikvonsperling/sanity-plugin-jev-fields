import {defineField, type Rule, type SchemaTypeDefinition} from 'sanity'

import {kindOf, type RuleLevel} from './kinds'
import {TYPE_NAMES} from './names'
import {titleOf, type JevQuestions} from './questions'

type Definition = Record<string, unknown>

const isRecord = (value: unknown): value is Definition =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export function questionsOf(definition: unknown): JevQuestions | undefined {
  if (!isRecord(definition) || !isRecord(definition.options)) return undefined
  const {jev} = definition.options
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `options.jev` is typed for schema authors via declaration merging
  return isRecord(jev) ? (jev as JevQuestions) : undefined
}

/**
 * Adds a field that stores each question's answer next to every field with `options.jev`.
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
      const questions = questionsOf(field)
      if (!questions || !isRecord(field) || !isRecord(rewritten)) return [rewritten]
      return [withRules(rewritten, questions), ...answerFieldsFor(field, questions, existing)]
    })
    result = {...result, fields}
  }

  return result
}

function answerFieldsFor(
  field: Definition,
  questions: JevQuestions,
  existing: Map<unknown, unknown>,
) {
  return Object.entries(questions).flatMap(([key, question]) => {
    const type = TYPE_NAMES[question.type]
    if (existing.get(key) === type) return []
    if (existing.has(key)) {
      throw new Error(
        `Jev: the question "${key}" on "${String(field.name)}" needs a field called "${key}" to ` +
          'store its answer, but that name is already taken. Rename the question.',
      )
    }
    existing.set(key, type)
    return [
      defineField({
        name: key,
        title: titleOf(key, question),
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
 * Adds a validation rule to the attached field for each question's `warn` and `require`, after
 * the field's own validation. Rules judge the stored answer, so they say nothing until there is
 * one.
 */
function withRules(field: Definition, questions: JevQuestions): Definition {
  const checks = Object.entries(questions).flatMap(([key, question]) =>
    LEVELS.filter((level) => question[level]).map((level) => ({key, question, level})),
  )
  if (checks.length === 0) return field

  const own = field.validation
  const validation = (rule: Rule) => {
    const ownRules = (Array.isArray(own) ? own : own ? [own] : []).flatMap((entry: unknown) => {
      const result: unknown = typeof entry === 'function' ? entry(rule) : entry
      return Array.isArray(result) ? result : result ? [result] : []
    })
    const jevRules = checks.map(({key, question, level}) => {
      const kind = kindOf(question)
      const title = titleOf(key, question)
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
