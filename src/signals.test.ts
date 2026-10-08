import {describe, expect, it} from 'vitest'

import {noul, titleOf} from './signals'

describe('titleOf', () => {
  const signal = noul({instructions: 'x', true: 'y', false: 'n'})

  it.each([
    ['readable', 'Readable'],
    ['readingLevel', 'Reading level'],
    ['reading_level', 'Reading level'],
  ])('%s → %s', (key, title) => {
    expect(titleOf(key, signal)).toBe(title)
  })

  it('prefers an explicit title', () => {
    expect(titleOf('readable', {...signal, title: 'Plain language'})).toBe('Plain language')
  })
})
