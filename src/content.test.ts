import {describe, expect, it} from 'vitest'

import {fingerprint, toText} from './content'

const block = (text: string) => ({
  _type: 'block',
  _key: text,
  children: [{_type: 'span', _key: 's', text}],
})

describe('toText', () => {
  it('turns Portable Text into paragraphs', () => {
    expect(toText([block('First.'), block('Second.')])).toBe('First.\n\nSecond.')
  })

  it('reads strings, numbers, slugs and nested objects, skipping system keys', () => {
    expect(toText('Plain')).toBe('Plain')
    expect(toText(42)).toBe('42')
    expect(toText({_type: 'slug', current: 'my-post'})).toBe('my-post')
    expect(toText({_type: 'seo', _key: 'k', title: 'A', description: 'B'})).toBe('A\nB')
    expect(toText(['one', '', 'two'])).toBe('one\ntwo')
  })

  it('treats missing values as empty', () => {
    expect(toText(undefined)).toBe('')
    expect(toText(null)).toBe('')
    expect(toText([])).toBe('')
  })
})

describe('fingerprint', () => {
  it('is stable for equal input and changes with it', () => {
    expect(fingerprint(['a', 1])).toBe(fingerprint(['a', 1]))
    expect(fingerprint(['a', 1])).not.toBe(fingerprint(['a', 2]))
    expect(fingerprint('x')).toMatch(/^[0-9a-f]{8}$/)
  })
})
