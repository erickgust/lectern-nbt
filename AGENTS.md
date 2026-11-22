# lectern-nbt

A TypeScript library for reading and writing Minecraft's NBT format. ESM only, no runtime dependencies. It runs on Node 22+, Bun, Deno and browsers. `README.md` is the user-facing reference.

## Layout

- `src/*.ts`: the public API (`decode`, `encode`, `check`, `read`, `write`, `detect`, `compress`, `decompress`, `validate`, `print`, codec builders, number constructors). `src/index.ts` is the only entry point.
- `src/internal/`: the reader (`reader.ts`), writer (`writer.ts`), error-path walker (`path.ts`), codec inference (`infer.ts`), shared checks (`checks.ts`), MUTF-8 (`mutf8.ts`) and number brands (`brand.ts`).
- `test/*.test.ts`: unit tests (Node). `test/types/`: type tests. `test/smoke/`: one scenario run on Node, Firefox, Bun and Deno. `test/consumer/`: checks the built `.d.ts` with TypeScript 6. `test/fixtures/`: real NBT files from other tools, with sources and licenses in its README.
- `bench/`: speed (`speed.bench.ts`), retained memory (`memory.ts`), the CI speed guard (`guard.ts`), and the synthetic fixtures in `bench/fixtures/`. Don't regenerate those fixtures; tests and the guard depend on their exact bytes.

## Commands

| Purpose                      | Command                                                     |
| ---------------------------- | ----------------------------------------------------------- |
| Install                      | `bun install --frozen-lockfile`                             |
| Everything CI checks         | `bun run check`                                             |
| Unit, type and Firefox tests | `bun run test`                                              |
| One test file                | `bunx vitest run --project unit test/<name>.test.ts`        |
| Typecheck, lint, format      | `bun run typecheck`, `bun run lint`, `bun run format:check` |
| Fix formatting               | `bunx oxfmt <files>`                                        |
| No inline suppressions       | `bun run suppressions`                                      |
| Bun and Deno smoke           | `bun run smoke:bun`, `bun run smoke:deno`                   |
| Published types and package  | `bun run package:check`, `bun run consumer:check`           |

Run every benchmark under a memory cap. Uncapped runs have crashed the machine:

```sh
systemd-run --user --scope -q -p MemoryMax=1G -p MemorySwapMax=0 timeout 300 node --max-old-space-size=512 --import ./bench/resolve-ts.ts bench/guard.ts
systemd-run --user --scope -q -p MemoryMax=1G -p MemorySwapMax=0 timeout 120 node --max-old-space-size=512 --expose-gc --import ./bench/resolve-ts.ts bench/memory.ts
```

Changes to `src/internal/reader.ts`, `writer.ts`, `path.ts` or `infer.ts` must keep the speed guard passing. Check `bench/memory.ts` as well.

## Rules

- No code comments. Names and structure carry the meaning.
- No inline lint or type suppressions. A justified exception goes in `.oxlintrc.json` `overrides`, scoped to the file.
- No type assertions (`as`) other than `as const`. The only exception is `toBrand` in `src/internal/brand.ts`. Non-null assertions (`!`) are allowed only in `src/internal/`.
- Errors are values. `decode`, `check`, `encode`, `validate`, `detect` and `print` never throw; `read`, `write`, `compress` and `decompress` never reject. Only the number and array constructors throw, on values the caller chose.
- Each function's error type holds exactly the kinds it can return. A new error kind means updating the aliases in `src/result.ts`, `test/types/errors.test-d.ts` and the errors table in `README.md` together.
- Codecs are plain data that survive `structuredClone` and `JSON.stringify`. No classes or functions inside them.
- In tests, compare large trees with `firstDifference` from `test/nbt.ts`, never a deep-equality assertion. A failing deep equal on a big tree builds a huge diff and runs out of memory.
- Never `pkill -f`. It can match and kill its own shell.
- Update `README.md` when public behavior or benchmark numbers change. Benchmark numbers come from a fresh capped run.

## Commits

- Conventional Commits (`feat:`, `fix:`, `perf:`, `test:`, `docs:`, `build:`, `refactor:`, `chore:`). One logical change per commit.
- Never mention plans, milestones or tickets in commit messages.
- The lefthook pre-commit hook runs oxfmt, oxlint and the suppression check. Don't bypass it.
