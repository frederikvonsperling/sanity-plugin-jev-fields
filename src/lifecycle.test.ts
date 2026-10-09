import {describe, expect, it, vi} from 'vitest'

import invalidKey from './__fixtures__/gateway/error-invalid-key.json'
import noulFixture from './__fixtures__/gateway/noul.json'
import type {DocumentObject, DocumentValue} from './content'
import type {JevRequest, JevTransport} from './evaluate'
import type {StoredValue} from './kinds'
import {createLifecycle, type Clock, type LifecycleInputs} from './lifecycle'
import {noul, type JevQuestions} from './questions'

const readable = noul({
  instructions: 'Is this text easy to read for a general audience?',
  true: 'Short sentences, plain words',
  false: 'Dense or jargon-heavy',
})

const respond = (fixture: {status: number; response: DocumentValue}) =>
  new Response(JSON.stringify(fixture.response), {status: fixture.status})

/** A clock whose time only moves when a test says so. */
function fakeClock() {
  let time = Date.parse('2026-10-08T10:00:00.000Z')
  let timers: {at: number; callback: () => void}[] = []

  const clock: Clock & {tick: (ms: number) => void} = {
    now: () => new Date(time),
    after(ms, callback) {
      const timer = {at: time + ms, callback}
      timers.push(timer)

      return () => {
        timers = timers.filter((other) => other !== timer)
      }
    },
    tick(ms) {
      time += ms
      const due = timers.filter((timer) => timer.at <= time)
      timers = timers.filter((timer) => timer.at > time)

      for (const timer of due) timer.callback()
    },
  }

  return clock
}

/** A transport whose requests stay out until a test answers them. */
function heldTransport() {
  const calls: {request: JevRequest; signal?: AbortSignal; answer: (r: Response) => void}[] = []

  const transport: JevTransport = (request, {signal}) =>
    new Promise((resolve) => calls.push({request, signal, answer: resolve}))

  return {transport, calls}
}

/** One attached field, with its answer fields kept in memory like the Studio's form. */
function field(questions: JevQuestions = {readable}, overrides: Partial<LifecycleInputs> = {}) {
  const clock = fakeClock()
  const {transport, calls} = heldTransport()
  const answers: DocumentObject = {}
  const stores: string[] = []
  const lifecycle = createLifecycle(clock)

  let inputs: LifecycleInputs = {
    questions,
    state: '',
    answers: {},
    transport,
    store: (key: string, value: StoredValue) => {
      stores.push(key)
      answers[key] = value
      push({})
    },
    model: 'typesafe-ai/jev',
    tags: ['feature:jev-fields'],
    tagPath: ['article'],
    readOnly: false,
    debounceMs: 500,
    ...overrides,
  }

  function push(changes: Partial<LifecycleInputs>) {
    inputs = {...inputs, ...changes, answers: {...answers}}
    lifecycle.update(inputs)
  }

  push({})

  return {
    lifecycle,
    clock,
    calls,
    answers,
    stores,
    push,
    /** The document is opened, or someone else's edit arrives. */
    remote: (state: string) => push({state}),
    /** The editor types here. */
    type: (state: string) => {
      lifecycle.localEdit()
      push({state})
    },
    view: (key = 'readable') => lifecycle.getSnapshot().questions.find((s) => s.key === key)!,
  }
}

