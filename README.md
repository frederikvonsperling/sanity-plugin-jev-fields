# sanity-plugin-jev-fields

> Beta: expect `0.x` releases to change until the stored value shapes are frozen at `1.0.0`.

This plugin allow you to enrich fields in Sanity with feedback from the Jev model from [Typesafe](https://typesafe.ai). Show a realtime scoring to the editors on things like readability, tone, trustworthiness, credibility or anything else you can think of.

<img src="https://raw.githubusercontent.com/frederikvonsperling/sanity-plugin-jev-fields/main/docs/images/readable.png" width="612" alt="A Body field in Sanity Studio with three question chips under it: Readable 90%, Evidence 1.5/3 and Tone Casual. The Readable details are open: a High badge, 90% likely to read easily, a nearly full green bar, and the hint &quot;Short sentences, plain words, clear structure&quot;.">

Jev model is utilized through Vercel AI Gateway, as Sanity studio runs in the browser and Typesafe's own SDK do not support client site request at the moment.

You can also use the plugin for editorial check, by either blocking or warning the editor if a specfic score is below a defined threshold. The score is also save to the dataset, allowing you to use the data for your frontend.

The plugin allows the use of all three primitives from Jev, which is:

- `noul`: a yes/no question, answered with the probability that the answer is yes
- `score`: a position on an ordered scale you define
- `choice`: one option from a named set, with a probability for each option

## Install (Requires Sanity v6)

```sh
npm install sanity-plugin-jev-fields
```

```sh
pnpm add sanity-plugin-jev-fields
```

```sh
yarn add sanity-plugin-jev-fields
```

## Usage

Add the plugin, and wrap your schema types with `withJevAnswers` so every question gets a field to
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

Then attach questions to any field with `options.jev`:

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
        criteria: {
          formal: 'Professional and reserved',
          casual: 'Conversational and relaxed',
          playful: 'Light-hearted and witty',
        },
      }),
    },
  },
})
```

A question only reads the field it is attached to. Portable Text, slugs and nested objects are
flattened to plain text. Each key (`readable`, `evidence`, `tone`) becomes the name of a field
next to it that stores the answer; `withJevAnswers` adds those fields and stops with an error if a
name is already taken. A `score` takes 2 to 10 criteria and a `choice` 2 to 255 options; see
[Question options](#question-options) for the rest.

<img src="https://raw.githubusercontent.com/frederikvonsperling/sanity-plugin-jev-fields/main/docs/images/tone.png" width="612" alt="A Title field with a Tone Casual chip under it. The Tone details are open: bars for Formal 3%, Casual 97% and Playful 0%, the meaning &quot;Conversational and relaxed&quot;, and the note &quot;Out of date: the field changed since this was evaluated.&quot;">

When a field changes, its answers are marked out of date until they are evaluated again.

## Rules

Give a question a `warn` or `require` rule to act on its answer: `warn` shows a warning on the
attached field, `require` an error that blocks publishing.

```ts
options: {
  jev: {
    readable: noul({...question, warn: {atLeast: 0.6}}), // probability, 0–1
    evidence: score({...question, require: {atLeast: 2}}), // position on the scale
    risk: score({...question, colors: 'reverse', warn: {atMost: 1}}), // lower is better
    tone: choice({...question, warn: {oneOf: ['formal', 'casual']}}),
  },
}
```

`noul` and `score` rules take `atLeast`, `atMost` or both. `choice` rules take `oneOf`, the options
the answer must be one of.

Rules judge the stored answer, so they say nothing until a question has been evaluated, and an
answer that is out of date is still judged as it is.

## What Jev is good at

Jev judges meaning in text: tone, clarity, whether claims are backed up. It reads only text, so
images and other media in a field are ignored. It is not built for counting or arithmetic: ask
"Is this under 150 words?" in a validation rule instead. Test questions on content in your own
languages before relying on them. A field's text may be up to about 32k tokens; the Studio warns
when a field gets close.

## API key

Open the **Jev** tool in the Studio, click **Set key** and paste an AI Gateway API key. The tool
shows whether a key is set, when it last changed, and can test the connection.

> **Anyone who can read the dataset can read the key.** It is stored in the document
> `secrets.jev`. Unauthenticated queries can't read it, but every Studio user can, and so can
> every API token with read access, such as a frontend's read or preview token. It is also
> included in dataset exports and backups. Use a dedicated key with a spend limit.

You can also pass the key as the plugin's `apiKey` option, but then it is bundled into the
Studio's JavaScript, where anyone who can load the Studio can read it.

If editors and tokens must never see the key, send requests through your own server instead:

```ts
jev({
  transport: (request, {signal}) =>
    fetch('/api/jev', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(request),
      signal,
    }),
})
```

Your endpoint forwards the body unchanged to `https://ai-gateway.vercel.sh/v1/evaluate` with an
`Authorization: Bearer <key>` header and a `Content-Type: application/json` header, and returns
the Gateway's response with its status.

