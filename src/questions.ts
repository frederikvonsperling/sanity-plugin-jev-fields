import type {ChoiceQuestion, NoulQuestion, ScoreQuestion} from './kinds'

export {
  choice,
  noul,
  score,
  type ChoiceQuestion,
  type NoulQuestion,
  type ScoreQuestion,
} from './kinds'

/** @public */
export type JevQuestion = NoulQuestion | ScoreQuestion | ChoiceQuestion

/** Questions attached to a field, keyed by the name of the field that stores each answer. */
export type JevQuestions = Record<string, JevQuestion>

/** The question's own `title`, or one made from its key: `readingLevel` → `Reading level`. */
export function getQuestionTitle(key: string, question: JevQuestion): string {
  if (question.title) return question.title

  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')

  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()
}
