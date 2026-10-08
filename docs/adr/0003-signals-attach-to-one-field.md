# Signals attach to the one field they judge, declared in `options.jev`

A signal belongs to exactly one field: it is declared in that field's `options.jev` (`{readable: noul(…), …}`), shown as a chip in a strip under the field's input, and reads only that field's content. Field options are how Sanity plugins usually extend existing fields, and the field stays a plain `defineField`. Each answer is stored in its own field next to the attached one, named after the signal (`readable`, `evidence`, …), so frontends query `readable.probability` directly.

Plugins are applied before the Studio's own config (`flattenConfig` in Sanity 6), so a plugin cannot see the schema to add those answer fields. `withJevAnswers(schemaTypes)` in `sanity.config` adds them.

## Considered Options

- **A `withJev(field, signals)` helper spread into `fields`.** No config line, but hard to read and unlike other Sanity plugins.
- **Answer fields declared by hand.** Every signal named twice, and the two drift apart. Still possible: `withJevAnswers` keeps an answer field that already exists with the right type.
- **Answer fields that point at their field (`attachTo`).** Finding sibling fields from the attached field's input relies on more Studio internals.
- **One document-level `jev` object holding all answers.** A tidier schema, but every query goes through `jev.<field>.<signal>`.
- **Signals that also read other fields (`context: ['title']`).** Left out to keep one signal to one field; it can be added later without changing stored data.

## Consequences

The answer fields are not `hidden`, because Sanity does not mount hidden fields: each answer field renders nothing and writes its own value through its own `onChange` (Sanity's root-level form callbacks are internal API). They share the attached field's group and fieldset so they are mounted whenever it is. Signals only evaluate after a local edit to the attached field, never because someone else's edit arrived, so opening a document never writes to it.
