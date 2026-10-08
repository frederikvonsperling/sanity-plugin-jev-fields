# sanity-plugin-jev-fields

## 0.2.0

### Minor Changes

- ba077fb: What was called a "signal" is now a "question", in the docs, the Studio and the types. `options.jev`, `noul()`, `score()`, `choice()` and stored answers are unchanged. If you import types, rename them:

  - `JevSignal` → `JevQuestion`, `JevSignals` → `JevQuestions`
  - `NoulSignal` → `NoulQuestion`, `ScoreSignal` → `ScoreQuestion`, `ChoiceSignal` → `ChoiceQuestion`
  - The Gateway's request and response shapes, used with `transport`: `JevQuestion` → `GatewayQuestion`, `JevAnswer` → `GatewayAnswer`

## 0.1.1

### Patch Changes

- c505a68: The README now documents every plugin and signal option, the full shape of stored answers, and a proxy `transport` example that sends `Content-Type: application/json`.

## 0.1.0

### Minor Changes

- b19a4cc: First release. Attach yes/no (`noul`), `score` and `choice` signals to any field with `options.jev`, answered by TypeSafe's Jev model through Vercel AI Gateway:

  - A strip of signal chips under the field, with details per signal, re-evaluated shortly after the field is edited. Opening a document never writes to it.
  - Answers stored next to the field as `jev.noul`, `jev.score` and `jev.choice` values, added by `withJevAnswers(schemaTypes)`.
  - `warn` and `require` rules on a signal become validation on its field.
  - The AI Gateway key is stored in the dataset and managed in the Studio's Jev tool, or sent through your own server with `transport`.
  - Everything editors see can be translated through the `jev` namespace.
