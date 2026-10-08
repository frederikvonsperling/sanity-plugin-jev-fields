import {Box, Flex, Stack, Text} from '@sanity/ui'
import {defineArrayMember, defineField, defineType} from 'sanity'

import {isRecord} from '../content'
import {AnswerField} from '../context'
import {Bar, capitalize, MUTED_COLOR, NEUTRAL_COLOR} from '../look'
import {TYPE_NAMES} from '../names'
import {
  bookkeepingFields,
  bookkeepingOf,
  mismatch,
  number,
  round,
  storedOf,
  text,
  type EvaluatedValue,
  type Kind,
  type SignalBase,
} from './kind'

/** @public */
export interface ChoiceSignal extends SignalBase {
  type: 'choice'
  /** At least two options: option name → what it means. */
  criteria: Record<string, string>
}

/** One option from a named set. @public */
export const choice = (signal: Omit<ChoiceSignal, 'type'>): ChoiceSignal => ({
  type: 'choice',
  ...signal,
})

interface ChoiceProbability {
  _key: string
  _type?: 'jev.choiceProbability'
  option?: string
  probability?: number
}

/** @public */
export interface ChoiceValue extends EvaluatedValue {
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
      ...bookkeepingFields,
    ],
  }),
]

export function bindChoice(signal: ChoiceSignal): Kind {
  const criteria = signal.criteria ?? {}
  const askable = Object.keys(criteria).length >= 2
  return {
    typeName: TYPE_NAMES.choice,
    question: askable
      ? {type: 'choice', instructions: signal.instructions, criteria: signal.criteria}
      : undefined,
    problem: askable ? undefined : 'A choice signal needs at least two options.',

    toStored(answer) {
      if (answer.type !== 'choice') return mismatch()
      return {
        _type: TYPE_NAMES.choice,
        choice: answer.choice,
        confidence: round(answer.confidence ?? answer.probabilities[answer.choice] ?? 0),
        // Index keys can't collide, unlike keys derived from option names.
        probabilities: Object.keys(criteria).map((option, index) => ({
          _key: `option-${index}`,
          _type: TYPE_NAMES.choiceProbability,
          option,
          probability: round(answer.probabilities[option] ?? 0),
        })),
      }
    },

    read(stored) {
      const record = storedOf(stored, TYPE_NAMES.choice)
      if (!record || typeof record.choice !== 'string') return undefined
      const probabilities = Array.isArray(record.probabilities)
        ? record.probabilities.filter(isRecord).map((entry): ChoiceProbability => ({
            _key: String(entry._key),
            _type: TYPE_NAMES.choiceProbability,
            option: text(entry.option),
            probability: number(entry.probability),
          }))
        : []
      const meaning = criteria[record.choice]
      return {
        value: {
          ...bookkeepingOf(record),
          _type: TYPE_NAMES.choice,
          choice: record.choice,
          confidence: number(record.confidence),
          probabilities,
        },
        chip: {text: capitalize(record.choice), color: NEUTRAL_COLOR},
        tone: 'default',
        aside: meaning ? {note: meaning} : undefined,
        body: <ChoiceBody signal={signal} choice={record.choice} probabilities={probabilities} />,
      }
    },
  }
}

function ChoiceBody({
  signal,
  choice,
  probabilities,
}: {
  signal: ChoiceSignal
  choice: string
  probabilities: ChoiceProbability[]
}) {
  const options = Object.keys(signal.criteria)
  const nameWidth = `${Math.max(...options.map((name) => name.length), 4) + 2}ch`
  return (
    <Stack gap={3}>
      {options.map((option) => {
        const probability = probabilities.find((entry) => entry.option === option)?.probability ?? 0
        const winner = option === choice
        const percent = Math.round(probability * 100)
        return (
          <Flex key={option} align="center" gap={3}>
            <Box style={{width: nameWidth}}>
              <Text size={1} weight={winner ? 'semibold' : 'regular'} muted={!winner}>
                {capitalize(option)}
              </Text>
            </Box>
            <Bar
              fraction={probability}
              color={winner ? NEUTRAL_COLOR : MUTED_COLOR}
              label={`${option}: ${percent}%`}
            />
            <Box style={{minWidth: '4ch', textAlign: 'right'}}>
              <Text size={1} muted={!winner}>
                {percent}%
              </Text>
            </Box>
          </Flex>
        )
      })}
    </Stack>
  )
}
