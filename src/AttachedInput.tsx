import {Card, Stack, Text} from '@sanity/ui'
import {useState} from 'react'
import type {FormPatch, InputProps, PatchEvent} from 'sanity'

import {estimateTokens, nearTokenLimit, STATE_TOKEN_LIMIT, toText} from './content'
import {JevKeyDialog} from './secrets'
import type {JevSignals} from './signals'
import {SignalDetail, SignalStrip} from './ui'
import {useSignals} from './useSignals'

type OnChange = (patch: FormPatch | FormPatch[] | PatchEvent) => void

/** Renders a field with `options.jev` as usual, with its signal strip and details below. */
export function AttachedInput({signals, ...props}: InputProps & {signals: JevSignals}) {
  const parentOnChange: OnChange = props.onChange
  const {value} = props
  const state = toText(value)
  const jev = useSignals({
    signals,
    path: props.path,
    state,
    readOnly: !!props.readOnly,
  })
  // Signals only evaluate on their own after an edit made here, never because someone
  // else's edit arrived, so opening a document never writes to it.
  const onChange: OnChange = (patch) => {
    jev.localEdit()
    parentOnChange(patch)
  }
  const inputProps: InputProps = {...props, onChange}

  const [selected, setSelected] = useState<string | null>(null)
  const [keyDialogOpen, setKeyDialogOpen] = useState(false)
  const selectedSignal = jev.signals.find((signal) => signal.key === selected)

  return (
    <Stack gap={2}>
      <div>
        {props.renderDefault(inputProps)}
        <SignalStrip
          signals={jev.signals}
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
            This field is about {Math.round(estimateTokens(state) / 1000)}k tokens long. Jev reads
            at most {STATE_TOKEN_LIMIT / 1000}k per question, so longer text may be refused.
          </Text>
        </Card>
      )}
      {selectedSignal && (
        <SignalDetail
          signal={selectedSignal}
          empty={jev.empty}
          onRetry={() => jev.run(selectedSignal.key)}
          onUpdateKey={jev.keyInSecrets ? () => setKeyDialogOpen(true) : undefined}
        />
      )}
      {keyDialogOpen && <JevKeyDialog onClose={() => setKeyDialogOpen(false)} />}
    </Stack>
  )
}
