# anti-slop

Vendored from [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) at commit
[`c44ef22`](https://github.com/dmmulroy/anti-slop/tree/c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b)
(`c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`), copied from the `install-anti-slop` skill's
bundled assets (`skills/install-anti-slop/assets/anti-slop`), which match upstream `src/` minus the
test files.

- Generic plugin: `index.ts`, registered in `oxlint.config.ts`.
- Effect plugin: `effect/index.ts`, copied but not registered, since this package doesn't use Effect.
- `vendor/eslint-stylistic/` keeps its own `LICENSE` and `UPSTREAM.md`.

No local changes to the rules. The directory is excluded from `oxlint` and `oxfmt` so it stays
diffable against upstream. `@oxlint/plugins` is pinned to the same exact version as `oxlint`.
