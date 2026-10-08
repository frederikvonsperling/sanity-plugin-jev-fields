import {RefreshIcon} from '@sanity/icons/Refresh'
import {Badge, Box, Button, Card, Flex, Spinner, Stack, Text} from '@sanity/ui'
import type {ReactNode} from 'react'
import {keyframes, styled} from 'styled-components'

import {meaningOf, segmentFills, shortLabel} from './mapping'
import type {ChoiceSignal, NoulSignal, ScoreSignal} from './signals'
import type {SignalState} from './useSignals'

type Tone = 'critical' | 'caution' | 'positive' | 'primary' | 'default'

const NEUTRAL_COLOR = 'hsl(230 80% 66%)'
const MUTED_COLOR = 'hsl(215 12% 55%)'
const TRACK_COLOR = 'var(--card-border-color)'

const NOUL_LEVELS: Partial<Record<Tone, string>> = {
  critical: 'Low',
  caution: 'Medium',
  positive: 'High',
}

const clamp = (value: number) => Math.min(1, Math.max(0, value))
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** Red at 0, amber in the middle, green at 1. */
function trafficColor(fraction: number) {
  return `hsl(${Math.round(clamp(fraction) * 120)} 70% 52%)`
}

function trafficTone(fraction: number): Tone {
  if (fraction < 1 / 3) return 'critical'
  if (fraction < 2 / 3) return 'caution'
  return 'positive'
}

/** Colour and tone of a score, from the criterion it is nearest to. */
function scoreLook(signal: ScoreSignal, value: number, max: number) {
  if (signal.colors === 'neutral') return {color: NEUTRAL_COLOR, tone: 'primary' as Tone}
  const fraction = max > 0 ? Math.round(value) / max : 0
  const good = signal.colors === 'reverse' ? 1 - fraction : fraction
  return {color: trafficColor(good), tone: trafficTone(good)}
}

