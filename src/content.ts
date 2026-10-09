/** Flattens a field's value into the plain text Jev evaluates. */
export function flattenToText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  if (Array.isArray(value)) {
    // Portable Text blocks become paragraphs; other arrays become lines.
    const separator = value.some(isPortableTextBlock) ? '\n\n' : '\n'

    return value
      .map(flattenToText)
      .filter((text) => text !== '')
      .join(separator)
  }

  if (isRecord(value)) {
    if (isPortableTextBlock(value)) return value.children.map((child) => child.text ?? '').join('')
    if (value._type === 'slug') return flattenToText(value.current)

    return Object.entries(value)
      .filter(([key]) => !key.startsWith('_'))
      .map(([, child]) => flattenToText(child))
      .filter((text) => text !== '')
      .join('\n')
  }

  return ''
}

function isPortableTextBlock(
  value: unknown,
): value is {_type: 'block'; children: {text?: string}[]} {
  return isRecord(value) && value._type === 'block' && Array.isArray(value.children)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** FNV-1a: a small, stable fingerprint; collisions only cost a skipped re-evaluation. */
export function fingerprint(input: unknown): string {
  const text = JSON.stringify(input)
  let hash = 0x811c9dc5

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** Jev reads at most this many tokens of state (plus the longest question) per request. */
export const STATE_TOKEN_LIMIT = 32_000

/** About four characters per token for English text. */
export const estimateTokenCount = (text: string) => Math.ceil(text.length / 4)

/** Close enough to Jev's limit that evaluations may be refused. */
export const isNearTokenLimit = (text: string) =>
  estimateTokenCount(text) > STATE_TOKEN_LIMIT * 0.875
