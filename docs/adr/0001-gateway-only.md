# Jev is reached only through Vercel AI Gateway

The Studio calls the model from the editor's browser. TypeSafe's own API (`api.typesafe.ai`) does not allow browser origins: its CORS preflight returns no `Access-Control-Allow-Origin`. Vercel AI Gateway allows any origin and serves Jev as `typesafe-ai/jev`. The plugin therefore talks only to the Gateway: one request format, one API key and no `provider` option.

## Considered Options

- **A TypeSafe provider behind the user's own proxy.** Every user of that provider would have to run a server before the plugin works, and the plugin would carry a second adapter for very few users. Anyone who needs a server in between can already use `transport`.

## Consequences

The Gateway does not say which Jev version answered, so stored answers record the model as the Gateway names it (`typesafe-ai/jev`). If TypeSafe allows browser origins, or evaluation moves server-side, a TypeSafe adapter can be added behind a `provider` option that defaults to `'gateway'`.
