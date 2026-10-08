# The API key is stored in the dataset, in `secrets.jev`

A Studio plugin has no server of its own, so the AI Gateway key has to reach the editor's browser. It is stored in the dataset document `secrets.jev` (type `pluginSecrets`, the same shape as `@sanity/studio-secrets`) and set, tested and removed in the Studio's Jev tool. Documents with a dot in their ID are not publicly readable, so the key stays out of the deployed Studio's JavaScript and out of public queries, and can be rotated without a redeploy.

## Considered Options

- **A `SANITY_STUDIO_*` environment variable.** It is bundled into the Studio's JavaScript, which anyone can download from a deployed Studio. Kept only as `apiKey` in the plugin config, for local development.
- **`@sanity/studio-secrets` itself.** Same storage, but its dialog shows the key in plain text, does not close after saving, and gives no error when saving fails.

## Consequences

Every Studio user who can read the dataset can read the key, and it is included in dataset exports. The README tells users to use a dedicated key with a spend limit, and `transport` exists for teams whose editors must never see the key: requests go through their own server instead.
