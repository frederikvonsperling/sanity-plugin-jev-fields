# The API key is stored in the dataset, in `secrets.jev`

A Studio plugin has no server of its own, so the AI Gateway key has to reach the editor's browser. It is stored in the dataset document `secrets.jev` (type `pluginSecrets`, the same shape as `@sanity/studio-secrets`) and set, tested and removed in the Studio's Jev tool. Documents with a dot in their ID are hidden from unauthenticated queries, so the key stays out of the deployed Studio's JavaScript and out of public queries, and can be rotated without a redeploy.

## Considered Options

- **A `SANITY_STUDIO_*` environment variable.** It is bundled into the Studio's JavaScript, which anyone can download from a deployed Studio. Kept only as `apiKey` in the plugin config, for local development.
- **`@sanity/studio-secrets` itself.** Same storage, but its dialog shows the key in plain text, does not close after saving, and gives no error when saving fails.

## Consequences

Anyone who can read the dataset can read the key: every Studio user, and every API token with read access, including tokens that frontends use for queries or previews. It is also included in dataset exports and backups. The README tells users to use a dedicated key with a spend limit, and `transport` exists for teams whose editors and tokens must never see the key: requests go through their own server instead.
