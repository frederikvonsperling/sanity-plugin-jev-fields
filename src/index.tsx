import {SparklesIcon} from '@sanity/icons/Sparkles'
import {defineArrayMember, defineField, definePlugin, defineType} from 'sanity'

import {signalsOf} from './answers'
import {AttachedInput} from './AttachedInput'
import {AnswerField, JevFormProvider} from './context'
import {JevTool} from './JevTool'
import {TYPE_NAMES} from './names'
import type {JevSignals} from './signals'
import type {JevPluginConfig} from './types'

export type * from './types'
export type {JevAnswer, JevQuestion, JevRequest, JevTransport} from './evaluate'
export type {ChoiceSignal, JevSignal, JevSignals, NoulSignal, ScoreSignal} from './signals'
export {choice, noul, score} from './signals'
export {withJevAnswers} from './answers'

declare module 'sanity' {
  interface BaseSchemaTypeOptions {
    /** Jev signals shown on this field, keyed by the name of the field storing each answer. */
    jev?: JevSignals
  }
}

const bookkeepingFields = [
  defineField({name: 'evaluatedAt', type: 'datetime', readOnly: true}),
  defineField({name: 'model', type: 'string', readOnly: true}),
  defineField({name: 'sourceHash', type: 'string', hidden: true}),
]

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
    schema: {
      types: [
        defineType({
          name: TYPE_NAMES.noul,
          title: 'Jev yes/no',
          type: 'object',
          components: {field: AnswerField},
          fields: [
            defineField({name: 'probability', type: 'number', readOnly: true}),
            ...bookkeepingFields,
          ],
        }),
        defineType({
          name: TYPE_NAMES.score,
          title: 'Jev score',
          type: 'object',
          components: {field: AnswerField},
          fields: [
            defineField({name: 'score', type: 'number', readOnly: true}),
            defineField({name: 'max', type: 'number', readOnly: true}),
            defineField({name: 'label', type: 'string', readOnly: true}),
            defineField({name: 'confidence', type: 'number', readOnly: true}),
            ...bookkeepingFields,
          ],
        }),
        // A top-level type rather than an inline array member, so GraphQL can deploy it.
        defineType({
          name: TYPE_NAMES.choiceProbability,
          title: 'Jev choice probability',
          type: 'object',
          fields: [
            defineField({name: 'option', type: 'string'}),
            defineField({name: 'probability', type: 'number'}),
          ],
        }),
        defineType({
          name: TYPE_NAMES.choice,
          title: 'Jev choice',
          type: 'object',
          components: {field: AnswerField},
          fields: [
            defineField({name: 'choice', type: 'string', readOnly: true}),
            defineField({name: 'confidence', type: 'number', readOnly: true}),
            defineField({
              name: 'probabilities',
              type: 'array',
              readOnly: true,
              of: [defineArrayMember({type: TYPE_NAMES.choiceProbability})],
            }),
            ...bookkeepingFields,
          ],
        }),
      ],
    },
  }
})
