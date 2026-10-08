import {RefreshIcon} from '@sanity/icons/Refresh'
import {Badge, Box, Button, Card, Flex, Spinner, Stack, Text} from '@sanity/ui'
import {keyframes, styled} from 'styled-components'

import {MUTED_COLOR} from './look'
import type {SignalView} from './useSignals'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
`

/** The chip's status dot: 6px, pulsing while the signal evaluates so the chip never shifts. */
const Dot = styled.span<{$color: string; $pulse: boolean}>`
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${({$color}) => $color};
  animation: ${({$pulse}) => ($pulse ? pulse : 'none')} 1s ease-in-out infinite;
`

function Chip({
  signal,
  selected,
  onSelect,
}: {
  signal: SignalView
  selected: boolean
  onSelect: () => void
}) {
  const {text, color} = signal.reading?.chip ?? {text: '–', color: undefined}
  const failed = !!signal.error || !!signal.problem
  return (
    <Card
      as="button"
      type="button"
      radius={2}
      paddingX={2}
      paddingY={2}
      onClick={onSelect}
      aria-pressed={selected}
      title={signal.stale ? 'Out of date' : undefined}
      style={{
        display: 'inline-flex',
        flex: 'none',
        width: 'auto',
        border: 0,
        cursor: 'pointer',
        // A quiet highlight, as in the design, rather than Sanity UI's solid "selected" blue.
        background: selected ? 'rgba(128, 128, 128, 0.16)' : undefined,
      }}
    >
      <Flex align="center" gap={2}>
        <Dot
          aria-hidden
          $color={failed ? '#f03e2f' : (color ?? MUTED_COLOR)}
          $pulse={signal.loading}
        />
        {/* Title and value share one line of text, so they share a baseline whatever the font. */}
        <Text size={1}>
          {signal.title}
          <span
            style={{
              marginLeft: '0.6em',
              fontFamily: MONO,
              color: failed ? '#f03e2f' : color,
              opacity: signal.stale ? 0.5 : 1,
            }}
          >
            {failed ? 'Error' : text}
          </span>
        </Text>
      </Flex>
    </Card>
  )
}

interface StripProps {
  signals: SignalView[]
  selected: string | null
  onSelect: (key: string | null) => void
  setup: 'ready' | 'loading' | 'missing'
  canRun: boolean
  loading: boolean
  onRunAll: () => void
  onSetUp: () => void
}

/** The row of signal chips under an attached field. */
export function SignalStrip({
  signals,
  selected,
  onSelect,
  setup,
  canRun,
  loading,
  onRunAll,
  onSetUp,
}: StripProps) {
  return (
    // Joins the input above: its bottom border becomes the divider between content and signals.
    <Card
      border
      padding={1}
      style={{
        borderTop: 0,
        marginTop: -2,
        borderBottomLeftRadius: 3,
        borderBottomRightRadius: 3,
      }}
    >
      <Flex align="center" gap={2}>
        <Flex flex={1} align="center" gap={1} wrap="wrap">
          {signals.map((signal) => (
            <Chip
              key={signal.key}
              signal={signal}
              selected={selected === signal.key}
              onSelect={() => onSelect(selected === signal.key ? null : signal.key)}
            />
          ))}
        </Flex>
        {setup === 'missing' ? (
          <Button
            text="Set up Jev"
            mode="ghost"
            tone="primary"
            fontSize={1}
            padding={2}
            onClick={onSetUp}
          />
        ) : (
          <Flex align="center" gap={1}>
            <Text size={0} muted>
              Jev
            </Text>
            {loading ? (
              <Box padding={2}>
                <Spinner muted />
              </Box>
            ) : (
              <Button
                icon={RefreshIcon}
                mode="bleed"
                fontSize={1}
                padding={2}
                title="Evaluate all signals now"
                aria-label="Evaluate all signals now"
                disabled={!canRun}
                onClick={onRunAll}
              />
            )}
          </Flex>
        )}
      </Flex>
    </Card>
  )
}

interface DetailProps {
  signal: SignalView
  empty: boolean
  onRetry: () => void
  onUpdateKey?: () => void
}

/** Expanded view of the selected chip. */
export function SignalDetail({signal, empty, onRetry, onUpdateKey}: DetailProps) {
  const {reading} = signal
  const body = signal.problem ? (
    <Text size={1}>{signal.problem}</Text>
  ) : reading ? (
    reading.body
  ) : (
    <Text size={1} muted>
      {empty ? 'Add content to this field to evaluate it.' : 'Not evaluated yet.'}
    </Text>
  )
  const aside = !reading?.aside ? null : 'badge' in reading.aside ? (
    <Badge tone={reading.aside.tone}>{reading.aside.badge}</Badge>
  ) : (
    <Text size={1} muted>
      {reading.aside.note}
    </Text>
  )

  return (
    <Card
      padding={4}
      radius={2}
      border
      tone={signal.problem ? 'critical' : (reading?.tone ?? 'default')}
    >
      <Stack gap={4}>
        <Flex align="center" gap={3}>
          <Box flex={1}>
            <Text size={1} weight="semibold">
              {signal.title}
            </Text>
          </Box>
          {aside}
        </Flex>
        {body}
        {signal.stale && !signal.loading && (
          <Text size={0} muted>
            Out of date: the field changed since this was evaluated.
          </Text>
        )}
        {signal.error && (
          <Card padding={3} radius={2} tone="critical" border>
            <Flex align="center" gap={3} wrap="wrap">
              <Box flex={1}>
                <Text size={1}>{signal.error}</Text>
              </Box>
              {signal.keyRejected && onUpdateKey ? (
                <Button text="Update API key" mode="ghost" fontSize={1} onClick={onUpdateKey} />
              ) : (
                <Button text="Try again" mode="ghost" fontSize={1} onClick={onRetry} />
              )}
            </Flex>
          </Card>
        )}
      </Stack>
    </Card>
  )
}
