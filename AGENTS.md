# Agent notes

## Changesets

A PR that changes what users get from npm (behaviour in `src/`, exports, types, dependencies, peer ranges) includes a changeset, written with `pnpm changeset` or as `.changeset/<short-name>.md`:

```md
---
'sanity-plugin-jev-fields': patch
---

Signals re-evaluate after an undo, too.
```

- **Bump level while on 0.x:** `minor` for breaking changes and new features, `patch` for fixes. `major` releases 1.0.0, which freezes the stored answer shapes: reserve it for that deliberate release.
- **Summary:** one or two sentences for plugin users, saying what changes for them. It becomes their CHANGELOG entry.
- PRs that only touch docs, tests, CI or internals with unchanged behaviour ship without one. A bot comment on each PR shows whether it has a changeset.

## Vocabulary and decisions

- [`CONTEXT.md`](./CONTEXT.md) defines the domain language (signal, attached field, state, criteria…): use its terms in code, docs and changesets.
- [`docs/adr`](./docs/adr) records why the plugin is built as it is: read it before changing how answers are stored, the type names, the Gateway, or where the API key lives.
