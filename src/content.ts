/** Flattens a field's value into the plain text Jev evaluates. */
export function toText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    // Portable Text blocks become paragraphs; other arrays become lines.
    const separator = value.some(isBlock) ? '\n\n' : '\n'
    return value
      .map(toText)
      .filter((text) => text !== '')
      .join(separator)
  }
  if (isRecord(value)) {
    if (isBlock(value)) return value.children.map((child) => child.text ?? '').join('')
    if (value._type === 'slug') return toText(value.current)
    return Object.entries(value)
      .filter(([key]) => !key.startsWith('_'))
      .map(([, child]) => toText(child))
      .filter((text) => text !== '')
      .join('\n')
  }
  return ''
}

function isBlock(value: unknown): value is {_type: 'block'; children: {text?: string}[]} {
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
