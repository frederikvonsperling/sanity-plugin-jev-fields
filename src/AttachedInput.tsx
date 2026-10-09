import {Card, Stack, Text} from '@sanity/ui'
import {useState} from 'react'
import {useTranslation, type FormPatch, type InputProps, type PatchEvent} from 'sanity'

import {
  estimateTokenCount,
  flattenToText,
  isDocumentValue,
  isNearTokenLimit,
  STATE_TOKEN_LIMIT,
} from './content'
import {JEV_NAMESPACE} from './i18n'
import type {JevQuestions} from './questions'
import {JevKeyDialog} from './secrets'
import {QuestionDetail, QuestionStrip} from './ui'
import {useQuestions} from './useQuestions'

type OnChange = (patch: FormPatch | FormPatch[] | PatchEvent) => void

/** Renders a field with `options.jev` as usual, with its question strip and details below. */
export function AttachedInput({questions, ...props}: InputProps & {questions: JevQuestions}) {
  const {t} = useTranslation(JEV_NAMESPACE)
  const parentOnChange: OnChange = props.onChange
  const state = isDocumentValue(props.value) ? flattenToText(props.value) : ''

  const jev = useQuestions({
    questions,
    path: props.path,
    state,
    readOnly: !!props.readOnly,
  })

  // Questions only evaluate on their own after an edit made here, never because someone
  // else's edit arrived, so opening a document never writes to it.
  const onChange: OnChange = (patch) => {
    jev.localEdit()
    parentOnChange(patch)
  }

  const inputProps: InputProps = {...props, onChange}

  // String, text, number, url and email inputs edit through their element's own onChange, which
  // patches the form directly and never calls `onChange` above.
  if ('elementProps' in inputProps && 'onChange' in inputProps.elementProps) {
    const elementProps = inputProps.elementProps

    inputProps.elementProps = {
      ...elementProps,
      onChange: (event) => {
        jev.localEdit()
        elementProps.onChange(event)
      },
    }
  }

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [keyDialogOpen, setKeyDialogOpen] = useState(false)
  const selectedQuestion = jev.questions.find((question) => question.key === selectedKey)

  return (
    <Stack gap={2}>
      <div>
        {props.renderDefault(inputProps)}
        <QuestionStrip
          questions={jev.questions}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          setupStatus={jev.setupStatus}
          canRun={jev.canRun}
          loading={jev.loading}
          onEvaluateAll={jev.evaluateAllNow}
          onSetUp={() => setKeyDialogOpen(true)}
        />
      </div>
      {isNearTokenLimit(state) && (
        <Card padding={3} radius={2} tone="caution" border>
          <Text size={1}>
            {t('field.too-long', {
              tokens: Math.round(estimateTokenCount(state) / 1000),
              limit: STATE_TOKEN_LIMIT / 1000,
            })}
          </Text>
        </Card>
      )}
      {selectedQuestion && (
        <QuestionDetail
          question={selectedQuestion}
          empty={jev.empty}
          onRetry={() => jev.evaluateNow(selectedQuestion.key)}
          onUpdateKey={jev.isKeyStoredInSecrets ? () => setKeyDialogOpen(true) : undefined}
        />
      )}
      {keyDialogOpen && <JevKeyDialog onClose={() => setKeyDialogOpen(false)} />}
    </Stack>
  )
}
