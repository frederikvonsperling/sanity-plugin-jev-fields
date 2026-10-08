# Answers are stored as `jev.noul`, `jev.score` and `jev.choice`

Stored answers use schema types in a dotted `jev.` namespace, like Sanity's own `sanity.*` types, although Sanity's naming docs suggest `[a-zA-Z0-9_]`. The schema validator accepts dots, GraphQL deploy and TypeGen turn `jev.score` into `JevScore`, and GROQ matches `_type == "jev.score"` as a plain string. The yes/no type uses TypeSafe's term "noul" rather than the Gateway's "boolean", because its answer is a probability, not true or false.

## Considered Options

- **`jevNoul` / `jevScore`.** Within the recommended characters, but the namespace is less obvious in queries and generated types.

## Consequences

These names are a contract with every frontend that queries them: changing one after release means a content migration for every user. A user type named `jevScore` would get the same GraphQL name as `jev.score`. The entries in a choice's `probabilities` are a top-level type, `jev.choiceProbability`, because `sanity graphql deploy` rejects anonymous inline objects.
