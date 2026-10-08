---
'sanity-plugin-jev-fields': minor
---

What was called a "signal" is now a "question", in the docs, the Studio and the types. `options.jev`, `noul()`, `score()`, `choice()` and stored answers are unchanged. If you import types, rename them:

- `JevSignal` → `JevQuestion`, `JevSignals` → `JevQuestions`
- `NoulSignal` → `NoulQuestion`, `ScoreSignal` → `ScoreQuestion`, `ChoiceSignal` → `ChoiceQuestion`
- The Gateway's request and response shapes, used with `transport`: `JevQuestion` → `GatewayQuestion`, `JevAnswer` → `GatewayAnswer`
