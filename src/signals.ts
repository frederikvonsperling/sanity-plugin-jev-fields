import type {JevQuestion} from './evaluate'

interface SignalBase {
  /** Chip and detail heading. Defaults to the signal's key, e.g. `readable` → "Readable". */
  title?: string
  /** The question Jev answers about the attached field. */
  instructions: string
}

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

/** @public */
export interface ChoiceSignal extends SignalBase {
  type: 'choice'
  /** At least two options: option name → what it means. */
  criteria: Record<string, string>
}

/** @public */
export type JevSignal = NoulSignal | ScoreSignal | ChoiceSignal

/** A yes/no signal: the chip shows the probability that the answer is yes. @public */
export const noul = (signal: Omit<NoulSignal, 'type'>): NoulSignal => ({type: 'noul', ...signal})

/** A position on an ordered scale. @public */
export const score = (signal: Omit<ScoreSignal, 'type'>): ScoreSignal => ({
  type: 'score',
  ...signal,
})

/** One option from a named set. @public */
export const choice = (signal: Omit<ChoiceSignal, 'type'>): ChoiceSignal => ({
  type: 'choice',
  ...signal,
})

/** The question sent to Jev, or why the signal's config can't be asked. */
export function questionOf(signal: JevSignal): JevQuestion | {problem: string} {
  if (!signal.instructions?.trim()) return {problem: 'Add instructions to this signal.'}
  switch (signal.type) {
    case 'noul':
      if (!signal.true?.trim() || !signal.false?.trim()) {
        return {problem: 'A noul signal needs both `true` and `false` text.'}
      }
      return {
        type: 'boolean',
        instructions: signal.instructions,
        criteria: {true: signal.true, false: signal.false},
      }
    case 'score':
      if (!Array.isArray(signal.criteria) || signal.criteria.length < 2) {
        return {problem: 'A score signal needs at least two criteria.'}
      }
      if (signal.criteria.length > 10)
        return {problem: 'A score signal allows at most ten criteria.'}
      return {type: 'score', instructions: signal.instructions, criteria: signal.criteria}
    case 'choice':
      if (Object.keys(signal.criteria ?? {}).length < 2) {
        return {problem: 'A choice signal needs at least two options.'}
      }
      return {type: 'choice', instructions: signal.instructions, criteria: signal.criteria}
    default:
      return {problem: 'Unknown signal type.'}
  }
}

/** `readable` → `Readable`, `readingLevel` → `Reading level`. */
export function titleOf(key: string, signal: JevSignal): string {
  if (signal.title) return signal.title
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()
}

/** Signals attached to a field, keyed by the name of the field that stores each answer. */
export type JevSignals = Record<string, JevSignal>
