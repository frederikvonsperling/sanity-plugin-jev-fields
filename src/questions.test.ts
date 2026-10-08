import {describe, expect, it} from 'vitest'

import {noul, titleOf} from './questions'

describe('titleOf', () => {
  const question = noul({instructions: 'x', true: 'y', false: 'n'})

  it.each([
    ['readable', 'Readable'],
    ['readingLevel', 'Reading level'],
    ['reading_level', 'Reading level'],
  ])('%s → %s', (key, title) => {
    expect(titleOf(key, question)).toBe(title)
  })

  it('prefers an explicit title', () => {
    expect(titleOf('readable', {...question, title: 'Plain language'})).toBe('Plain language')
  })
})
