import {defineField, type Rule, type SchemaTypeDefinition, type SchemaValidationValue} from 'sanity'

import {isDocumentObjectValue} from './content'
import {bindQuestionToKind, RULE_LEVELS} from './kinds'
import {TYPE_NAMES} from './names'
import {getQuestionTitle, type JevQuestions} from './questions'

/** What adding answer fields reads from a schema type, field or array member definition. */
interface Definition {
  name?: string
  type?: string
  options?: {jev?: JevQuestions}
  group?: string | string[]
  fieldset?: string
  validation?: SchemaValidationValue
  of?: Definition[]
  fields?: Definition[]
}

type ValidationBuilder = Extract<SchemaValidationValue, (rule: Rule) => SchemaValidationValue>

/** `options.jev` is typed for schema authors through declaration merging. */
export function getQuestionsFromDefinition(
  definition: Pick<Definition, 'options'>,
): JevQuestions | undefined {
  return definition.options?.jev
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
  return types.map((type) => {
    // SAFETY: every schema type definition is an object with the optional properties of
    // `Definition`; Sanity calls `validation` with a `Rule` whatever its declared rule type.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const definition = type as Definition

    // SAFETY: only `of`, `fields` and `validation` are rewritten, keeping the definition a `T`.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return addAnswerFieldsRecursively(definition) as T
  })
}

/** Rewrites `fields` (and inline object members) of a type or field definition. */
function addAnswerFieldsRecursively(definition: Definition): Definition {
  let result = definition

  if (Array.isArray(definition.of)) {
    result = {...result, of: definition.of.map(addAnswerFieldsRecursively)}
  }

  if (Array.isArray(definition.fields)) {
    // Answer fields declared already (or added by an earlier call) are kept, not duplicated.
    const existingFieldTypesByName = new Map(
      definition.fields.map((field) => [field.name, field.type] as const),
    )

    const fields = definition.fields.flatMap((field) => {
      const rewrittenField = addAnswerFieldsRecursively(field)
      const questions = getQuestionsFromDefinition(field)

      if (!questions) return [rewrittenField]

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
  existingFieldTypesByName: Map<string | undefined, string | undefined>,
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
        group,
        fieldset,
      }),
    ]
  })
}

/** `undefined` → `[]`, a value → `[value]`, an array as it is. */
function toArray(validation: SchemaValidationValue): SchemaValidationValue[] {
  if (Array.isArray(validation)) return validation

  return validation ? [validation] : []
}

const isValidationBuilder = (validation: SchemaValidationValue): validation is ValidationBuilder =>
  typeof validation === 'function'

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
      toArray(isValidationBuilder(entry) ? entry(rule) : entry),
    )

    const jevRules = rulesToValidate.map(({key, question, level}) => {
      const kind = bindQuestionToKind(question)
      const title = getQuestionTitle(key, question)

      const customRule = rule.custom((_value, context) => {
        const stored = isDocumentObjectValue(context.parent) ? context.parent[key] : undefined

        return kind.describeRuleViolation(level, stored, title) ?? true
      })

      return level === 'require' ? customRule.error() : customRule.warning()
    })

    return [...ownRules, ...jevRules]
  }

  return {...attachedField, validation}
}
