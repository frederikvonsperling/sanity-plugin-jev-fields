import {Flex, Stack, Text} from '@sanity/ui'
import {defineField, defineType, useTranslation} from 'sanity'

import {AnswerField} from '../context'
import {JEV_NAMESPACE} from '../i18n'
import {Bar, capitalize, NEUTRAL_COLOR, trafficColor, trafficTone, type Tone} from '../look'
import {TYPE_NAMES} from '../names'
import {
  asRecordOfType,
  describeRangeViolation,
  evaluationFields,
  findRangeRuleConfigError,
  numberOrUndefined,
  readEvaluationFields,
  roundToDigits,
  stringOrUndefined,
  throwAnswerKindMismatch,
  type EvaluatedValue,
  type Kind,
  type QuestionBase,
  type RangeRule,
} from './kind'

/** @public */
export interface ScoreQuestion extends QuestionBase {
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

  /** Warn when the score is outside these bounds, as criterion positions: `{atLeast: 2}`. */
  warn?: RangeRule

  /** Block publishing when the score is outside these bounds. */
  require?: RangeRule
}

/** A position on an ordered scale. @public */
export const score = (question: Omit<ScoreQuestion, 'type'>): ScoreQuestion => ({
  type: 'score',
  ...question,
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
      ...evaluationFields,
    ],
  }),
]

/** `'anecdotal: personal experience'` → `'anecdotal'`; criteria without a colon are used as-is. */
export const getCriterionShortLabel = (criterion: string | undefined) =>
  criterion?.split(':')[0].trim() ?? ''

/** `'anecdotal: personal experience'` → `'personal experience'`; without a colon, the whole text. */
export function getCriterionMeaning(criterion: string | undefined): string {
  if (!criterion) return ''

  const colonIndex = criterion.indexOf(':')
  const meaning = colonIndex === -1 ? criterion : criterion.slice(colonIndex + 1)

  return meaning.trim()
}

/**
 * How full each segment of a score bar is, 0–1. Segment `i` stands for reaching criterion
 * `i`: a score of 0.8 fills the first segment and 80% of the second.
 */
export function getSegmentFillFractions(score: number, segmentCount: number): number[] {
  return Array.from({length: segmentCount}, (_, index) =>
    Math.min(1, Math.max(0, score - index + 1)),
  )
}

/** From the criterion the score is nearest to. */
function getScoreColorAndTone(question: ScoreQuestion, score: number, max: number) {
  if (question.colors === 'neutral') return {color: NEUTRAL_COLOR, tone: 'primary' as Tone}

  const fractionOfMax = max > 0 ? Math.round(score) / max : 0
  const goodness = question.colors === 'reverse' ? 1 - fractionOfMax : fractionOfMax

  return {color: trafficColor(goodness), tone: trafficTone(goodness)}
}

function findScoreConfigError(question: ScoreQuestion): string | undefined {
  const {criteria} = question

  if (!Array.isArray(criteria) || criteria.length < 2) {
    return 'A score question needs at least two criteria.'
  }

  if (criteria.length > 10) return 'A score question allows at most ten criteria.'

  return findRangeRuleConfigError(question, 0, criteria.length - 1)
}

export function bindScore(question: ScoreQuestion): Kind {
  const configError = findScoreConfigError(question)

  const gatewayQuestion = {
    type: 'score',
    instructions: question.instructions,
    criteria: question.criteria,
  } as const

  /** E.g. `0.6 (anecdotal)`: a position on the scale and the criterion nearest to it. */
  function describeScorePosition(position: number) {
    const label = getCriterionShortLabel(question.criteria[Math.round(position)])
    const formattedPosition = Number.isInteger(position) ? String(position) : position.toFixed(1)

    return label ? `${formattedPosition} (${label})` : formattedPosition
  }

  return {
    typeName: TYPE_NAMES.score,
    gatewayQuestion: configError ? undefined : gatewayQuestion,
    configError,

    toStoredValue(answer) {
      if (answer.type !== 'score') return throwAnswerKindMismatch()

      const max = question.criteria.length - 1
      const clampedScore = Math.min(max, Math.max(0, answer.score))

      return {
        _type: TYPE_NAMES.score,
        score: roundToDigits(clampedScore),
        max,
        label: getCriterionShortLabel(question.criteria[Math.round(clampedScore)]),
        ...(typeof answer.confidence === 'number' && {
          confidence: roundToDigits(answer.confidence),
        }),
      }
    },

    readStoredValue(stored) {
      const record = asRecordOfType(stored, TYPE_NAMES.score)

      if (!record || typeof record.score !== 'number' || typeof record.max !== 'number') {
        return undefined
      }

      const {score, max} = record
      const label = stringOrUndefined(record.label)
      const {color, tone} = getScoreColorAndTone(question, score, max)
      // `criteria` can be missing from a misconfigured question that still has a stored answer.
      const nearestCriterion = question.criteria?.[Math.round(score)]

      return {
        value: {
          ...readEvaluationFields(record),
          _type: TYPE_NAMES.score,
          score,
          max,
          label,
          confidence: numberOrUndefined(record.confidence),
        },
        chip: {text: `${score.toFixed(1)}/${max}`, color},
        tone: tone === 'critical' || tone === 'caution' ? tone : 'default',
        aside: {
          badge: capitalize(label ?? getCriterionShortLabel(nearestCriterion)),
          tone,
        },
        body: <ScoreBody question={question} score={score} max={max} color={color} />,
      }
    },

    describeRuleViolation(level, stored, title) {
      const record = asRecordOfType(stored, TYPE_NAMES.score)

      if (!record || typeof record.score !== 'number') return undefined

      const violation = describeRangeViolation(record.score, question[level], describeScorePosition)

      return violation && `${title} is ${describeScorePosition(record.score)}, ${violation}.`
    },
  }
}

function ScoreBody({
  question,
  score,
  max,
  color,
}: {
  question: ScoreQuestion
  score: number
  max: number
  color: string
}) {
  const {t} = useTranslation(JEV_NAMESPACE)
  const nearestIndex = Math.round(score)
  const segmentFillFractions = getSegmentFillFractions(score, question.criteria.length)
  const nextCriterion = question.criteria[nearestIndex + 1]

  return (
    <Stack gap={4}>
      <Flex gap={1}>
        {question.criteria.map((criterion, index) => (
          // Criteria may repeat, so their position is the key.
          // oxlint-disable-next-line react/no-array-index-key
          <Stack key={index} gap={2} flex={1}>
            <Bar
              fraction={segmentFillFractions[index]}
              color={color}
              label={`${index}: ${getCriterionShortLabel(criterion)}`}
            />
            <Text
              size={1}
              weight={index === nearestIndex ? 'medium' : 'regular'}
              muted={index > nearestIndex}
              style={index < nearestIndex ? {color} : undefined}
              textOverflow="ellipsis"
            >
              {index} · {capitalize(getCriterionShortLabel(criterion))}
            </Text>
          </Stack>
        ))}
      </Flex>
      <Text size={1} muted>
        {t('score.summary', {
          meaning: capitalize(getCriterionMeaning(question.criteria[nearestIndex])),
          score: score.toFixed(1),
          max,
        })}
        {nextCriterion ? ` ${t('score.next', {next: getCriterionMeaning(nextCriterion)})}` : ''}
      </Text>
    </Stack>
  )
}
