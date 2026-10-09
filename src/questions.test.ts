import {describe, expect, it} from 'vitest'

import {noul, getQuestionTitle} from './questions'

describe('getQuestionTitle', () => {
  const question = noul({instructions: 'x', true: 'y', false: 'n'})

  it.each([
    ['readable', 'Readable'],
    ['readingLevel', 'Reading level'],
    ['reading_level', 'Reading level'],
  ])('%s → %s', (key, title) => {
    expect(getQuestionTitle(key, question)).toBe(title)
  })

  it('prefers an explicit title', () => {
    expect(getQuestionTitle('readable', {...question, title: 'Plain language'})).toBe(
      'Plain language',
    )
  })
})
