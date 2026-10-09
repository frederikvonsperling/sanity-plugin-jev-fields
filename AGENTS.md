# Agent notes

## Changesets

A PR that changes what users get from npm (behaviour in `src/`, exports, types, dependencies, peer ranges) includes a changeset, written with `pnpm changeset` or as `.changeset/<short-name>.md`:

```md
---
'sanity-plugin-jev-fields': patch
---

Questions are re-evaluated after an undo, too.
```

- **Bump level:** `major` for breaking changes, `minor` for new features, `patch` for fixes. Breaking means anything a user must change for: a stored answer's shape or type name (frontends query them, and old content needs a migration), a removed or renamed option, export or translation key, or a higher peer range floor.
- **Summary:** one or two sentences for plugin users, saying what changes for them. It becomes their CHANGELOG entry.
- PRs that only touch docs, tests, CI or internals with unchanged behaviour ship without one. A bot comment on each PR shows whether it has a changeset.

## Vocabulary and decisions

- [`CONTEXT.md`](./CONTEXT.md) defines the domain language (question, attached field, state, criteria…): use its terms in code, docs and changesets.
- [`docs/adr`](./docs/adr) records why the plugin is built as it is: read it before changing how answers are stored, the type names, the Gateway, or where the API key lives.
