import type {ChoiceSignal, NoulSignal, ScoreSignal} from './kinds'

export {choice, noul, score, type ChoiceSignal, type NoulSignal, type ScoreSignal} from './kinds'

/** @public */
export type JevSignal = NoulSignal | ScoreSignal | ChoiceSignal

/** `readable` → `Readable`, `readingLevel` → `Reading level`. */
export function titleOf(key: string, signal: JevSignal): string {
  if (signal.title) return signal.title
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()
}

/** Signals attached to a field, keyed by the name of the field that stores each answer. */
export type JevSignals = Record<string, JevSignal>
