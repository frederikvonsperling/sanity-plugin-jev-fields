import type {JevAnswer, JevQuestion} from './evaluate'
import {TYPE_NAMES} from './names'
import type {ChoiceValue, NoulValue, ScoreValue} from './types'

export const round = (value: number, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits

/** `'anecdotal: personal experience'` → `'anecdotal'`; criteria without a colon are used as-is. */
export const shortLabel = (criterion: string | undefined) => criterion?.split(':')[0].trim() ?? ''

/** `'anecdotal: personal experience'` → `'personal experience'`; without a colon, the whole text. */
export function meaningOf(criterion: string | undefined): string {
  if (!criterion) return ''
  const colon = criterion.indexOf(':')
  return (colon === -1 ? criterion : criterion.slice(colon + 1)).trim()
}

/** The stored value for an answer, without the `_type` and bookkeeping fields. */
export function toValue(
  answer: JevAnswer,
  question: JevQuestion,
): Partial<NoulValue & ScoreValue & ChoiceValue> {
  if (answer.type === 'boolean' && question.type === 'boolean') {
    return {probability: round(answer.probability)}
  }

  if (answer.type === 'score' && question.type === 'score') {
    const max = question.criteria.length - 1
    const score = Math.min(max, Math.max(0, answer.score))
    return {
      score: round(score),
      max,
      label: shortLabel(question.criteria[Math.round(score)]),
      ...(typeof answer.confidence === 'number' && {confidence: round(answer.confidence)}),
    }
  }

  if (answer.type === 'choice' && question.type === 'choice') {
    return {
      choice: answer.choice,
      confidence: round(answer.confidence ?? answer.probabilities[answer.choice] ?? 0),
      // Index keys can't collide, unlike keys derived from option names.
      probabilities: Object.keys(question.criteria).map((option, index) => ({
        _key: `option-${index}`,
        _type: TYPE_NAMES.choiceProbability,
        option,
        probability: round(answer.probabilities[option] ?? 0),
      })),
    }
  }

  return {}
}

/**
 * How full each segment of a score bar is, 0–1. Segment `i` stands for reaching criterion
 * `i`: a score of 0.8 fills the first segment and 80% of the second.
 */
export function segmentFills(score: number, count: number): number[] {
  return Array.from({length: count}, (_, index) => Math.min(1, Math.max(0, score - index + 1)))
}
