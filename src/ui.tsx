import {RefreshIcon} from '@sanity/icons/Refresh'
import {Badge, Box, Button, Card, Flex, Spinner, Stack, Text} from '@sanity/ui'
import {useTranslation} from 'sanity'
import {keyframes, styled} from 'styled-components'

import {JEV_NAMESPACE} from './i18n'
import type {SignalError} from './lifecycle'
import {MUTED_COLOR} from './look'
import type {SignalView} from './useSignals'

export type Translate = ReturnType<typeof useTranslation>['t']

/** An evaluation error in the Studio's language; errors from outside the Gateway as they are. */
export function errorText(t: Translate, error: SignalError): string {
  switch (error.kind) {
    case 'auth':
      return t('error.auth')
    case 'invalid':
      return t('error.invalid', {detail: error.detail ?? error.status})
    case 'busy':
      return t('error.busy')
    case 'failed':
      return error.detail
        ? t('error.failed-with-detail', {status: error.status, detail: error.detail})
        : t('error.failed', {status: error.status})
    case 'unexpected':
      return t('error.unexpected')
    default:
      return error.message
  }
}

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
  const {t} = useTranslation(JEV_NAMESPACE)
  const {text, color} = signal.reading?.chip ?? {text: t('chip.empty'), color: undefined}
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
      title={signal.stale ? t('chip.out-of-date') : undefined}
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
            {failed ? t('chip.error') : text}
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
  const {t} = useTranslation(JEV_NAMESPACE)
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
            text={t('strip.set-up')}
            mode="ghost"
            tone="primary"
            fontSize={1}
            padding={2}
            onClick={onSetUp}
          />
        ) : (
          <Flex align="center" gap={1}>
            <Text size={0} muted>
              {t('strip.label')}
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
                title={t('strip.evaluate-all')}
                aria-label={t('strip.evaluate-all')}
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
  const {t} = useTranslation(JEV_NAMESPACE)
  const {reading} = signal
  const body = signal.problem ? (
    <Text size={1}>{signal.problem}</Text>
  ) : reading ? (
    reading.body
  ) : (
    <Text size={1} muted>
      {empty ? t('detail.empty-field') : t('detail.not-evaluated')}
    </Text>
  )
  const aside = !reading?.aside ? null : 'badge' in reading.aside ? (
    <Badge tone={reading.aside.tone}>{reading.aside.badge}</Badge>
  ) : 'level' in reading.aside ? (
    <Badge tone={reading.aside.tone}>{t(`noul.level.${reading.aside.level}`)}</Badge>
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
            {t('detail.out-of-date')}
          </Text>
        )}
        {signal.error && (
          <Card padding={3} radius={2} tone="critical" border>
            <Flex align="center" gap={3} wrap="wrap">
              <Box flex={1}>
                <Text size={1}>{errorText(t, signal.error)}</Text>
              </Box>
              {signal.keyRejected && onUpdateKey ? (
                <Button
                  text={t('detail.update-key')}
                  mode="ghost"
                  fontSize={1}
                  onClick={onUpdateKey}
                />
              ) : (
                <Button text={t('detail.try-again')} mode="ghost" fontSize={1} onClick={onRetry} />
              )}
            </Flex>
          </Card>
        )}
      </Stack>
    </Card>
  )
}
