import {describe, expect, it} from 'vitest'

import type {JevQuestion} from './evaluate'
import {meaningOf, segmentFills, shortLabel, toValue} from './mapping'

describe('toValue', () => {
  it('stores a noul answer as a rounded probability', () => {
    const question: JevQuestion = {
      type: 'boolean',
      instructions: 'x',
      criteria: {true: 'y', false: 'n'},
    }
    expect(toValue({type: 'boolean', probability: 0.123456}, question)).toEqual({
      probability: 0.1235,
    })
  })

  it('clamps a score to the scale and labels the nearest criterion', () => {
    const question: JevQuestion = {
      type: 'score',
      instructions: 'x',
      criteria: ['none: a', 'some: b', 'all: c'],
    }
    expect(
      toValue({type: 'score', score: 1.4, probabilities: {}, confidence: 0.9}, question),
    ).toEqual({
      score: 1.4,
      max: 2,
      label: 'some',
      confidence: 0.9,
    })
    expect(toValue({type: 'score', score: 7, probabilities: {}}, question)).toMatchObject({
      score: 2,
      label: 'all',
    })
  })

  it('stores a choice with one uniquely keyed probability per option, in config order', () => {
    const question: JevQuestion = {
      type: 'choice',
      instructions: 'x',
      criteria: {'a b': 'first', 'a_b': 'second'},
    }
    const value = toValue(
      {type: 'choice', choice: 'a_b', probabilities: {'a b': 0.25, 'a_b': 0.75}},
      question,
    )
    expect(value.choice).toBe('a_b')
    expect(value.confidence).toBe(0.75)
    expect(
      value.probabilities?.map((entry) => [entry._key, entry.option, entry.probability]),
    ).toEqual([
      ['option-0', 'a b', 0.25],
      ['option-1', 'a_b', 0.75],
    ])
  })

  it('stores nothing when the answer does not match the question', () => {
    const question: JevQuestion = {type: 'score', instructions: 'x', criteria: ['a', 'b']}
    expect(toValue({type: 'boolean', probability: 0.5}, question)).toEqual({})
  })
})

describe('segmentFills', () => {
  it('fills one segment per criterion reached, and part of the next', () => {
    expect(segmentFills(0.8, 4)).toEqual([1, 0.8, 0, 0].map((n) => expect.closeTo(n)))
    expect(segmentFills(0, 3)).toEqual([1, 0, 0])
    expect(segmentFills(2, 3)).toEqual([1, 1, 1])
  })
})

describe('criterion text', () => {
  it('splits a criterion into its short label and meaning', () => {
    expect(shortLabel('anecdotal: personal experience')).toBe('anecdotal')
    expect(meaningOf('anecdotal: personal experience')).toBe('personal experience')
    expect(shortLabel('plain')).toBe('plain')
    expect(meaningOf('plain')).toBe('plain')
  })
})