When more than one is set, `transport` wins over `apiKey`, and `apiKey` over the stored key.

## Stored values

```groq
*[_type == "article"]{
  title,
  // noul: probability that the answer is yes, 0–1
  "readable": readable.probability,
  // score: score runs from 0 to max; label is the nearest criterion; confidence is 0–1
  "evidence": evidence{score, max, label, confidence},
  // choice: the chosen option, confidence 0–1, and a probability for every option
  "tone": tone{choice, confidence, probabilities[]{option, probability}}
}
```

Every value also stores `evaluatedAt`, `model` (e.g. `typesafe-ai/jev`) and a `sourceHash` the
Studio uses to show when a value is out of date. The types `NoulValue`, `ScoreValue` and
`ChoiceValue` describe the full shapes.

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

## Options reference

### Plugin options

Passed to `jev({...})`. All are optional.

| Option       | Default                                    | Description                                                                                                                       |
| ------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `transport`  |                                            | `(request, {signal}) => Promise<Response>`. Sends requests yourself, e.g. through your own server. See [API key](#api-key).       |
| `apiKey`     |                                            | AI Gateway key. Bundled into the Studio's JavaScript; prefer the Jev tool or `transport`.                                         |
| `endpoint`   | `https://ai-gateway.vercel.sh/v1/evaluate` | Where requests go. Ignored when `transport` is set.                                                                               |
| `model`      | `typesafe-ai/jev`                          | Decision model to call.                                                                                                           |
| `debounceMs` | `500`                                      | Delay after the last edit before re-evaluating, in milliseconds.                                                                  |
| `tool`       | `true`                                     | Adds the Jev tool for setting, testing and removing the stored key.                                                               |
| `tags`       | `['feature:jev-fields']`                   | AI Gateway reporting tags, for cost attribution. Each request also gets a tag for its question, e.g. `jev.noul:article.readable`. |

### Question options

Every question takes:

| Option         | Description                                                                         |
| -------------- | ----------------------------------------------------------------------------------- |
| `instructions` | Required. The question Jev answers about the attached field.                        |
| `title`        | Chip and detail heading. Defaults to the question's key: `readable` → "Readable".   |
| `warn`         | Shows a warning on the field when the answer breaks this rule. See [Rules](#rules). |
| `require`      | Blocks publishing when the answer breaks this rule.                                 |

And, per kind:

| Kind     | Option     | Description                                                                                                                                                         |
| -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `noul`   | `true`     | Required. What a yes means. Shown when the probability is 50% or higher.                                                                                            |
| `noul`   | `false`    | Required. What a no means. Shown when the probability is below 50%.                                                                                                 |
| `noul`   | `label`    | Short phrase after the percentage, e.g. "likely to read easily".                                                                                                    |
| `score`  | `criteria` | Required. 2 to 10 criteria, lowest first. Text before a colon is the short label.                                                                                   |
| `score`  | `colors`   | `'traffic'` (default): red at the bottom, green at the top. `'reverse'`: green at the bottom, for scales where lower is better. `'neutral'`: one colour throughout. |
| `choice` | `criteria` | Required. 2 to 255 options, as option name → what it means.                                                                                                         |

Rules on a `noul` take probabilities (0–1), rules on a `score` take positions on the scale (0 to
the number of criteria minus one), and rules on a `choice` take option names.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT
