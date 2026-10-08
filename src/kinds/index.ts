import type {JevSignal} from '../signals'
import {bindChoice, choiceSchemaTypes} from './choice'
import {mismatch, type Kind} from './kind'
import {bindNoul, noulSchemaTypes} from './noul'
import {bindScore, scoreSchemaTypes} from './score'

export type {Kind, RangeRule, Reading, RuleLevel, StoredValue} from './kind'
export {choice, type ChoiceRule, type ChoiceSignal, type ChoiceValue} from './choice'
export {noul, type NoulSignal, type NoulValue} from './noul'
export {score, type ScoreSignal, type ScoreValue} from './score'

/** Where every kind stores its answers. */
export const KIND_SCHEMA_TYPES = [...noulSchemaTypes, ...scoreSchemaTypes, ...choiceSchemaTypes]

/** Binds a signal to its kind. The one place that tells Noul, Score and Choice apart. */
export function kindOf(signal: JevSignal): Kind {
  const kind = bind(signal)
  if (signal.instructions?.trim()) return kind
  return {...kind, question: undefined, problem: 'Add instructions to this signal.'}
}

function bind(signal: JevSignal): Kind {
  switch (signal.type) {
    case 'noul':
      return bindNoul(signal)
    case 'score':
      return bindScore(signal)
    case 'choice':
      return bindChoice(signal)
    default:
      // Config from plain JavaScript can name any type.
      return {
        typeName: 'unknown',
        problem: 'Unknown signal type.',
        toStored: mismatch,
        read: () => undefined,
        check: () => undefined,
      }
  }
}
