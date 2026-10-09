/// <reference types="node" />

import {existsSync, mkdirSync, writeFileSync} from 'node:fs'

const rootEnv = new URL('../.env', import.meta.url)

const outDir = new URL('../src/__fixtures__/gateway/', import.meta.url)

const ENDPOINT = 'https://ai-gateway.vercel.sh/v1/evaluate'

const MODEL = process.env.JEV_MODEL ?? 'typesafe-ai/jev'

if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv)
}

const apiKey = process.env.AI_GATEWAY_API_KEY

if (!apiKey) {
  throw new Error('Set AI_GATEWAY_API_KEY in .env first')
}

mkdirSync(outDir, {recursive: true})

const state =
  'Last year we rewrote our help centre. Support tickets dropped by a third, according to our own dashboard. You can do the same: start with the ten most-read pages.'

const cases: Record<string, {key?: string; body: Record<string, unknown>}> = {
  'noul': {
    body: {
      model: MODEL,
      state,
      questions: {
        q: {
          type: 'boolean',
          instructions: 'Is this text easy to read for a general audience?',
          criteria: {
            true: 'Short sentences, plain words',
            false: 'Dense or jargon-heavy',
          },
        },
      },
    },
  },
  'score': {
    body: {
      model: MODEL,
      state,
      questions: {
        q: {
          type: 'score',
          instructions: 'How well does this text support its claims?',
          criteria: ['unsupported', 'anecdotal', 'some sources', 'well sourced'],
        },
      },
    },
  },
  'choice': {
    body: {
      model: MODEL,
      state,
      questions: {
        q: {
          type: 'choice',
          instructions: 'What is the tone of this text?',
          criteria: {
            formal: 'Professional',
            casual: 'Conversational',
            playful: 'Humorous',
          },
        },
      },
    },
  },
  'error-invalid-question': {
    body: {
      model: MODEL,
      state,
      questions: {
        q: {
          type: 'score',
          instructions: 'Rate it',
          criteria: ['only one criterion'],
        },
      },
    },
  },
  'error-invalid-key': {
    key: 'invalid-key-for-fixture',
    body: {
      model: MODEL,
      state,
      questions: {
        q: {
          type: 'score',
          instructions: 'Rate it',
          criteria: ['low', 'high'],
        },
      },
    },
  },
}

const only = process.argv.slice(2)

async function record(name: string, {key, body}: (typeof cases)[string]) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {'Authorization': `Bearer ${key ?? apiKey}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      ...body,
      providerOptions: {
        gateway: {
          tags: ['feature:jev-fixtures'],
        },
      },
    }),
  })

  const text = await response.text()
  let parsed: unknown = text

  try {
    parsed = JSON.parse(text)
  } catch {}

  const fixture = {
    request: body,
    status: response.status,
    response: parsed,
  }

  writeFileSync(new URL(`${name}.json`, outDir), JSON.stringify(fixture, null, 2) + '\n')

  return `${name}: ${response.status}`
}

const selected = Object.entries(cases).filter(([name]) => only.length === 0 || only.includes(name))

const results = await Promise.all(selected.map(([name, testCase]) => record(name, testCase)))

process.stdout.write(`${results.join('\n')}\n`)
