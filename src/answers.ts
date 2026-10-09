import {defineField, type Rule, type SchemaTypeDefinition} from 'sanity'

import {isRecord} from './content'
import {bindQuestionToKind, RULE_LEVELS} from './kinds'
import {TYPE_NAMES} from './names'
import {getQuestionTitle, type JevQuestions} from './questions'

type Definition = Record<string, unknown>

export function getQuestionsFromDefinition(definition: unknown): JevQuestions | undefined {
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
  return types.map((type) => addAnswerFieldsRecursively(type) as T)
}

/** Rewrites `fields` (and inline object members) of a type or field definition. */
function addAnswerFieldsRecursively(definition: unknown): unknown {
  if (!isRecord(definition)) return definition

  let result = definition

  if (Array.isArray(definition.of)) {
    result = {...result, of: definition.of.map(addAnswerFieldsRecursively)}
  }

  if (Array.isArray(definition.fields)) {
    // Answer fields declared already (or added by an earlier call) are kept, not duplicated.
    const existingFieldTypesByName = new Map(
      definition.fields.filter(isRecord).map((field) => [field.name, field.type] as const),
    )

    const fields = definition.fields.flatMap((field: unknown) => {
      const rewrittenField = addAnswerFieldsRecursively(field)
      const questions = getQuestionsFromDefinition(field)

      if (!questions || !isRecord(field) || !isRecord(rewrittenField)) return [rewrittenField]

      return [
        addRuleValidation(rewrittenField, questions),
        ...createAnswerFields(field, questions, existingFieldTypesByName),
      ]
    })

    result = {...result, fields}
  }

  return result
}

function createAnswerFields(
  attachedField: Definition,
  questions: JevQuestions,
  existingFieldTypesByName: Map<unknown, unknown>,
) {
  return Object.entries(questions).flatMap(([key, question]) => {
    const answerType = TYPE_NAMES[question.type]

    if (existingFieldTypesByName.get(key) === answerType) return []

    if (existingFieldTypesByName.has(key)) {
      throw new Error(
        `Jev: the question "${key}" on "${String(attachedField.name)}" needs a field called "${key}" to ` +
          'store its answer, but that name is already taken. Rename the question.',
      )
    }

    existingFieldTypesByName.set(key, answerType)

    const {group, fieldset} = attachedField

    return [
      defineField({
        name: key,
        title: getQuestionTitle(key, question),
        type: answerType,
        // Same group and fieldset as the attached field, so the answer field is mounted (and
        // can store answers) whenever the attached field is. Its type renders nothing.
        group: typeof group === 'string' || Array.isArray(group) ? group : undefined,
        fieldset: typeof fieldset === 'string' ? fieldset : undefined,
      }),
    ]
  })
}

/** `undefined` → `[]`, a value → `[value]`, an array as it is. */
function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value

  return value ? [value] : []
}

/**
 * Adds a validation rule to the attached field for each question's `warn` and `require`, after
 * the field's own validation. Rules judge the stored answer, so they say nothing until there is
 * one.
 */
function addRuleValidation(attachedField: Definition, questions: JevQuestions): Definition {
  const rulesToValidate = Object.entries(questions).flatMap(([key, question]) =>
    RULE_LEVELS.filter((level) => question[level]).map((level) => ({key, question, level})),
  )

  if (rulesToValidate.length === 0) return attachedField

  const ownValidation = attachedField.validation

  const validation = (rule: Rule) => {
    const ownRules = toArray(ownValidation).flatMap((entry) =>
      toArray(typeof entry === 'function' ? entry(rule) : entry),
    )

    const jevRules = rulesToValidate.map(({key, question, level}) => {
      const kind = bindQuestionToKind(question)
      const title = getQuestionTitle(key, question)

      const customRule = rule.custom((_value, context) => {
        const stored = isRecord(context.parent) ? context.parent[key] : undefined

        return kind.describeRuleViolation(level, stored, title) ?? true
      })

      return level === 'require' ? customRule.error() : customRule.warning()
    })

    return [...ownRules, ...jevRules]
  }

  return {...attachedField, validation}
}
