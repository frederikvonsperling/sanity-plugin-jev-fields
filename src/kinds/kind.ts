import type {ReactNode} from 'react'
import {defineField} from 'sanity'

import {isRecord} from '../content'
import type {JevAnswer, JevQuestion} from '../evaluate'
import type {Tone} from '../look'
import type {ChoiceValue} from './choice'
import type {NoulValue} from './noul'
import type {ScoreValue} from './score'

export interface SignalBase {
  /** Chip and detail heading. Defaults to the signal's key, e.g. `readable` → "Readable". */
  title?: string
  /** The question Jev answers about the attached field. */
  instructions: string
}

export interface EvaluatedValue {
  evaluatedAt?: string
  /** The model that answered, as AI Gateway names it, e.g. `typesafe-ai/jev`. */
  model?: string
  /** Fingerprint of the evaluated content and question, used to detect stale results. */
  sourceHash?: string
}

/** Bounds on a probability (Noul, 0–1) or a score (0 to the top criterion). @public */
export interface RangeRule {
  atLeast?: number
  atMost?: number
}

/** `warn` gives a warning, `require` an error that blocks publishing. */
export type RuleLevel = 'warn' | 'require'

/** A stored answer of any kind, as written to its answer field. */
export type StoredValue = NoulValue | ScoreValue | ChoiceValue

/** A stored answer as an editor sees it. */
export interface Reading {
  value: StoredValue
  chip: {text: string; color: string}
  /** Tone of the detail card: only answers worth acting on colour it. */
  tone: Tone
  /** Right of the detail heading: a badge, or what the answer means. */
  aside?: {badge: string; tone: Tone} | {note: string}
  /** Body of the detail card. */
  body: ReactNode
}

/** A signal bound to its kind (Noul, Score or Choice): everything that differs between them. */
export interface Kind {
  /** Schema type of the field that stores the answer, e.g. `jev.score`. */
  typeName: string
  /** The question sent to Jev. Absent when the signal's config can't be asked: see `problem`. */
  question?: JevQuestion
  problem?: string
  /** The value to store for Jev's answer to `question`, without the bookkeeping fields. */
  toStored(answer: JevAnswer): StoredValue
  /** Reads a stored value. Anything that isn't a complete answer of this kind is unanswered. */
  read(stored: unknown): Reading | undefined
  /**
   * What is wrong with a stored answer, judged by the signal's `warn` or `require` rule.
   * Nothing when the rule holds, the signal has no such rule, or there is no answer.
   */
  check(level: RuleLevel, stored: unknown, title: string): string | undefined
}

export const round = (value: number, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits

export function mismatch(): never {
  throw new Error('Jev answered a different kind of question.')
}

export const bookkeepingFields = [
  defineField({name: 'evaluatedAt', type: 'datetime', readOnly: true}),
  defineField({name: 'model', type: 'string', readOnly: true}),
  defineField({name: 'sourceHash', type: 'string', hidden: true}),
]

/** The stored value as a record of the given `_type`, or nothing. */
export function storedOf(stored: unknown, typeName: string): Record<string, unknown> | undefined {
  return isRecord(stored) && stored._type === typeName ? stored : undefined
}

/** The bookkeeping fields a stored value has. */
export function bookkeepingOf(stored: Record<string, unknown>): EvaluatedValue {
  return {
    evaluatedAt: text(stored.evaluatedAt),
    model: text(stored.model),
    sourceHash: text(stored.sourceHash),
  }
}

export const text = (value: unknown) => (typeof value === 'string' ? value : undefined)
export const number = (value: unknown) => (typeof value === 'number' ? value : undefined)

/** Why a range rule is invalid for values from `min` to `max`, if it is. */
export function rangeRuleProblem(
  rules: Partial<Record<RuleLevel, RangeRule>>,
  min: number,
  max: number,
): string | undefined {
  for (const level of ['warn', 'require'] as const) {
    const rule = rules[level]
    if (!rule) continue
    for (const bound of ['atLeast', 'atMost'] as const) {
      const value = rule[bound]
      if (value !== undefined && (typeof value !== 'number' || value < min || value > max)) {
        return `\`${level}.${bound}\` must be a number from ${min} to ${max}.`
      }
    }
  }
  return undefined
}

/** How `value` breaks a range rule, e.g. `below 60%`, using `format` for both numbers. */
export function rangeViolation(
  value: number,
  rule: RangeRule | undefined,
  format: (value: number) => string,
): string | undefined {
  if (rule?.atLeast !== undefined && value < rule.atLeast) return `below ${format(rule.atLeast)}`
  if (rule?.atMost !== undefined && value > rule.atMost) return `above ${format(rule.atMost)}`
  return undefined
}
