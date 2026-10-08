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
  type SignalBase,
} from './kind'

/** @public */
export interface NoulSignal extends SignalBase {
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

/** A yes/no signal: the chip shows the probability that the answer is yes. @public */
export const noul = (signal: Omit<NoulSignal, 'type'>): NoulSignal => ({type: 'noul', ...signal})

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

const LEVELS: Partial<Record<Tone, Level>> = {critical: 'low', caution: 'medium', positive: 'high'}

export function bindNoul(signal: NoulSignal): Kind {
  const problem =
    !signal.true?.trim() || !signal.false?.trim()
      ? 'A noul signal needs both `true` and `false` text.'
      : rangeRuleProblem(signal, 0, 1)
  return {
    typeName: TYPE_NAMES.noul,
    // Jev's API and the Gateway call a noul "boolean".
    question: !problem
      ? {
          type: 'boolean',
          instructions: signal.instructions,
          criteria: {true: signal.true, false: signal.false},
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
        body: <NoulBody signal={signal} probability={probability} />,
      }
    },

    check(level, stored, title) {
      const record = storedOf(stored, TYPE_NAMES.noul)
      if (!record || typeof record.probability !== 'number') return undefined
      const percent = (value: number) => `${Math.round(value * 100)}%`
      const broken = rangeViolation(record.probability, signal[level], percent)
      return broken && `${title} is ${percent(record.probability)}, ${broken}.`
    },
  }
}

function NoulBody({signal, probability}: {signal: NoulSignal; probability: number}) {
  const {t} = useTranslation(JEV_NAMESPACE)
  const percent = Math.round(probability * 100)
  return (
    <Stack gap={4}>
      <Flex align="baseline" gap={2}>
        <Text size={4} weight="medium">
          {percent}%
        </Text>
        {signal.label && (
          <Text size={1} muted>
            {signal.label}
          </Text>
        )}
      </Flex>
      <Bar
        fraction={probability}
        color={trafficColor(probability)}
        label={`${signal.title ?? t('noul.yes')}: ${percent}%`}
      />
      <Text size={1} muted>
        {probability >= 0.5 ? signal.true : signal.false}
      </Text>
    </Stack>
  )
}
