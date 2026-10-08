# Jev fields

A Sanity Studio plugin that attaches questions to a field, answered by TypeSafe's Jev decision model from that field's content, so content can be judged (yes/no, rated, classified) as it is written.

## Language

### Questions

**Question**:
One thing Jev is asked about one field, together with its latest answer: **instructions** (what to judge) plus **criteria**, attached to a field. Shown as a chip in the field's **question strip**; its answer is stored next to the field, never typed by an editor. Jev's API uses the same word for the instructions and criteria it receives.
_Avoid_: signal, Jev field, AI field, check, metric, prompt

**Attached field**:
The field a question judges and is shown on. A question reads only this field.
_Avoid_: source field, target

**Criteria**:
The possible answers a question defines, one **criterion** each: the true/false meanings of a Noul, the ordered steps of a Score (lowest first), or the named options of a Choice. Jev's own term.
_Avoid_: rungs, levels, options

**State**:
The plain text a question is asked about: its attached field's value, flattened. (TypeSafe's term; unrelated to React state.)
_Avoid_: content, input, subject, source

**Noul**:
A yes/no question whose answer is the probability (0–1) that its "true" criterion holds. Described as "Yes/no" to editors.
_Avoid_: boolean (the answer is a probability, not true/false)

**Score**:
A question whose answer is a position on an ordered scale defined by its criteria.

**Choice**:
A question whose answer is one option from a named set defined by its criteria.

### Answers

**Evaluation**:
One call to the model for one question, and the answer stored from it, together with when it ran and which model answered (as the Gateway names it, e.g. `typesafe-ai/jev`; the Gateway does not expose Jev's version).
_Avoid_: run, result, prediction

**Stale**:
Said of a stored answer whose state, question or model has changed since its evaluation. A stale answer is kept and flagged, not deleted. A question with no stored answer of its own type is **unanswered**, not stale.
_Avoid_: outdated, invalid

**Local edit**:
An edit to an attached field made in this Studio. A question is evaluated on its own only while its attached field's current state came from a local edit; when someone else's edit arrives, their Studio evaluates it.
_Avoid_: touched

### Access

**Jev**:
TypeSafe's decision model, which answers typed questions about a state with calibrated probabilities. The plugin reaches it only through the Gateway.
_Avoid_: the AI, the LLM

**Gateway**:
Vercel AI Gateway, the only route from the Studio to Jev. It holds the API key's billing and spend limits.
_Avoid_: provider, API (ambiguous with TypeSafe's own API)
