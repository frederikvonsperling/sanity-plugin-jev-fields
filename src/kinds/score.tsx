import {Flex, Stack, Text} from '@sanity/ui'
import {defineField, defineType} from 'sanity'

import {AnswerField} from '../context'
import {Bar, capitalize, NEUTRAL_COLOR, trafficColor, trafficTone, type Tone} from '../look'
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
export interface ScoreSignal extends SignalBase {
  type: 'score'
  /**
   * Two to ten criteria, lowest first. Text before a colon becomes the short label,
   * e.g. `'anecdotal: personal experience only'`.
   */
  criteria: string[]
  /**
   * `traffic` (default): red at the bottom, green at the top.
   * `reverse`: green at the bottom, for scales where lower is better (e.g. risk).
   * `neutral`: one colour, for scales that aren't good or bad (e.g. reading level).
   */
  colors?: 'traffic' | 'reverse' | 'neutral'
}

/** A position on an ordered scale. @public */
export const score = (signal: Omit<ScoreSignal, 'type'>): ScoreSignal => ({
  type: 'score',
  ...signal,
})

/** @public */
export interface ScoreValue extends EvaluatedValue {
  _type?: 'jev.score'
  /** Interpolated position on the scale, from 0 to `max`. */
  score?: number
  /** Index of the top criterion (number of criteria minus one). */
  max?: number
  /** Short label of the nearest criterion. */
  label?: string
  /** The model's confidence in this score (0–1). */
  confidence?: number
}

export const scoreSchemaTypes = [
  defineType({
    name: TYPE_NAMES.score,
    title: 'Jev score',
    type: 'object',
    components: {field: AnswerField},
    fields: [
      defineField({name: 'score', type: 'number', readOnly: true}),
      defineField({name: 'max', type: 'number', readOnly: true}),
      defineField({name: 'label', type: 'string', readOnly: true}),
      defineField({name: 'confidence', type: 'number', readOnly: true}),
      ...bookkeepingFields,
    ],
  }),
]

/** `'anecdotal: personal experience'` → `'anecdotal'`; criteria without a colon are used as-is. */
export const shortLabel = (criterion: string | undefined) => criterion?.split(':')[0].trim() ?? ''

/** `'anecdotal: personal experience'` → `'personal experience'`; without a colon, the whole text. */
export function meaningOf(criterion: string | undefined): string {
  if (!criterion) return ''
  const colon = criterion.indexOf(':')
  return (colon === -1 ? criterion : criterion.slice(colon + 1)).trim()
}

/**
 * How full each segment of a score bar is, 0–1. Segment `i` stands for reaching criterion
 * `i`: a score of 0.8 fills the first segment and 80% of the second.
 */
export function segmentFills(score: number, count: number): number[] {
  return Array.from({length: count}, (_, index) => Math.min(1, Math.max(0, score - index + 1)))
}

/** Colour and tone of a score, from the criterion it is nearest to. */
function scoreLook(signal: ScoreSignal, value: number, max: number) {
  if (signal.colors === 'neutral') return {color: NEUTRAL_COLOR, tone: 'primary' as Tone}
  const fraction = max > 0 ? Math.round(value) / max : 0
  const good = signal.colors === 'reverse' ? 1 - fraction : fraction
  return {color: trafficColor(good), tone: trafficTone(good)}
}

export function bindScore(signal: ScoreSignal): Kind {
  const {criteria} = signal
  const problem =
    !Array.isArray(criteria) || criteria.length < 2
      ? 'A score signal needs at least two criteria.'
      : criteria.length > 10
        ? 'A score signal allows at most ten criteria.'
        : undefined
  return {
    typeName: TYPE_NAMES.score,
    question: problem ? undefined : {type: 'score', instructions: signal.instructions, criteria},
    problem,

    toStored(answer) {
      if (answer.type !== 'score') return mismatch()
      const max = criteria.length - 1
      const value = Math.min(max, Math.max(0, answer.score))
      return {
        _type: TYPE_NAMES.score,
        score: round(value),
        max,
        label: shortLabel(criteria[Math.round(value)]),
        ...(typeof answer.confidence === 'number' && {confidence: round(answer.confidence)}),
      }
    },

    read(stored) {
      const record = storedOf(stored, TYPE_NAMES.score)
      if (!record || typeof record.score !== 'number' || typeof record.max !== 'number') {
        return undefined
      }
      const {score: value, max} = record
      const label = text(record.label)
      const look = scoreLook(signal, value, max)
      return {
        value: {
          ...bookkeepingOf(record),
          _type: TYPE_NAMES.score,
          score: value,
          max,
          label,
          confidence: number(record.confidence),
        },
        chip: {text: `${value.toFixed(1)}/${max}`, color: look.color},
        tone: look.tone === 'critical' || look.tone === 'caution' ? look.tone : 'default',
        aside: {
          badge: capitalize(label ?? shortLabel(criteria?.[Math.round(value)])),
          tone: look.tone,
        },
        body: <ScoreBody signal={signal} score={value} max={max} color={look.color} />,
      }
    },
  }
}

function ScoreBody({
  signal,
  score,
  max,
  color,
}: {
  signal: ScoreSignal
  score: number
  max: number
  color: string
}) {
  const nearest = Math.round(score)
  const fills = segmentFills(score, signal.criteria.length)
  const next = signal.criteria[nearest + 1]
  return (
    <Stack gap={4}>
      <Flex gap={1}>
        {signal.criteria.map((criterion, index) => (
          // Criteria may repeat, so their position is the key.
          // oxlint-disable-next-line react/no-array-index-key
          <Stack key={index} gap={2} flex={1}>
            <Bar
              fraction={fills[index]}
              color={color}
              label={`${index}: ${shortLabel(criterion)}`}
            />
            <Text
              size={1}
              weight={index === nearest ? 'medium' : 'regular'}
              muted={index > nearest}
              style={index < nearest ? {color} : undefined}
              textOverflow="ellipsis"
            >
              {index} · {capitalize(shortLabel(criterion))}
            </Text>
          </Stack>
        ))}
      </Flex>
      <Text size={1} muted>
        {capitalize(meaningOf(signal.criteria[nearest]))} (score {score.toFixed(1)} of {max}).
        {next ? ` To move up: ${meaningOf(next)}.` : ''}
      </Text>
    </Stack>
  )
}
