import {describe, expect, it} from 'vitest'

import choiceFixture from '../__fixtures__/gateway/choice.json'
import noulFixture from '../__fixtures__/gateway/noul.json'
import scoreFixture from '../__fixtures__/gateway/score.json'
import type {JevAnswer} from '../evaluate'
import {choice, KIND_SCHEMA_TYPES, kindOf, noul, score} from './index'
import {meaningOf, segmentFills, shortLabel} from './score'

// JSON imports lose the literal types of the recorded answers.
const answerOf = (fixture: {response: {answers: {q: unknown}}}) =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  fixture.response.answers.q as JevAnswer

const readable = noul({instructions: 'Easy?', true: 'Yes', false: 'No', label: 'likely'})
const evidence = score({instructions: 'Rate', criteria: ['none: a', 'some: b', 'all: c']})
const tone = choice({instructions: 'Tone?', criteria: {formal: 'Reserved', casual: 'Relaxed'}})

describe('questions', () => {
  it('turns each signal into the question Jev answers', () => {
    expect(kindOf(readable).question).toEqual({
      type: 'boolean',
      instructions: 'Easy?',
      criteria: {true: 'Yes', false: 'No'},
    })
    expect(kindOf(evidence).question).toEqual({
      type: 'score',
      instructions: 'Rate',
      criteria: ['none: a', 'some: b', 'all: c'],
    })
    expect(kindOf(tone).question).toMatchObject({type: 'choice', criteria: tone.criteria})
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
    const kind = kindOf(signal)
    expect(kind.question).toBeUndefined()
    expect(kind.problem).toContain(problem)
  })

  it('explains an unknown signal type', () => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- config from plain JS
    const kind = kindOf({type: 'rating', instructions: 'x'} as unknown as typeof readable)
    expect(kind.problem).toMatch(/unknown/i)
    expect(kind.read({_type: 'jev.noul', probability: 1})).toBeUndefined()
  })
})

describe('stored answers', () => {
  it('stores a noul answer as a rounded probability', () => {
    expect(kindOf(readable).toStored({type: 'boolean', probability: 0.123456})).toEqual({
      _type: 'jev.noul',
      probability: 0.1235,
    })
  })

  it('clamps a score to the scale and labels the nearest criterion', () => {
    const kind = kindOf(evidence)
    expect(kind.toStored({type: 'score', score: 1.4, probabilities: {}, confidence: 0.9})).toEqual({
      _type: 'jev.score',
      score: 1.4,
      max: 2,
      label: 'some',
      confidence: 0.9,
    })
    expect(kind.toStored({type: 'score', score: 7, probabilities: {}})).toMatchObject({
      score: 2,
      label: 'all',
    })
  })

  it('stores a choice with one uniquely keyed probability per option, in config order', () => {
    const kind = kindOf(choice({instructions: 'x', criteria: {'a b': 'first', 'a_b': 'second'}}))
    const value = kind.toStored({
      type: 'choice',
      choice: 'a_b',
      probabilities: {'a b': 0.25, 'a_b': 0.75},
    })
    expect(value).toMatchObject({_type: 'jev.choice', choice: 'a_b', confidence: 0.75})
    expect(value).toHaveProperty('probabilities', [
      {_key: 'option-0', _type: 'jev.choiceProbability', option: 'a b', probability: 0.25},
      {_key: 'option-1', _type: 'jev.choiceProbability', option: 'a_b', probability: 0.75},
    ])
  })

  it('refuses an answer to a different kind of question', () => {
    expect(() => kindOf(evidence).toStored({type: 'boolean', probability: 0.5})).toThrow()
  })

  // What the plugin stores must fit the schema type it registers, or Sanity drops the field.
  it.each([
    ['noul', noul({instructions: 'x', true: 'y', false: 'n'}), answerOf(noulFixture)],
    [
      'score',
      score({instructions: 'x', criteria: scoreFixture.request.questions.q.criteria}),
      answerOf(scoreFixture),
    ],
    [
      'choice',
      choice({
        instructions: 'x',
        criteria: choiceFixture.request.questions.q.criteria,
      }),
      answerOf(choiceFixture),
    ],
  ])('stores a recorded %s answer in fields its schema type declares', (_name, signal, answer) => {
    const kind = kindOf(signal)
    const stored = kind.toStored(answer)
    const fieldsOf = (name: string) => {
      const type = KIND_SCHEMA_TYPES.find((other) => other.name === name)
      return type && 'fields' in type ? type.fields.map((field) => field.name) : []
    }

    const fields = fieldsOf(kind.typeName)
    expect(fields).toEqual(expect.arrayContaining(['evaluatedAt', 'model', 'sourceHash']))
    for (const [key, value] of Object.entries(stored)) {
      if (key === '_type') continue
      expect(fields).toContain(key)
      if (Array.isArray(value)) {
        for (const entry of value) {
          const member = fieldsOf(entry._type)
          for (const memberKey of Object.keys(entry)) {
            if (!memberKey.startsWith('_')) expect(member).toContain(memberKey)
          }
        }
      }
    }
    expect(kind.read({...stored, sourceHash: 'h'})?.value).toEqual({...stored, sourceHash: 'h'})
  })
})

