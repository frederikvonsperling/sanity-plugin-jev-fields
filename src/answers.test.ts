import {defineArrayMember, defineField, defineType} from 'sanity'
import {describe, expect, it} from 'vitest'

import {withJevAnswers} from './answers'
import {noul, score} from './signals'

const readable = noul({instructions: 'Easy?', true: 'Yes', false: 'No'})
const evidence = score({instructions: 'Sourced?', criteria: ['none', 'some']})

const names = (fields: {name: string; type: string}[] = []) =>
  fields.map((field) => `${field.name}:${field.type}`)

describe('withJevAnswers', () => {
  it('adds an answer field right after each field with signals', () => {
    const [article] = withJevAnswers([
      defineType({
        name: 'article',
        type: 'document',
        fields: [
          defineField({name: 'title', type: 'string'}),
          defineField({
            name: 'body',
            type: 'array',
            of: [defineArrayMember({type: 'block'})],
            group: 'content',
            options: {jev: {readable, evidence}},
          }),
          defineField({name: 'slug', type: 'slug'}),
        ],
      }),
    ])
    expect(names(article.fields)).toEqual([
      'title:string',
      'body:array',
      'readable:jev.noul',
      'evidence:jev.score',
      'slug:slug',
    ])
    // Same group as the attached field, so it is mounted whenever that field is.
    expect((article.fields as {name: string; group?: string}[])[2].group).toBe('content')
  })

  it('handles fields inside nested objects', () => {
    const [page] = withJevAnswers([
      defineType({
        name: 'page',
        type: 'document',
        fields: [
          defineField({
            name: 'seo',
            type: 'object',
            fields: [defineField({name: 'description', type: 'text', options: {jev: {readable}}})],
          }),
        ],
      }),
    ])
    const [seo] = page.fields as {name: string; fields: {name: string; type: string}[]}[]
    expect(names(seo.fields)).toEqual(['description:text', 'readable:jev.noul'])
  })

  it('is safe to run twice, and keeps an answer field declared by hand', () => {
    const type = defineType({
      name: 'article',
      type: 'document',
      fields: [
        defineField({name: 'body', type: 'text', options: {jev: {readable}}}),
        defineField({name: 'readable', type: 'jev.noul'}),
      ],
    })
    expect(names(withJevAnswers(withJevAnswers([type]))[0].fields)).toEqual([
      'body:text',
      'readable:jev.noul',
    ])
  })

  it('explains a signal whose name is taken by another field', () => {
    const type = defineType({
      name: 'article',
      type: 'document',
      fields: [
        defineField({name: 'body', type: 'text', options: {jev: {readable}}}),
        defineField({name: 'readable', type: 'boolean'}),
      ],
    })
    expect(() => withJevAnswers([type])).toThrow(/"readable" .* already taken/)
  })

  it('leaves types without signals unchanged', () => {
    const type = defineType({
      name: 'plain',
      type: 'object',
      fields: [defineField({name: 'a', type: 'string'})],
    })
    expect(withJevAnswers([type])[0]).toEqual(type)
  })
})
