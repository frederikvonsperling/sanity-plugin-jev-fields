# Contributing

```sh
pnpm install
pnpm test
pnpm build
```

`pnpm record-fixtures` re-records the real Gateway responses in `src/__fixtures__` (needs
`AI_GATEWAY_API_KEY` in `.env`). [CONTEXT.md](./CONTEXT.md) defines the vocabulary and
[docs/adr](./docs/adr) records the main decisions.

## Releasing

To release a change, add a changeset to its PR with `pnpm changeset`. The release workflow keeps a
"Version packages" PR up to date; merging it stages the new version on npm (trusted publishing,
no token) and creates the GitHub release. A maintainer then approves the staged version on
npmjs.com, with 2FA, to publish it.
