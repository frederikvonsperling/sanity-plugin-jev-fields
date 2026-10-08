# sanity-plugin-jev-fields

> Beta: expect `0.x` releases to change until the stored value shapes are frozen at `1.0.0`.

Jev signals for Sanity Studio: questions about a field's content, answered by
[TypeSafe's Jev](https://typesafe.ai) decision model through
[Vercel AI Gateway](https://vercel.com/ai-gateway) as editors write. Each signal is a chip under
the field it judges; click it for the details.

- `noul`: a yes/no question, answered with the probability that the answer is yes
- `score`: a position on an ordered scale you define
- `choice`: one option from a named set, with a probability for each option

Signals re-evaluate shortly after the field is edited. Opening a document never writes to it.

![A Body field in Sanity Studio with three signal chips under it: Readable 90%, Evidence 1.5 of 3 and Tone Casual. The Evidence details are open: a four-step bar from None to Cited, filled to Anecdotal, and the hint "To move up: add a source or figure."](https://raw.githubusercontent.com/frederikvonsperling/sanity-plugin-jev-fields/main/docs/images/signals.png)

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

## Rules

Give a signal a `warn` or `require` rule to act on its answer: `warn` shows a warning on the
attached field, `require` an error that blocks publishing.

```ts
options: {
  jev: {
    readable: noul({...signal, warn: {atLeast: 0.6}}), // probability, 0–1
    evidence: score({...signal, require: {atLeast: 2}}), // position on the scale
    tone: choice({...signal, warn: {oneOf: ['formal', 'casual']}}),
  },
}
```

Rules judge the stored answer, so they say nothing until a signal has been evaluated, and an
answer that is out of date is still judged as it is.

## What Jev is good at

Jev judges meaning in text: tone, clarity, whether claims are backed up. It reads only text, so
images and other media in a field are ignored. It is not built for counting or arithmetic: ask
"Is this under 150 words?" in a validation rule instead. Test signals on content in your own
languages before relying on them. A field's text may be up to about 32k tokens; the Studio warns
when a field gets close.

## API key

Open the **Jev** tool in the Studio, click **Set key** and paste an AI Gateway API key. The tool
shows whether a key is set, when it last changed, and can test the connection.

The key is stored in the document `secrets.jev` in your dataset. Unauthenticated queries can't
read it, but anyone who can read the dataset can: every Studio user, and every API token with read
access, such as a frontend's read or preview token. It is also included in dataset exports and
backups. Use a dedicated key with a spend limit.

If editors and tokens must never see the key, send requests through your own server instead:

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

## Translations

Everything editors see is in the `jev` namespace of the Studio's translations, in US English.
Add another language with a locale bundle that uses the same keys (see `JevTranslationKey`):

```ts
import {defineLocaleResourceBundle} from 'sanity'
import {JEV_NAMESPACE} from 'sanity-plugin-jev-fields'

export const jevNorwegian = defineLocaleResourceBundle({
  locale: 'nb-NO',
  namespace: JEV_NAMESPACE,
  resources: {'strip.set-up': 'Sett opp Jev' /* … */},
})
```

Rule messages and config problems stay in English: Sanity's validation has no translation hook,
and config problems are meant for schema authors.

## Development

```sh
pnpm install
pnpm test
pnpm build
```

`pnpm record-fixtures` re-records the real Gateway responses in `src/__fixtures__` (needs
`AI_GATEWAY_API_KEY` in `.env`). [CONTEXT.md](./CONTEXT.md) defines the vocabulary and
[docs/adr](./docs/adr) records the main decisions.

To release a change, add a changeset to its PR with `pnpm changeset`. The release workflow keeps a
"Version packages" PR up to date; merging it stages the new version on npm (trusted publishing,
no token) and creates the GitHub release. A maintainer then approves the staged version on
npmjs.com, with 2FA, to publish it.

## License

MIT