describe('evaluation lifecycle', () => {
  it('never evaluates a document that was only opened', () => {
    const f = field()
    f.remote('Some text')
    f.clock.tick(1000)
    expect(f.calls).toHaveLength(0)
    expect(f.view()).toMatchObject({reading: undefined, stale: false, loading: false})
  })

  it('evaluates shortly after a local edit and stores the answer with its bookkeeping', async () => {
    const f = field()
    f.type('Hello')
    // The spinner shows from the first keystroke, while the debounce runs.
    expect(f.view().loading).toBe(true)
    f.clock.tick(499)
    expect(f.calls).toHaveLength(0)
    f.clock.tick(1)
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0].request).toMatchObject({
      model: 'typesafe-ai/jev',
      state: 'Hello',
      questions: {q: {type: 'boolean'}},
      providerOptions: {gateway: {tags: ['feature:jev-fields', 'jev.noul:article.readable']}},
    })

    f.calls[0].answer(respond(noulFixture))
    await vi.waitFor(() => expect(f.answers.readable).toBeDefined())
    expect(f.answers.readable).toEqual({
      _type: 'jev.noul',
      probability: expect.any(Number),
      evaluatedAt: '2026-10-08T10:00:00.500Z',
      model: noulFixture.response.model,
      sourceHash: expect.any(String),
    })
    expect(f.view()).toMatchObject({stale: false, loading: false, error: null})
    expect(f.view().reading?.value).toEqual(f.answers.readable)
  })

  it('sends one request for a burst of edits', () => {
    const f = field()
    f.type('H')
    f.clock.tick(300)
    f.type('He')
    f.clock.tick(300)
    expect(f.calls).toHaveLength(0)
    f.clock.tick(200)
    expect(f.calls.map((call) => call.request.state)).toEqual(['He'])
  })

  it("flags an answer as stale after someone else's edit, and leaves it to them", async () => {
    const f = field()
    f.type('A')
    f.clock.tick(500)
    f.calls[0].answer(respond(noulFixture))
    await vi.waitFor(() => expect(f.answers.readable).toBeDefined())

    f.remote('B')
    expect(f.view()).toMatchObject({stale: true, loading: false})
    expect(f.view().reading).toBeDefined()
    f.clock.tick(1000)
    expect(f.calls).toHaveLength(1)

    // Editing again makes the content this Studio's again.
    f.type('BC')
    f.clock.tick(500)
    expect(f.calls.map((call) => call.request.state)).toEqual(['A', 'BC'])
  })

  it("cancels a pending evaluation when someone else's edit arrives", () => {
    const f = field()
    f.type('A')
    f.clock.tick(300)
    f.remote('B')
    expect(f.view().loading).toBe(false)
    f.clock.tick(1000)
    expect(f.calls).toHaveLength(0)
  })

  it('drops an answer for content that changed while the request was out', async () => {
    const f = field()
    f.type('A')
    f.clock.tick(500)
    f.type('AB')
    expect(f.calls[0].signal?.aborted).toBe(true)
    f.calls[0].answer(respond(noulFixture))
    f.clock.tick(500)
    f.calls[1].answer(respond(noulFixture))
    await vi.waitFor(() => expect(f.answers.readable).toBeDefined())
    expect(f.stores).toEqual(['readable'])
    expect(f.view().stale).toBe(false)
  })

  it('evaluates on demand straight away, also after a remote edit', () => {
    const f = field()
    f.remote('A')
    f.lifecycle.run()
    expect(f.calls).toHaveLength(1)
    expect(f.view().loading).toBe(true)
  })

  it('treats a stored answer of another kind as unanswered', () => {
    const f = field()
    f.answers.readable = {_type: 'jev.score', score: 1, max: 2, sourceHash: 'x'}
    f.remote('A')
    expect(f.view()).toMatchObject({reading: undefined, stale: false})
    f.type('AB')
    f.clock.tick(500)
    expect(f.calls).toHaveLength(1)
  })

  it('shows an error, flags a rejected key, and clears both on the next edit', async () => {
    const f = field()
    f.type('A')
    f.clock.tick(500)
    f.calls[0].answer(respond(invalidKey))
    await vi.waitFor(() => expect(f.view().error?.message).toMatch(/rejected the API key/))
    expect(f.view()).toMatchObject({keyRejected: true, loading: false})

    f.type('AB')
    expect(f.view()).toMatchObject({error: null, keyRejected: false})
  })

  it('explains an answer field that is missing', async () => {
    const f = field(
      {readable},
      {
        store: () => {
          throw new Error('There is no "readable" field to store this answer in.')
        },
      },
    )

    f.type('A')
    f.clock.tick(500)
    f.calls[0].answer(respond(noulFixture))
    await vi.waitFor(() => expect(f.view().error?.message).toMatch(/no "readable" field/))
  })

  it.each([
    ['without a transport', {transport: undefined}],
    ['while read-only', {readOnly: true}],
  ])('does not evaluate %s', (_name, overrides) => {
    const f = field({readable}, overrides)
    f.type('A')
    f.lifecycle.run()
    f.clock.tick(1000)
    expect(f.calls).toHaveLength(0)
    expect(f.lifecycle.getSnapshot().canRun).toBe(false)
    expect(f.view().loading).toBe(false)
  })

  it('does not evaluate an empty field', () => {
    const f = field()
    f.type('  ')
    f.clock.tick(1000)
    expect(f.calls).toHaveLength(0)
    expect(f.lifecycle.getSnapshot()).toMatchObject({empty: true, canRun: false})
  })

  it("reports a question's config problem instead of asking it", () => {
    const f = field({broken: noul({instructions: '', true: 'y', false: 'n'})})
    f.type('A')
    f.clock.tick(1000)
    expect(f.calls).toHaveLength(0)
    expect(f.view('broken').configError).toMatch(/instructions/)
  })

  it('keeps its snapshot, and stays quiet, when nothing changed', () => {
    const f = field()
    f.remote('A')
    const snapshot = f.lifecycle.getSnapshot()
    const listener = vi.fn()
    f.lifecycle.subscribe(listener)
    f.push({})
    expect(f.lifecycle.getSnapshot()).toBe(snapshot)
    expect(listener).not.toHaveBeenCalled()
  })

  it('stops on dispose and picks up again on the next update', () => {
    const f = field()
    f.type('A')
    f.clock.tick(500)
    f.lifecycle.dispose()
    expect(f.calls[0].signal?.aborted).toBe(true)

    // React's strict mode disposes and re-mounts with the same inputs.
    f.type('AB')
    f.lifecycle.dispose()
    f.push({})
    f.clock.tick(500)
    expect(f.calls.map((call) => call.request.state)).toEqual(['A', 'AB'])
  })
})
