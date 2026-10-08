import {Flex, Stack, Text} from '@sanity/ui'
import {defineField, defineType} from 'sanity'

import {AnswerField} from '../context'
import {Bar, trafficColor, trafficTone, type Tone} from '../look'
import {TYPE_NAMES} from '../names'
import {
  bookkeepingFields,
  bookkeepingOf,
  mismatch,
  round,
  storedOf,
  type EvaluatedValue,
  type Kind,
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

const LEVELS: Partial<Record<Tone, string>> = {critical: 'Low', caution: 'Medium', positive: 'High'}

export function bindNoul(signal: NoulSignal): Kind {
  const askable = !!signal.true?.trim() && !!signal.false?.trim()
  return {
    typeName: TYPE_NAMES.noul,
    // Jev's API and the Gateway call a noul "boolean".
    question: askable
      ? {
          type: 'boolean',
          instructions: signal.instructions,
          criteria: {true: signal.true, false: signal.false},
        }
      : undefined,
    problem: askable ? undefined : 'A noul signal needs both `true` and `false` text.',

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
        aside: {badge: LEVELS[tone] ?? '', tone},
        body: <NoulBody signal={signal} probability={probability} />,
      }
    },
  }
}

function NoulBody({signal, probability}: {signal: NoulSignal; probability: number}) {
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
        label={`${signal.title ?? 'Yes'}: ${percent}%`}
      />
      <Text size={1} muted>
        {probability >= 0.5 ? signal.true : signal.false}
      </Text>
    </Stack>
  )
}
