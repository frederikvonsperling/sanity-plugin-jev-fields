import {Flex, Stack, Text} from '@sanity/ui'
import {defineField, defineType, useTranslation} from 'sanity'

import {isNumber} from '../content'
import {AnswerField} from '../context'
import {JEV_NAMESPACE} from '../i18n'
import {Bar, trafficColor, trafficTone, type Tone} from '../look'
import {TYPE_NAMES} from '../names'
import {
  asRecordOfType,
  describeRangeViolation,
  evaluationFields,
  findRangeRuleConfigError,
  readEvaluationFields,
  roundToDigits,
  throwAnswerKindMismatch,
  type EvaluatedValue,
  type Kind,
  type Level,
  type QuestionBase,
  type RangeRule,
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
export type NoulValue = EvaluatedValue & {
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
      ...evaluationFields,
    ],
  }),
]

const LEVEL_BY_TONE: Partial<Record<Tone, Level>> = {
  critical: 'low',
  caution: 'medium',
  positive: 'high',
}

const formatAsPercent = (probability: number) => `${Math.round(probability * 100)}%`

function findNoulConfigError(question: NoulQuestion): string | undefined {
  if (!question.true?.trim() || !question.false?.trim()) {
    return 'A noul question needs both `true` and `false` text.'
  }

  return findRangeRuleConfigError(question, 0, 1)
}

export function bindNoul(question: NoulQuestion): Kind {
  const configError = findNoulConfigError(question)

  // Jev's API and the Gateway call a noul "boolean".
  const gatewayQuestion = {
    type: 'boolean',
    instructions: question.instructions,
    criteria: {true: question.true, false: question.false},
  } as const

  return {
    typeName: TYPE_NAMES.noul,
    gatewayQuestion: configError ? undefined : gatewayQuestion,
    configError,

    toStoredValue(answer) {
      if (answer.type !== 'boolean') return throwAnswerKindMismatch()

      return {_type: TYPE_NAMES.noul, probability: roundToDigits(answer.probability)}
    },

    readStoredValue(stored) {
      const record = asRecordOfType(stored, TYPE_NAMES.noul)

      if (!record || !isNumber(record.probability)) return undefined

      const probability = record.probability
      const tone = trafficTone(probability)

      return {
        value: {...readEvaluationFields(record), _type: TYPE_NAMES.noul, probability},
        chip: {text: formatAsPercent(probability), color: trafficColor(probability)},
        tone: tone === 'positive' ? 'default' : tone,
        aside: {level: LEVEL_BY_TONE[tone] ?? 'medium', tone},
        body: <NoulBody question={question} probability={probability} />,
      }
    },

    describeRuleViolation(level, stored, title) {
      const record = asRecordOfType(stored, TYPE_NAMES.noul)

      if (!record || !isNumber(record.probability)) return undefined

      const violation = describeRangeViolation(record.probability, question[level], formatAsPercent)

      return violation && `${title} is ${formatAsPercent(record.probability)}, ${violation}.`
    },
  }
}

function NoulBody({question, probability}: {question: NoulQuestion; probability: number}) {
  const {t} = useTranslation(JEV_NAMESPACE)
  const percent = formatAsPercent(probability)

  return (
    <Stack gap={4}>
      <Flex align="baseline" gap={2}>
        <Text size={4} weight="medium">
          {percent}
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
        label={`${question.title ?? t('noul.yes')}: ${percent}`}
      />
      <Text size={1} muted>
        {probability >= 0.5 ? question.true : question.false}
      </Text>
    </Stack>
  )
}
