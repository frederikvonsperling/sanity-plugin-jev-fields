import {Card, Stack, Text} from '@sanity/ui'
import {useState} from 'react'
import {useTranslation, type FormPatch, type InputProps, type PatchEvent} from 'sanity'

import {estimateTokens, nearTokenLimit, STATE_TOKEN_LIMIT, toText} from './content'
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
  const {value} = props
  const state = toText(value)
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

  const [selected, setSelected] = useState<string | null>(null)
  const [keyDialogOpen, setKeyDialogOpen] = useState(false)
  const selectedQuestion = jev.questions.find((question) => question.key === selected)

  return (
    <Stack gap={2}>
      <div>
        {props.renderDefault(inputProps)}
        <QuestionStrip
          questions={jev.questions}
          selected={selected}
          onSelect={setSelected}
          setup={jev.setup}
          canRun={jev.canRun}
          loading={jev.loading}
          onRunAll={jev.runAll}
          onSetUp={() => setKeyDialogOpen(true)}
        />
      </div>
      {nearTokenLimit(state) && (
        <Card padding={3} radius={2} tone="caution" border>
          <Text size={1}>
            {t('field.too-long', {
              tokens: Math.round(estimateTokens(state) / 1000),
              limit: STATE_TOKEN_LIMIT / 1000,
            })}
          </Text>
        </Card>
      )}
      {selectedQuestion && (
        <QuestionDetail
          question={selectedQuestion}
          empty={jev.empty}
          onRetry={() => jev.run(selectedQuestion.key)}
          onUpdateKey={jev.keyInSecrets ? () => setKeyDialogOpen(true) : undefined}
        />
      )}
      {keyDialogOpen && <JevKeyDialog onClose={() => setKeyDialogOpen(false)} />}
    </Stack>
  )
}
