import {describe, expect, it} from 'vitest'

import {
  estimateTokenCount,
  fingerprint,
  flattenToText,
  isDocumentValue,
  isNearTokenLimit,
} from './content'

const block = (text: string) => ({
  _type: 'block',
  _key: text,
  children: [{_type: 'span', _key: 's', text}],
})

describe('flattenToText', () => {
  it('turns Portable Text into paragraphs', () => {
    expect(flattenToText([block('First.'), block('Second.')])).toBe('First.\n\nSecond.')
  })

  it('reads strings, numbers, slugs and nested objects, skipping system keys', () => {
    expect(flattenToText('Plain')).toBe('Plain')
    expect(flattenToText(42)).toBe('42')
    expect(flattenToText({_type: 'slug', current: 'my-post'})).toBe('my-post')
    expect(flattenToText({_type: 'seo', _key: 'k', title: 'A', description: 'B'})).toBe('A\nB')
    expect(flattenToText(['one', '', 'two'])).toBe('one\ntwo')
  })

  it('treats missing values as empty', () => {
    expect(flattenToText(undefined)).toBe('')
    expect(flattenToText(null)).toBe('')
    expect(flattenToText([])).toBe('')
  })
})

describe('isDocumentValue', () => {
  it('accepts JSON as Sanity stores it, including fields left undefined while editing', () => {
    expect(isDocumentValue([block('First.')])).toBe(true)
    expect(isDocumentValue({_type: 'slug', current: undefined})).toBe(true)
    expect(isDocumentValue(Object.create(null))).toBe(true)
    expect(isDocumentValue(null)).toBe(true)
  })

  it('rejects anything JSON cannot hold, however deep', () => {
    expect(isDocumentValue(() => 'x')).toBe(false)
    expect(isDocumentValue(new Date())).toBe(false)
    expect(isDocumentValue({seo: {tags: [Symbol('x')]}})).toBe(false)
  })
})

describe('fingerprint', () => {
  it('is stable for equal input and changes with it', () => {
    expect(fingerprint(['a', 1])).toBe(fingerprint(['a', 1]))
    expect(fingerprint(['a', 1])).not.toBe(fingerprint(['a', 2]))
    expect(fingerprint('x')).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('token estimate', () => {
  it('counts about four characters per token and warns near the 32k limit', () => {
    expect(estimateTokenCount('abcdefgh')).toBe(2)
    expect(isNearTokenLimit('x'.repeat(4 * 27_000))).toBe(false)
    expect(isNearTokenLimit('x'.repeat(4 * 29_000))).toBe(true)
  })
})
