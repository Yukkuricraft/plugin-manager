# Coding style

## TypeScript

- **No TS constructor parameter properties.** Don't write `constructor(readonly name: string) {}`. Declare the field
  explicitly and assign it in the constructor body instead:

  ```ts
  readonly name: string

  constructor(name: string) {
    this.name = name
  }
  ```

- **No `private` keyword.** Use native `#private` fields/methods instead:
  ```ts
  #note() { ... }
  ```

## Tests

- Test files live under `test/`, mirroring the `src/` layout — not colocated with the source they cover.
  `src/pluginList.ts` is tested by `test/pluginList.test.ts`, `src/sources/modrinth/update.ts` by
  `test/sources/modrinth/update.test.ts`, etc.

## Prose

Every clause must carry a fact the reader can't derive from what's already been said. After drafting a sentence, re-read
everything after its main clause — the last comma, the em dash — and delete it unless it answers a question the reader
would otherwise still have.

Specific things not to write:

- **Continuity reassurance**: "as they always have", "as before", "still", "this hasn't changed". The reader has no
  history with the tool.
- **Negated restatement**: stating a fact and then restating it inverted — "in this directory, never in the server's
  directory". Pick one half. Keep the negation only when readers demonstrably assume the wrong thing.
- **Emphatic re-specification**: "always", "only ever", "in this tool's own directory" attached to a statement that was
  already unambiguous.
- **Complement padding**: a rule followed by its mirror image, when the mirror adds no new fact.
- **Derivable consequence**: a sentence that only spells out what the previous sentence entails.
- **Framing**: "Note that", "It's worth noting", "Keep in mind", "This means that". Just say the thing.
