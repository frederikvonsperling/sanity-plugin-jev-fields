import {Box} from '@sanity/ui'

export type Tone = 'critical' | 'caution' | 'positive' | 'primary' | 'default'

export const NEUTRAL_COLOR = 'hsl(230 80% 66%)'

export const MUTED_COLOR = 'hsl(215 12% 55%)'

export const ERROR_COLOR = '#f03e2f'

const TRACK_COLOR = 'var(--card-border-color)'

export const clampToFraction = (value: number) => Math.min(1, Math.max(0, value))

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** Red at 0, amber in the middle, green at 1. */
export function trafficColor(fraction: number) {
  return `hsl(${Math.round(clampToFraction(fraction) * 120)} 70% 52%)`
}

export function trafficTone(fraction: number): Tone {
  if (fraction < 1 / 3) return 'critical'

  if (fraction < 2 / 3) return 'caution'

  return 'positive'
}

/** A thin rounded bar. `fraction` is 0–1. */
export function Bar({fraction, color, label}: {fraction: number; color: string; label: string}) {
  const percent = Math.round(clampToFraction(fraction) * 100)

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
