import {Stack} from '@sanity/ui'
import {useState} from 'react'
import type {FormPatch, InputProps, PatchEvent} from 'sanity'

import {toText} from './content'
import {JevKeyDialog} from './secrets'
import type {JevSignals} from './signals'
import {SignalDetail, SignalStrip} from './ui'
import {useSignals} from './useSignals'

type OnChange = (patch: FormPatch | FormPatch[] | PatchEvent) => void

/** Renders a field with `options.jev` as usual, with its signal strip and details below. */
export function AttachedInput({signals, ...props}: InputProps & {signals: JevSignals}) {
  const parentOnChange: OnChange = props.onChange
  const {value} = props
  // Signals only evaluate on their own after an edit made here, never because someone
  // else's edit arrived, so opening a document never writes to it.
  const [touched, setTouched] = useState(false)
  const onChange: OnChange = (patch) => {
    setTouched(true)
    parentOnChange(patch)
  }
  const inputProps: InputProps = {...props, onChange}

  const jev = useSignals({
    signals,
    path: props.path,
    state: toText(value),
    touched,
    readOnly: !!props.readOnly,
  })

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
          loading={jev.signals.some((signal) => signal.loading)}
          onRunAll={jev.runAll}
          onSetUp={() => setKeyDialogOpen(true)}
        />
      </div>
      {selectedSignal && (
        <SignalDetail
          signal={selectedSignal}
          empty={jev.empty}
          onRetry={() => jev.run([selectedSignal.key])}
          onUpdateKey={jev.keyInSecrets ? () => setKeyDialogOpen(true) : undefined}
        />
      )}
      {keyDialogOpen && <JevKeyDialog onClose={() => setKeyDialogOpen(false)} />}
    </Stack>
  )
}