/** A thin rounded bar. `fraction` is 0–1. */
function Bar({fraction, color, label}: {fraction: number; color: string; label: string}) {
  const percent = Math.round(clamp(fraction) * 100)
  return (
    <Box
      flex={1}
      // A native <meter> can't hold the styled fill below, so this keeps role="meter".
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={label}
      style={{height: 4, borderRadius: 4, overflow: 'hidden', background: TRACK_COLOR}}
    >
      <div
        style={{
          width: `${percent}%`,
          height: '100%',
          borderRadius: 4,
          background: color,
          transition: 'width 400ms ease, background-color 400ms ease',
        }}
      />
    </Box>
  )
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

/** The value a chip shows, and its colour. */
function chipValue({signal, value}: SignalState): {text: string; color?: string} {
  if (!value) return {text: '–'}
  switch (signal.type) {
    case 'noul':
      return typeof value.probability === 'number'
        ? {text: `${Math.round(value.probability * 100)}%`, color: trafficColor(value.probability)}
        : {text: '–'}
    case 'score': {
      if (typeof value.score !== 'number') return {text: '–'}
      const max = value.max ?? signal.criteria.length - 1
      return {
        text: `${value.score.toFixed(1)}/${max}`,
        color: scoreLook(signal, value.score, max).color,
      }
    }
    case 'choice':
      return value.choice ? {text: capitalize(value.choice), color: NEUTRAL_COLOR} : {text: '–'}
    default:
      return {text: '–'}
  }
}

function Chip({
  signal,
  selected,
  onSelect,
}: {
  signal: SignalState
  selected: boolean
  onSelect: () => void
}) {
  const {text, color} = chipValue(signal)
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
      title={signal.stale && signal.value ? 'Out of date' : undefined}
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
              opacity: signal.stale && signal.value ? 0.5 : 1,
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
  signals: SignalState[]
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
  signal: SignalState
  empty: boolean
  onRetry: () => void
  onUpdateKey?: () => void
}

/** Expanded view of the selected chip. */
export function SignalDetail({signal, empty, onRetry, onUpdateKey}: DetailProps) {
  const body = signal.problem ? (
    <Text size={1}>{signal.problem}</Text>
  ) : !signal.value ? (
    <Text size={1} muted>
      {empty ? 'Add content to this field to evaluate it.' : 'Not evaluated yet.'}
    </Text>
  ) : signal.signal.type === 'noul' ? (
    <NoulBody signal={signal.signal} probability={signal.value.probability ?? 0} />
  ) : signal.signal.type === 'score' ? (
    <ScoreBody
      signal={signal.signal}
      score={signal.value.score ?? 0}
      max={signal.value.max ?? signal.signal.criteria.length - 1}
    />
  ) : (
    <ChoiceBody
      signal={signal.signal}
      choice={signal.value.choice}
      probabilities={signal.value.probabilities ?? []}
    />
  )

  const {tone, aside} = detailHeader(signal)

  return (
    <Card padding={4} radius={2} border tone={signal.problem ? 'critical' : tone}>
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
        {signal.stale && signal.value && !signal.loading && (
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

/** Card tone and the header's right-hand side: a badge, or a choice's meaning. */
function detailHeader({signal, value}: SignalState): {tone: 'default' | Tone; aside: ReactNode} {
  if (!value) return {tone: 'default', aside: null}
  if (signal.type === 'noul' && typeof value.probability === 'number') {
    const tone = trafficTone(value.probability)
    const level = NOUL_LEVELS[tone]
    return {tone: tone === 'positive' ? 'default' : tone, aside: <Badge tone={tone}>{level}</Badge>}
  }
  if (signal.type === 'score' && typeof value.score === 'number') {
    const max = value.max ?? signal.criteria.length - 1
    const {tone} = scoreLook(signal, value.score, max)
    const label = capitalize(value.label ?? shortLabel(signal.criteria[Math.round(value.score)]))
    return {
      tone: tone === 'critical' || tone === 'caution' ? tone : 'default',
      aside: <Badge tone={tone}>{label}</Badge>,
    }
  }
  if (signal.type === 'choice' && value.choice) {
    return {
      tone: 'default',
      aside: (
        <Text size={1} muted>
          {signal.criteria[value.choice]}
        </Text>
      ),
    }
  }
  return {tone: 'default', aside: null}
}

function NoulBody({signal, probability}: {signal: NoulSignal; probability: number}) {
  const percent = Math.round(probability * 100)
  return (
    <Stack gap={4}>
      <Flex align="baseline" gap={2}>
        <Text size={4} weight="medium">
          {percent}%
        </Text>
        {signal.label && (
          <Text size={1} muted>
            {signal.label}
          </Text>
        )}
      </Flex>
      <Bar
        fraction={probability}
        color={trafficColor(probability)}
        label={`${signal.title ?? 'Yes'}: ${percent}%`}
      />
      <Text size={1} muted>
        {probability >= 0.5 ? signal.true : signal.false}
      </Text>
    </Stack>
  )
}

function ScoreBody({signal, score, max}: {signal: ScoreSignal; score: number; max: number}) {
  const {color} = scoreLook(signal, score, max)
  const nearest = Math.round(score)
  const fills = segmentFills(score, signal.criteria.length)
  const next = signal.criteria[nearest + 1]
  return (
    <Stack gap={4}>
      <Flex gap={1}>
        {signal.criteria.map((criterion, index) => (
          <Stack key={criterion} gap={2} flex={1}>
            <Bar
              fraction={fills[index]}
              color={color}
              label={`${index}: ${shortLabel(criterion)}`}
            />
            <Text
              size={1}
              weight={index === nearest ? 'medium' : 'regular'}
              muted={index > nearest}
              style={index < nearest ? {color} : undefined}
              textOverflow="ellipsis"
            >
              {index} · {capitalize(shortLabel(criterion))}
            </Text>
          </Stack>
        ))}
      </Flex>
      <Text size={1} muted>
        {capitalize(meaningOf(signal.criteria[nearest]))} (score {score.toFixed(1)} of {max}).
        {next ? ` To move up: ${meaningOf(next)}.` : ''}
      </Text>
    </Stack>
  )
}

function ChoiceBody({
  signal,
  choice,
  probabilities,
}: {
  signal: ChoiceSignal
  choice: string | undefined
  probabilities: {option?: string; probability?: number}[]
}) {
  const options = Object.keys(signal.criteria)
  const nameWidth = `${Math.max(...options.map((name) => name.length), 4) + 2}ch`
  return (
    <Stack gap={3}>
      {options.map((option) => {
        const probability = probabilities.find((entry) => entry.option === option)?.probability ?? 0
        const winner = option === choice
        const percent = Math.round(probability * 100)
        return (
          <Flex key={option} align="center" gap={3}>
            <Box style={{width: nameWidth}}>
              <Text size={1} weight={winner ? 'semibold' : 'regular'} muted={!winner}>
                {capitalize(option)}
              </Text>
            </Box>
            <Bar
              fraction={probability}
              color={winner ? NEUTRAL_COLOR : MUTED_COLOR}
              label={`${option}: ${percent}%`}
            />
            <Box style={{minWidth: '4ch', textAlign: 'right'}}>
              <Text size={1} muted={!winner}>
                {percent}%
              </Text>
            </Box>
          </Flex>
        )
      })}
    </Stack>
  )
}
