import {Box, Flex, Stack, Text} from '@sanity/ui'
import {defineArrayMember, defineField, defineType} from 'sanity'

import {isDocumentObject, isString, type DocumentValue} from '../content'
import {AnswerField} from '../context'
import {Bar, capitalize, MUTED_COLOR, NEUTRAL_COLOR} from '../look'
import {TYPE_NAMES} from '../names'
import {
  asRecordOfType,
  evaluationFields,
  numberOrUndefined,
  readEvaluationFields,
  roundToDigits,
  RULE_LEVELS,
  stringOrUndefined,
  throwAnswerKindMismatch,
  type EvaluatedValue,
  type Kind,
  type QuestionBase,
} from './kind'

/** @public */
export interface ChoiceQuestion extends QuestionBase {
  type: 'choice'

  /** Two to 255 options: option name → what it means. */
  criteria: Record<string, string>

  /** Warn unless the answer is one of these options, e.g. `{oneOf: ['formal', 'casual']}`. */
  warn?: ChoiceRule

  /** Block publishing unless the answer is one of these options. */
  require?: ChoiceRule
}

/** Options an answer must be one of. @public */
export interface ChoiceRule {
  oneOf: string[]
}

function findChoiceConfigError(question: ChoiceQuestion): string | undefined {
  const options = Object.keys(question.criteria ?? {})

  if (options.length < 2) return 'A choice question needs at least two options.'

  if (options.length > 255) return 'A choice question allows at most 255 options.'

  for (const level of RULE_LEVELS) {
    const rule = question[level]

    if (!rule) continue

    if (!Array.isArray(rule.oneOf) || rule.oneOf.length === 0) {
      return `\`${level}.oneOf\` must list at least one option.`
    }

    const unknownOption = rule.oneOf.find((option) => !options.includes(option))

    if (unknownOption !== undefined) {
      return `\`${level}.oneOf\` names "${unknownOption}", which is not an option.`
    }
  }

  return undefined
}

/** One option from a named set. @public */
export const choice = (question: Omit<ChoiceQuestion, 'type'>): ChoiceQuestion => ({
  type: 'choice',
  ...question,
})

type ChoiceProbability = {
  _key: string
  _type?: 'jev.choiceProbability'
  option?: string
  probability?: number
}

/** @public */
export type ChoiceValue = EvaluatedValue & {
  _type?: 'jev.choice'
  choice?: string

  /** The model's confidence in this choice (0–1). */
  confidence?: number

  probabilities?: ChoiceProbability[]
}

export const choiceSchemaTypes = [
  // A top-level type rather than an inline array member, so GraphQL can deploy it.
  defineType({
    name: TYPE_NAMES.choiceProbability,
    title: 'Jev choice probability',
    type: 'object',
    fields: [
      defineField({name: 'option', type: 'string'}),
      defineField({name: 'probability', type: 'number'}),
    ],
  }),
  defineType({
    name: TYPE_NAMES.choice,
    title: 'Jev choice',
    type: 'object',
    components: {field: AnswerField},
    fields: [
      defineField({name: 'choice', type: 'string', readOnly: true}),
      defineField({name: 'confidence', type: 'number', readOnly: true}),
      defineField({
        name: 'probabilities',
        type: 'array',
        readOnly: true,
        of: [defineArrayMember({type: TYPE_NAMES.choiceProbability})],
      }),
      ...evaluationFields,
    ],
  }),
]

function readStoredProbabilities(stored: DocumentValue): ChoiceProbability[] {
  if (!Array.isArray(stored)) return []

  return stored.filter(isDocumentObject).map((entry) => ({
    _key: stringOrUndefined(entry._key) ?? '',
    _type: TYPE_NAMES.choiceProbability,
    option: stringOrUndefined(entry.option),
    probability: numberOrUndefined(entry.probability),
  }))
}

export function bindChoice(question: ChoiceQuestion): Kind {
  const configError = findChoiceConfigError(question)

  const gatewayQuestion = {
    type: 'choice',
    instructions: question.instructions,
    criteria: question.criteria,
  } as const

  return {
    typeName: TYPE_NAMES.choice,
    gatewayQuestion: configError ? undefined : gatewayQuestion,
    configError,

    toStoredValue(answer) {
      if (answer.type !== 'choice') return throwAnswerKindMismatch()

      const confidence = answer.confidence ?? answer.probabilities[answer.choice] ?? 0

      return {
        _type: TYPE_NAMES.choice,
        choice: answer.choice,
        confidence: roundToDigits(confidence),
        // Index keys can't collide, unlike keys derived from option names.
        probabilities: Object.keys(question.criteria).map((option, index) => ({
          _key: `option-${index}`,
          _type: TYPE_NAMES.choiceProbability,
          option,
          probability: roundToDigits(answer.probabilities[option] ?? 0),
        })),
      }
    },

    readStoredValue(stored) {
      const record = asRecordOfType(stored, TYPE_NAMES.choice)

      if (!record || !isString(record.choice)) return undefined

      const probabilities = readStoredProbabilities(record.probabilities)
      // `criteria` can be missing from a misconfigured question that still has a stored answer.
      const meaningOfChoice = question.criteria?.[record.choice]

      return {
        value: {
          ...readEvaluationFields(record),
          _type: TYPE_NAMES.choice,
          choice: record.choice,
          confidence: numberOrUndefined(record.confidence),
          probabilities,
        },
        chip: {text: capitalize(record.choice), color: NEUTRAL_COLOR},
        tone: 'default',
        aside: meaningOfChoice ? {note: meaningOfChoice} : undefined,
        body: (
          <ChoiceBody question={question} choice={record.choice} probabilities={probabilities} />
        ),
      }
    },

    describeRuleViolation(level, stored, title) {
      const record = asRecordOfType(stored, TYPE_NAMES.choice)
      const rule = question[level]

      if (!record || !isString(record.choice) || !rule?.oneOf) return undefined

      if (rule.oneOf.includes(record.choice)) return undefined

      const allowedOptions = rule.oneOf.map((option) => `"${option}"`).join(' or ')

      return `${title} is "${record.choice}", not ${allowedOptions}.`
    },
  }
}

function ChoiceBody({
  question,
  choice,
  probabilities,
}: {
  question: ChoiceQuestion
  choice: string
  probabilities: ChoiceProbability[]
}) {
  const options = Object.keys(question.criteria)
  const longestOptionLength = Math.max(...options.map((option) => option.length), 4)
  const optionColumnWidth = `${longestOptionLength + 2}ch`

  return (
    <Stack gap={3}>
      {options.map((option) => {
        const probability = probabilities.find((entry) => entry.option === option)?.probability ?? 0
        const isChosen = option === choice
        const percent = Math.round(probability * 100)

        return (
          <Flex key={option} align="center" gap={3}>
            <Box style={{width: optionColumnWidth}}>
              <Text size={1} weight={isChosen ? 'semibold' : 'regular'} muted={!isChosen}>
                {capitalize(option)}
              </Text>
            </Box>
            <Bar
              fraction={probability}
              color={isChosen ? NEUTRAL_COLOR : MUTED_COLOR}
              label={`${option}: ${percent}%`}
            />
            <Box style={{minWidth: '4ch', textAlign: 'right'}}>
              <Text size={1} muted={!isChosen}>
                {percent}%
              </Text>
            </Box>
          </Flex>
        )
      })}
    </Stack>
  )
}
