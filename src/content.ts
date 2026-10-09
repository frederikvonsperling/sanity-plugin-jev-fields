/** A value as Sanity stores it in a document: JSON, plus `undefined` while a field is edited. */
export type DocumentValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | DocumentValue[]
  | DocumentObject

export interface DocumentObject {
  [key: string]: DocumentValue
}

/** Checks a value Sanity hands over untyped, all the way down. */
export function isDocumentValue(value: unknown): value is DocumentValue {
  if (value === null || value === undefined) return true

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true
  }

  if (Array.isArray(value)) return value.every(isDocumentValue)

  return isPlainObject(value) && Object.values(value).every(isDocumentValue)
}

/** Not an array, class instance or function: what JSON parses an object into. */
function isPlainObject(value: unknown): value is object {
  if (typeof value !== 'object' || value === null) return false

  const prototype = Object.getPrototypeOf(value)

  return prototype === Object.prototype || prototype === null
}

export function isDocumentObject(value: DocumentValue): value is DocumentObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** For a value Sanity hands over untyped that should be an object, such as a field's parent. */
export const isDocumentObjectValue = (value: unknown): value is DocumentObject =>
  isDocumentValue(value) && isDocumentObject(value)

export const isString = (value: DocumentValue): value is string => typeof value === 'string'

export const isNumber = (value: DocumentValue): value is number => typeof value === 'number'

/** Flattens a field's value into the plain text Jev evaluates. */
export function flattenToText(value: DocumentValue): string {
  if (value === null || value === undefined) return ''

  if (Array.isArray(value)) {
    // Portable Text blocks become paragraphs; other arrays become lines.
    const separator = value.some(isPortableTextBlock) ? '\n\n' : '\n'

    return value
      .map(flattenToText)
      .filter((text) => text !== '')
      .join(separator)
  }

  if (isDocumentObject(value)) {
    if (isPortableTextBlock(value)) return value.children.map(readSpanText).join('')

    if (value._type === 'slug') return flattenToText(value.current)

    return Object.entries(value)
      .filter(([key]) => !key.startsWith('_'))
      .map(([, child]) => flattenToText(child))
      .filter((text) => text !== '')
      .join('\n')
  }

  return String(value)
}

function isPortableTextBlock(
  value: DocumentValue,
): value is DocumentObject & {_type: 'block'; children: DocumentValue[]} {
  return isDocumentObject(value) && value._type === 'block' && Array.isArray(value.children)
}

const readSpanText = (span: DocumentValue) =>
  isDocumentObject(span) && isString(span.text) ? span.text : ''

/** FNV-1a: a small, stable fingerprint; collisions only cost a skipped re-evaluation. */
export function fingerprint(input: DocumentValue): string {
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
