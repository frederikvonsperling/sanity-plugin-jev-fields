import type {JevQuestion} from '../questions'
import {bindChoice, choiceSchemaTypes} from './choice'
import {throwAnswerKindMismatch, type Kind} from './kind'
import {bindNoul, noulSchemaTypes} from './noul'
import {bindScore, scoreSchemaTypes} from './score'

export type {EvaluatedValue, Kind, RangeRule, Reading, RuleLevel, StoredValue} from './kind'
export {RULE_LEVELS} from './kind'
export {
  choice,
  type ChoiceProbability,
  type ChoiceRule,
  type ChoiceQuestion,
  type ChoiceValue,
} from './choice'
export {noul, type NoulQuestion, type NoulValue} from './noul'
export {score, type ScoreQuestion, type ScoreValue} from './score'

/** Where every kind stores its answers. */
export const KIND_SCHEMA_TYPES = [...noulSchemaTypes, ...scoreSchemaTypes, ...choiceSchemaTypes]

/** The one place that tells Noul, Score and Choice apart. */
export function bindQuestionToKind(question: JevQuestion): Kind {
  const kind = bindQuestionByType(question)

  if (question.instructions?.trim()) return kind

  return {...kind, gatewayQuestion: undefined, configError: 'Add instructions to this question.'}
}

function bindQuestionByType(question: JevQuestion): Kind {
  switch (question.type) {
    case 'noul':
      return bindNoul(question)
    case 'score':
      return bindScore(question)
    case 'choice':
      return bindChoice(question)
    default:
      // Config from plain JavaScript can name any type.
      return {
        typeName: 'unknown',
        configError: 'Unknown question type.',
        toStoredValue: throwAnswerKindMismatch,
        readStoredValue: () => undefined,
        describeRuleViolation: () => undefined,
      }
  }
}
