import {Flex, Stack, Text} from '@sanity/ui'
import {defineField, defineType, useTranslation} from 'sanity'

import {AnswerField} from '../context'
import {JEV_NAMESPACE} from '../i18n'
import {Bar, trafficColor, trafficTone, type Tone} from '../look'
import {TYPE_NAMES} from '../names'
import {
  bookkeepingFields,
  bookkeepingOf,
  mismatch,
  rangeRuleProblem,
  rangeViolation,
  round,
  storedOf,
  type EvaluatedValue,
  type Kind,
  type Level,
  type RangeRule,
  type QuestionBase,
} from './kind'

/** @public */
export interface NoulQuestion extends QuestionBase {
  type: 'noul'
  /** What a "yes" means. Shown when the probability is 50% or higher. */
  true: string
  /** What a "no" means. Shown when the probability is below 50%. */
  false: string
  /** Short phrase after the percentage, e.g. "likely to read easily". */
  label?: string
  /** Warn when the probability is outside these bounds (0–1), e.g. `{atLeast: 0.6}`. */
  warn?: RangeRule
  /** Block publishing when the probability is outside these bounds (0–1). */
  require?: RangeRule
}

/** A yes/no question: the chip shows the probability that the answer is yes. @public */
export const noul = (question: Omit<NoulQuestion, 'type'>): NoulQuestion => ({
  type: 'noul',
  ...question,
})

/** @public */
export interface NoulValue extends EvaluatedValue {
  _type?: 'jev.noul'
  /** Probability (0–1) that the answer is yes. */
  probability?: number
}

export const noulSchemaTypes = [
  defineType({
    name: TYPE_NAMES.noul,
    title: 'Jev yes/no',
    type: 'object',
    components: {field: AnswerField},
    fields: [
      defineField({name: 'probability', type: 'number', readOnly: true}),
      ...bookkeepingFields,
    ],
  }),
]

const LEVELS: Partial<Record<Tone, Level>> = {
  critical: 'low',
  caution: 'medium',
  positive: 'high',
}

export function bindNoul(question: NoulQuestion): Kind {
  const problem =
    !question.true?.trim() || !question.false?.trim()
      ? 'A noul question needs both `true` and `false` text.'
      : rangeRuleProblem(question, 0, 1)

  return {
    typeName: TYPE_NAMES.noul,
    // Jev's API and the Gateway call a noul "boolean".
    gatewayQuestion: !problem
      ? {
          type: 'boolean',
          instructions: question.instructions,
          criteria: {true: question.true, false: question.false},
        }
      : undefined,
    problem,

    toStored(answer) {
      if (answer.type !== 'boolean') return mismatch()
      return {_type: TYPE_NAMES.noul, probability: round(answer.probability)}
    },

    read(stored) {
      const record = storedOf(stored, TYPE_NAMES.noul)
      if (!record || typeof record.probability !== 'number') return undefined
      const probability = record.probability
      const tone = trafficTone(probability)
      return {
        value: {...bookkeepingOf(record), _type: TYPE_NAMES.noul, probability},
        chip: {text: `${Math.round(probability * 100)}%`, color: trafficColor(probability)},
        tone: tone === 'positive' ? 'default' : tone,
        aside: {level: LEVELS[tone] ?? 'medium', tone},
        body: <NoulBody question={question} probability={probability} />,
      }
    },

    check(level, stored, title) {
      const record = storedOf(stored, TYPE_NAMES.noul)
      if (!record || typeof record.probability !== 'number') return undefined
      const percent = (value: number) => `${Math.round(value * 100)}%`
      const broken = rangeViolation(record.probability, question[level], percent)
      return broken && `${title} is ${percent(record.probability)}, ${broken}.`
    },
  }
}

function NoulBody({question, probability}: {question: NoulQuestion; probability: number}) {
  const {t} = useTranslation(JEV_NAMESPACE)
  const percent = Math.round(probability * 100)
  return (
    <Stack gap={4}>
      <Flex align="baseline" gap={2}>
        <Text size={4} weight="medium">
          {percent}%
        </Text>
        {question.label && (
          <Text size={1} muted>
            {question.label}
          </Text>
        )}
      </Flex>
      <Bar
        fraction={probability}
        color={trafficColor(probability)}
        label={`${question.title ?? t('noul.yes')}: ${percent}%`}
      />
      <Text size={1} muted>
        {probability >= 0.5 ? question.true : question.false}
      </Text>
    </Stack>
  )
}
