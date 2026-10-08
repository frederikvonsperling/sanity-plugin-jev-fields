import type {JevQuestion} from '../questions'
import {bindChoice, choiceSchemaTypes} from './choice'
import {mismatch, type Kind} from './kind'
import {bindNoul, noulSchemaTypes} from './noul'
import {bindScore, scoreSchemaTypes} from './score'

export type {Kind, RangeRule, Reading, RuleLevel, StoredValue} from './kind'
export {choice, type ChoiceRule, type ChoiceQuestion, type ChoiceValue} from './choice'
export {noul, type NoulQuestion, type NoulValue} from './noul'
export {score, type ScoreQuestion, type ScoreValue} from './score'

/** Where every kind stores its answers. */
export const KIND_SCHEMA_TYPES = [...noulSchemaTypes, ...scoreSchemaTypes, ...choiceSchemaTypes]

/** Binds a question to its kind. The one place that tells Noul, Score and Choice apart. */
export function kindOf(question: JevQuestion): Kind {
  const kind = bind(question)
  if (question.instructions?.trim()) return kind
  return {...kind, gatewayQuestion: undefined, problem: 'Add instructions to this question.'}
}

function bind(question: JevQuestion): Kind {
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
        problem: 'Unknown question type.',
        toStored: mismatch,
        read: () => undefined,
        check: () => undefined,
      }
  }
}
