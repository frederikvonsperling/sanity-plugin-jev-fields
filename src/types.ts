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
   * Each request also gets a per-question tag, e.g. `jev.noul:article.readable`.
   */
  tags?: string[]
}

export type {ChoiceValue, NoulValue, ScoreValue} from './kinds'
