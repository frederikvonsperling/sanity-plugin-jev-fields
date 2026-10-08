import type {JevTransport} from './evaluate'

export interface JevPluginConfig {
  /** Vercel AI Gateway key. Anything set here is bundled into the Studio's JavaScript. */
  apiKey?: string
  /** Decision model to call. Defaults to `typesafe-ai/jev`. */
  model?: string
  /** Delay after the last edit before re-evaluating. Defaults to 500ms. */
  debounceMs?: number
  /** Defaults to `https://ai-gateway.vercel.sh/v1/evaluate`. Ignored when `transport` is set. */
  endpoint?: string
  /**
   * Sends evaluation requests yourself, e.g. through your own server so the API key never
   * reaches the browser. Takes precedence over `apiKey`.
   */
  transport?: JevTransport
  /**
   * Adds a "Jev" tool to the Studio for setting, testing and removing the stored API key.
   * Defaults to `true`.
   */
  tool?: boolean
  /**
   * AI Gateway reporting tags, for cost attribution. Defaults to `['feature:jev-fields']`.
   * Each request also gets a per-signal tag, e.g. `jev.noul:article.readable`.
   */
  tags?: string[]
}

interface EvaluatedValue {
  evaluatedAt?: string
  /** The model that answered, as AI Gateway names it, e.g. `typesafe-ai/jev`. */
  model?: string
  /** Fingerprint of the evaluated content and question, used to detect stale results. */
  sourceHash?: string
}

export interface NoulValue extends EvaluatedValue {
  _type?: 'jev.noul'
  /** Probability (0–1) that the answer is yes. */
  probability?: number
}

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

export interface ChoiceValue extends EvaluatedValue {
  _type?: 'jev.choice'
  choice?: string
  /** The model's confidence in this choice (0–1). */
  confidence?: number
  probabilities?: {
    _key: string
    _type?: 'jev.choiceProbability'
    option?: string
    probability?: number
  }[]
}
