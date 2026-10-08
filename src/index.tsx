import {SparklesIcon} from '@sanity/icons/Sparkles'
import {definePlugin} from 'sanity'

import {signalsOf} from './answers'
import {AttachedInput} from './AttachedInput'
import {JevFormProvider} from './context'
import {jevLocaleBundle} from './i18n'
import {JevTool} from './JevTool'
import {KIND_SCHEMA_TYPES} from './kinds'
import type {JevSignals} from './signals'
import type {JevPluginConfig} from './types'

export type * from './types'
export type {JevAnswer, JevQuestion, JevRequest, JevTransport} from './evaluate'
export type {ChoiceSignal, JevSignal, JevSignals, NoulSignal, ScoreSignal} from './signals'
export type {ChoiceRule, RangeRule} from './kinds'
export {choice, noul, score} from './signals'
export {withJevAnswers} from './answers'
export {JEV_NAMESPACE, type JevTranslationKey} from './i18n'

declare module 'sanity' {
  interface BaseSchemaTypeOptions {
    /** Jev signals shown on this field, keyed by the name of the field storing each answer. */
    jev?: JevSignals
  }
}

/**
 * Jev signals for Sanity Studio: yes/no, score and choice questions attached to a field with
 * `options.jev`, answered by TypeSafe's Jev model through Vercel AI Gateway. Pair it with
 * `withJevAnswers(schemaTypes)` in `schema.types`.
 * @public
 */
export const jev = definePlugin<JevPluginConfig | void>((config) => {
  const pluginConfig: JevPluginConfig = config ?? {}

  return {
    name: 'jev',
    tools:
      pluginConfig.tool === false
        ? []
        : [
            {
              name: 'jev',
              title: 'Jev',
              icon: SparklesIcon,
              component: () => <JevTool config={pluginConfig} />,
            },
          ],
    form: {
      components: {
        input: (props) => {
          // The document's root input: gives attached fields the plugin config and a way to
          // reach the answer fields next to them.
          if (props.path.length === 0) {
            return (
              <JevFormProvider config={pluginConfig}>{props.renderDefault(props)}</JevFormProvider>
            )
          }
          const signals = signalsOf(props.schemaType)
          return signals ? (
            <AttachedInput {...props} signals={signals} />
          ) : (
            props.renderDefault(props)
          )
        },
      },
    },
    // Where answers are stored. Shown on the attached field, so their fields render nothing.
    schema: {types: KIND_SCHEMA_TYPES},
    i18n: {bundles: [jevLocaleBundle]},
  }
})
