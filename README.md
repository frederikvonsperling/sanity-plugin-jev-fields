# sanity-plugin-jev-fields

> Work in progress: not yet published to npm. Expect `0.x` releases to change until the stored
> value shapes are frozen at `1.0.0`.

Jev signals for Sanity Studio: questions about a field's content, answered by
[TypeSafe's Jev](https://typesafe.ai) decision model through
[Vercel AI Gateway](https://vercel.com/ai-gateway) as editors write. Each signal is a chip under
the field it judges; click it for the details.

- `noul`: a yes/no question, answered with the probability that the answer is yes
- `score`: a position on an ordered scale you define
- `choice`: one option from a named set, with a probability for each option

Signals re-evaluate shortly after the field is edited. Opening a document never writes to it.

## Install

```sh
pnpm add sanity-plugin-jev-fields
```

Requires Sanity Studio 6.

## Usage

Add the plugin, and wrap your schema types with `withJevAnswers` so every signal gets a field to
store its answer in:

```ts
// sanity.config.ts
import {defineConfig} from 'sanity'
import {jev, withJevAnswers} from 'sanity-plugin-jev-fields'

export default defineConfig({
  // ...
  plugins: [jev()],
  schema: {types: withJevAnswers(schemaTypes)},
})
```

Then attach signals to any field with `options.jev`:

```ts
import {defineArrayMember, defineField} from 'sanity'
import {choice, noul, score} from 'sanity-plugin-jev-fields'

defineField({
  name: 'body',
  type: 'array',
  of: [defineArrayMember({type: 'block'})],
  options: {
    jev: {
      readable: noul({
        instructions: 'Is this article easy to read for a general audience?',
        true: 'Short sentences, plain words, clear structure',
        false: 'Dense, jargon-heavy or hard to follow',
        label: 'likely to read easily',
      }),
      evidence: score({
        instructions: 'How well does this article support its claims?',
        // Lowest first. Text before a colon is the label.
        criteria: [
          'none: no backing for its claims',
          'anecdotal: personal experience only',
          'data: add a source or figure',
          'cited: key claims cite their sources',
        ],
      }),
      tone: choice({
        instructions: 'What is the tone of this article?',
        criteria: {formal: 'Professional and reserved', casual: 'Conversational and relaxed'},
      }),
    },
  },
})
```

A signal reads only the field it is attached to. Portable Text, slugs and nested objects are
flattened to plain text. Each key (`readable`, `evidence`, `tone`) becomes the name of a field
next to it that stores the answer; `withJevAnswers` adds those fields and stops with an error if a
name is already taken.

## API key

Open the **Jev** tool in the Studio, click **Set key** and paste an AI Gateway API key. The tool
shows whether a key is set, when it last changed, and can test the connection.

The key is stored in the document `secrets.jev` in your dataset. It is not public, but every
Studio user who can read the dataset can see it, and it is included in dataset exports. Use a
dedicated key with a spend limit.

If editors must never see the key, send requests through your own server instead:

```ts
jev({
  transport: (request, {signal}) =>
    fetch('/api/jev', {method: 'POST', body: JSON.stringify(request), signal}),
})
```

Your endpoint forwards the body unchanged to `https://ai-gateway.vercel.sh/v1/evaluate` with an
`Authorization: Bearer <key>` header, and returns the Gateway's response.

## Stored values

```groq
*[_type == "article"]{
  title,
  "readable": readable.probability,        // 0–1
  "evidence": evidence{score, max, label},  // score runs from 0 to max
  "tone": tone.choice
}
```

Every value also stores `evaluatedAt`, `model` (e.g. `typesafe-ai/jev`) and a `sourceHash` the
Studio uses to show when a value is out of date.

## Development

```sh
pnpm install
pnpm test
pnpm build
```

`pnpm record-fixtures` re-records the real Gateway responses in `src/__fixtures__` (needs
`AI_GATEWAY_API_KEY` in `.env`). [CONTEXT.md](./CONTEXT.md) defines the vocabulary and
[docs/adr](./docs/adr) records the main decisions.

## License

MIT
