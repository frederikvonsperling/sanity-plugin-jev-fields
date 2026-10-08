import {describe, expect, it} from 'vitest'

import {choice, noul, questionOf, score, titleOf} from './signals'

describe('questionOf', () => {
  it('turns each signal into the question Jev answers', () => {
    expect(questionOf(noul({instructions: 'Easy?', true: 'Yes', false: 'No'}))).toEqual({
      type: 'boolean',
      instructions: 'Easy?',
      criteria: {true: 'Yes', false: 'No'},
    })
    expect(questionOf(score({instructions: 'Rate', criteria: ['low', 'high']}))).toEqual({
      type: 'score',
      instructions: 'Rate',
      criteria: ['low', 'high'],
    })
    expect(questionOf(choice({instructions: 'Tone?', criteria: {a: 'A', b: 'B'}}))).toMatchObject({
      type: 'choice',
    })
  })

  it.each([
    [noul({instructions: '', true: 'Yes', false: 'No'}), 'instructions'],
    [noul({instructions: 'Easy?', true: 'Yes', false: ' '}), '`true` and `false`'],
    [score({instructions: 'Rate', criteria: ['only']}), 'at least two'],
    [
      score({instructions: 'Rate', criteria: Array.from({length: 11}, (_, i) => `${i}`)}),
      'at most ten',
    ],
    [choice({instructions: 'Tone?', criteria: {a: 'A'}}), 'at least two'],
  ])('explains config that cannot be asked: %#', (signal, problem) => {
    expect(questionOf(signal)).toEqual({problem: expect.stringContaining(problem)})
  })
})

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