describe('reading stored answers', () => {
  it.each([
    ['nothing', undefined],
    ['another kind', {_type: 'jev.score', score: 1, max: 2}],
    ['a missing probability', {_type: 'jev.noul'}],
  ])('treats %s as unanswered', (_name, stored) => {
    expect(kindOf(readable).read(stored)).toBeUndefined()
  })

  it('summarises a noul by its probability', () => {
    const reading = kindOf(readable).read({_type: 'jev.noul', probability: 0.2})
    expect(reading?.chip.text).toBe('20%')
    expect(reading?.tone).toBe('critical')
    expect(reading?.aside).toEqual({level: 'low', tone: 'critical'})
    // High probabilities are good news: the card stays neutral.
    expect(kindOf(readable).read({_type: 'jev.noul', probability: 0.9})?.tone).toBe('default')
  })

  it('summarises a score by its position and nearest criterion', () => {
    const reading = kindOf(evidence).read({_type: 'jev.score', score: 0.2, max: 2, label: 'none'})
    expect(reading?.chip.text).toBe('0.2/2')
    expect(reading?.aside).toEqual({badge: 'None', tone: 'critical'})
    expect(reading?.tone).toBe('critical')

    const reverse = kindOf({...evidence, colors: 'reverse'})
    expect(reverse.read({_type: 'jev.score', score: 0.2, max: 2})?.aside).toEqual({
      badge: 'None',
      tone: 'positive',
    })
  })

  it('summarises a choice by its option and what it means', () => {
    const reading = kindOf(tone).read({_type: 'jev.choice', choice: 'casual', probabilities: []})
    expect(reading?.chip.text).toBe('Casual')
    expect(reading?.aside).toEqual({note: 'Relaxed'})
    expect(reading?.tone).toBe('default')
  })
})

describe('score criteria', () => {
  it('fills one segment per criterion reached, and part of the next', () => {
    expect(segmentFills(0.8, 4)).toEqual([1, 0.8, 0, 0].map((n) => expect.closeTo(n)))
    expect(segmentFills(0, 3)).toEqual([1, 0, 0])
    expect(segmentFills(2, 3)).toEqual([1, 1, 1])
  })

  it('splits a criterion into its short label and meaning', () => {
    expect(shortLabel('anecdotal: personal experience')).toBe('anecdotal')
    expect(meaningOf('anecdotal: personal experience')).toBe('personal experience')
    expect(shortLabel('plain')).toBe('plain')
    expect(meaningOf('plain')).toBe('plain')
  })
})

describe('rules', () => {
  const stored = {
    noul: (probability: number) => ({_type: 'jev.noul', probability}),
    score: (value: number) => ({_type: 'jev.score', score: value, max: 2}),
    choice: (option: string) => ({_type: 'jev.choice', choice: option}),
  }

  it('reports a noul outside its bounds, in percent', () => {
    const kind = kindOf({...readable, warn: {atLeast: 0.6}, require: {atMost: 0.95}})
    expect(kind.check('warn', stored.noul(0.42), 'Readable')).toBe('Readable is 42%, below 60%.')
    expect(kind.check('warn', stored.noul(0.6), 'Readable')).toBeUndefined()
    expect(kind.check('require', stored.noul(0.97), 'Readable')).toBe('Readable is 97%, above 95%.')
  })

  it('reports a score outside its bounds, with the nearest criteria', () => {
    const kind = kindOf({...evidence, require: {atLeast: 2}})
    expect(kind.check('require', stored.score(0.6), 'Evidence')).toBe(
      'Evidence is 0.6 (some), below 2 (all).',
    )
    expect(kind.check('require', stored.score(2), 'Evidence')).toBeUndefined()
  })

  it('reports a choice that is not one of the allowed options', () => {
    const kind = kindOf({...tone, warn: {oneOf: ['formal']}})
    expect(kind.check('warn', stored.choice('casual'), 'Tone')).toBe(
      'Tone is "casual", not "formal".',
    )
    expect(kind.check('warn', stored.choice('formal'), 'Tone')).toBeUndefined()
  })

  it('says nothing without a rule at that level, or without an answer', () => {
    const kind = kindOf({...readable, warn: {atLeast: 0.6}})
    expect(kind.check('require', stored.noul(0.1), 'Readable')).toBeUndefined()
    expect(kind.check('warn', undefined, 'Readable')).toBeUndefined()
    expect(kind.check('warn', stored.score(0), 'Readable')).toBeUndefined()
  })

  it.each([
    [{...readable, warn: {atLeast: 1.5}}, '`warn.atLeast` must be a number from 0 to 1.'],
    [{...evidence, require: {atMost: 5}}, '`require.atMost` must be a number from 0 to 2.'],
    [
      {...tone, warn: {oneOf: ['playful']}},
      '`warn.oneOf` names "playful", which is not an option.',
    ],
    [{...tone, require: {oneOf: []}}, '`require.oneOf` must list at least one option.'],
    [
      choice({
        instructions: 'Which?',
        criteria: Object.fromEntries(Array.from({length: 256}, (_, i) => [`o${i}`, `${i}`])),
      }),
      'A choice signal allows at most 255 options.',
    ],
  ])('explains a rule or limit that cannot work: %#', (signal, problem) => {
    const kind = kindOf(signal)
    expect(kind.problem).toBe(problem)
    expect(kind.question).toBeUndefined()
  })
})
