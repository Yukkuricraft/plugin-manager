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

  This is enforced by `erasableSyntaxOnly` in `tsconfig.json`, which will fail the build on parameter properties (also
  on enums and namespaces).

- **No `private` keyword.** Use native `#private` fields/methods instead:

  ```ts
  #note() { ... }
  ```

  Flagged by the `no-restricted-syntax` rule in `eslint.config.js`.

## Tests

- Test files live under `test/`, mirroring the `src/` layout — not colocated with the source they cover.
  `src/pluginList.ts` is tested by `test/pluginList.test.ts`, `src/sources/modrinth/update.ts` by
  `test/sources/modrinth/update.test.ts`, etc.