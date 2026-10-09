import type {ReactNode} from 'react'
import {defineField} from 'sanity'

import {
  isDocumentObject,
  isNumber,
  isString,
  type DocumentObject,
  type DocumentValue,
} from '../content'
import type {GatewayAnswer, GatewayQuestion} from '../evaluate'
import type {Tone} from '../look'
import type {ChoiceValue} from './choice'
import type {NoulValue} from './noul'
import type {ScoreValue} from './score'

export interface QuestionBase {
  /** Chip and detail heading. Defaults to the question's key, e.g. `readable` → "Readable". */
  title?: string

  /** The question Jev answers about the attached field. */
  instructions: string
}

/** Fields every stored answer has, whatever its kind. @public */
export type EvaluatedValue = {
  evaluatedAt?: string

  /** The model that answered, as AI Gateway names it, e.g. `typesafe-ai/jev`. */
  model?: string

  /**
   * Fingerprint of the evaluated state, question and model, used to detect stale answers. Only
   * the Studio reads it: how it is made may change, which only marks answers out of date.
   */
  sourceHash?: string
}

/** Bounds on a probability (Noul, 0–1) or a score (0 to the top criterion). @public */
export interface RangeRule {
  atLeast?: number
  atMost?: number
}

/** `warn` gives a warning, `require` an error that blocks publishing. */
export type RuleLevel = 'warn' | 'require'

export const RULE_LEVELS: readonly RuleLevel[] = ['warn', 'require']

/** A stored answer of any kind, as written to its answer field. */
export type StoredValue = NoulValue | ScoreValue | ChoiceValue

/** How high a noul's probability is, shown as a translated badge. */
export type Level = 'low' | 'medium' | 'high'

/** A stored answer as an editor sees it. */
export interface Reading {
  value: StoredValue

  chip: {text: string; color: string}

  /** Only answers worth acting on colour the detail card. */
  tone: Tone

  /** Right of the detail heading: a badge, or what the answer means. */
  aside?: {badge: string; tone: Tone} | {level: Level; tone: Tone} | {note: string}

  body: ReactNode
}

/** A question bound to its kind (Noul, Score or Choice): everything that differs between them. */
export interface Kind {
  /** Schema type of the field that stores the answer, e.g. `jev.score`. */
  typeName: string

  /** Absent when the question's config can't be asked: see `configError`. */
  gatewayQuestion?: GatewayQuestion

  /** Why the question's config can't be asked, written for schema authors. */
  configError?: string

  /** Jev's answer to `gatewayQuestion`, without the evaluation fields. */
  toStoredValue(answer: GatewayAnswer): StoredValue

  /** Anything that isn't a complete answer of this kind is unanswered. */
  readStoredValue(stored: DocumentValue): Reading | undefined

  /**
   * How a stored answer breaks the question's `warn` or `require` rule. Nothing when the rule
   * holds, the question has no such rule, or there is no answer.
   */
  describeRuleViolation(level: RuleLevel, stored: DocumentValue, title: string): string | undefined
}

export const roundToDigits = (value: number, digits = 4) =>
  Math.round(value * 10 ** digits) / 10 ** digits

export function throwAnswerKindMismatch(): never {
  throw new Error('Jev answered a different kind of question.')
}

export const evaluationFields = [
  defineField({name: 'evaluatedAt', type: 'datetime', readOnly: true}),
  defineField({name: 'model', type: 'string', readOnly: true}),
  defineField({name: 'sourceHash', type: 'string', hidden: true}),
]

export function asRecordOfType(
  stored: DocumentValue,
  typeName: string,
): DocumentObject | undefined {
  return isDocumentObject(stored) && stored._type === typeName ? stored : undefined
}

export function readEvaluationFields(stored: DocumentObject): EvaluatedValue {
  return {
    evaluatedAt: stringOrUndefined(stored.evaluatedAt),
    model: stringOrUndefined(stored.model),
    sourceHash: stringOrUndefined(stored.sourceHash),
  }
}

export const stringOrUndefined = (value: DocumentValue) => (isString(value) ? value : undefined)

export const numberOrUndefined = (value: DocumentValue) => (isNumber(value) ? value : undefined)

export function findRangeRuleConfigError(
  rules: Partial<Record<RuleLevel, RangeRule>>,
  min: number,
  max: number,
): string | undefined {
  for (const level of RULE_LEVELS) {
    const rule = rules[level]

    if (!rule) continue

    for (const bound of ['atLeast', 'atMost'] as const) {
      const value = rule[bound]

      if (value === undefined) continue

      // Config from plain JavaScript can hold anything, so this also rejects non-numbers.
      const isNumberInRange = Number.isFinite(value) && value >= min && value <= max

      if (!isNumberInRange) {
        return `\`${level}.${bound}\` must be a number from ${min} to ${max}.`
      }
    }
  }

  return undefined
}

/** E.g. `below 60%`, using `format` for both numbers. */
export function describeRangeViolation(
  value: number,
  rule: RangeRule | undefined,
  format: (value: number) => string,
): string | undefined {
  if (rule?.atLeast !== undefined && value < rule.atLeast) return `below ${format(rule.atLeast)}`

  if (rule?.atMost !== undefined && value > rule.atMost) return `above ${format(rule.atMost)}`

  return undefined
}
