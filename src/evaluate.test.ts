import {afterEach, describe, expect, it, vi} from 'vitest'

import choice from './__fixtures__/gateway/choice.json'
import invalidKey from './__fixtures__/gateway/error-invalid-key.json'
import invalidQuestion from './__fixtures__/gateway/error-invalid-question.json'
import noul from './__fixtures__/gateway/noul.json'
import score from './__fixtures__/gateway/score.json'
import {
  evaluateQuestion,
  createGatewayTransport,
  JevError,
  type GatewayQuestion,
  type JevRequest,
  type JevTransport,
} from './evaluate'

interface Fixture {
  request: {state: string | Record<string, string>; questions: {q: unknown}}
  status: number
  response: unknown
}

const respond = (status: number, body: unknown, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), {status, headers})

/** A transport that replays the given responses in order and records each request. */
function replay(...responses: Response[]) {
  const requests: JevRequest[] = []

  const transport = vi.fn<JevTransport>(async (request) => {
    requests.push(request)
    const next = responses.shift()

    if (!next) throw new Error('No more responses')

    return next
  })

  return {transport, requests}
}

function ask(fixture: Fixture, transport: JevTransport, overrides = {}) {
  return evaluateQuestion({
    transport,
    model: 'typesafe-ai/jev',
    state: fixture.request.state,
    // The fixtures were recorded from these exact questions; JSON imports lose the literal types.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    question: fixture.request.questions.q as GatewayQuestion,
    tags: ['feature:jev-fields'],
    retryDelays: [0, 0, 0],
    ...overrides,
  })
}

describe('evaluateQuestion against recorded Gateway responses', () => {
  // Compared with each fixture's own answer, so re-recording the fixtures keeps these passing.
  it.each([
    ['noul', noul, 'boolean'],
    ['score', score, 'score'],
    ['choice', choice, 'choice'],
  ])('returns the recorded %s answer and the answering model', async (_name, fixture, type) => {
    const {transport} = replay(respond(fixture.status, fixture.response))
    const result = await ask(fixture, transport)
    expect(result.answer.type).toBe(type)
    expect(result.answer).toEqual(fixture.response.answers.q)
    expect(result.model).toBe(fixture.response.model)
  })

  it('reports a rejected key as an auth error without retrying', async () => {
    const {transport} = replay(respond(invalidKey.status, invalidKey.response))
    const error = await ask(noul, transport).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(JevError)
    expect(error).toMatchObject({kind: 'auth', status: 401})
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it("shows the Gateway's validation message for an invalid question", async () => {
    const {transport} = replay(respond(invalidQuestion.status, invalidQuestion.response))
    await expect(ask(invalidQuestion, transport)).rejects.toMatchObject({
      kind: 'invalid',
      message: expect.stringContaining('expected array to have >=2 items'),
    })
  })
})

describe('evaluateQuestion request', () => {
  it('sends the question, state and normalized tags as one request', async () => {
    const {transport, requests} = replay(respond(200, noul.response))
    const tooLong = 'x'.repeat(80)
    await ask(noul, transport, {tags: [' a ', 'a', '', tooLong, ...'bcdefghijkl'.split('')]})

    const [request] = requests
    expect(request.model).toBe('typesafe-ai/jev')
    expect(request.state).toEqual(noul.request.state)
    expect(request.questions.q).toEqual(noul.request.questions.q)
    expect(request.providerOptions.gateway.tags).toEqual([
      'a',
      'x'.repeat(64),
      ...'bcdefghi'.split(''),
    ])
  })

  it('falls back to the requested model when the response names none', async () => {
    const {transport} = replay(respond(200, {answers: noul.response.answers}))
    const result = await ask(noul, transport, {model: 'typesafe-ai/jev-test'})
    expect(result.model).toBe('typesafe-ai/jev-test')
  })

  it('rejects an answer of the wrong type', async () => {
    const {transport} = replay(respond(200, score.response))
    await expect(ask(noul, transport)).rejects.toMatchObject({kind: 'unexpected'})
  })
})

describe('evaluateQuestion retries', () => {
  const busy = () => respond(429, {error: {message: 'Rate limited'}})

  it('retries a rate-limited request and then succeeds', async () => {
    const {transport} = replay(busy(), respond(529, {}), respond(200, noul.response))
    const result = await ask(noul, transport)
    expect(result.answer).toMatchObject({type: 'boolean'})
    expect(transport).toHaveBeenCalledTimes(3)
  })

  it('gives up after three retries', async () => {
    const {transport} = replay(busy(), busy(), busy(), busy())
    await expect(ask(noul, transport)).rejects.toMatchObject({kind: 'busy', status: 429})
    expect(transport).toHaveBeenCalledTimes(4)
  })

  it('does not retry other failures', async () => {
    const {transport} = replay(respond(500, {error: 'Boom'}))
    await expect(ask(noul, transport)).rejects.toMatchObject({
      kind: 'failed',
      message: 'AI Gateway responded with 500: Boom',
    })
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it('stops waiting to retry when aborted', async () => {
    const controller = new AbortController()
    const {transport} = replay(busy(), respond(200, noul.response))
    const pending = ask(noul, transport, {signal: controller.signal, retryDelays: [60_000]})
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1))
    controller.abort()
    await expect(pending).rejects.toMatchObject({name: 'AbortError'})
    expect(transport).toHaveBeenCalledTimes(1)
  })
})

describe('createGatewayTransport', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('posts the request to the Gateway with the API key', async () => {
    const fetch = vi.fn(async () => respond(200, {}))
    vi.stubGlobal('fetch', fetch)

    const request: JevRequest = {
      model: 'typesafe-ai/jev',
      state: 'Some text',
      questions: {
        q: {type: 'boolean', instructions: 'Is it?', criteria: {true: 'Yes', false: 'No'}},
      },
      providerOptions: {gateway: {tags: []}},
    }

    await createGatewayTransport('secret-key')(request, {})

    expect(fetch).toHaveBeenCalledWith('https://ai-gateway.vercel.sh/v1/evaluate', {
      method: 'POST',
      signal: undefined,
      headers: {'Authorization': 'Bearer secret-key', 'Content-Type': 'application/json'},
      body: JSON.stringify(request),
    })
  })
})
