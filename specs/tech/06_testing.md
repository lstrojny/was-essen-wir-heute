# Testing

The development flow is **specification → unit tests → code** (see
`AGENTS.md`). This file pins the tooling and conventions that make the
"unit tests" step concrete.

## Test runner

- **Vitest** (current major: 3.x), pinned via `package.json`.
- Chosen for: ESM-native, fast watch mode, first-class TypeScript, and
  a Jest-compatible API so the matchers and mocking surface are familiar.
- A `test` script runs `vitest run`; `test:watch` runs `vitest`.
- CI runs `pnpm test` alongside `typecheck` and `lint` (see
  `00_stack.md`).

## File layout

- Tests live **next to the code under test** as `<module>.test.ts`
  (e.g. `src/meal-plan/dates.test.ts` covers `src/meal-plan/dates.ts`).
  Co-locating keeps the test discoverable from the module and avoids
  a parallel `tests/` tree drifting out of sync.
- `*.test.ts` and `*.test.tsx` are picked up by Vitest's default glob.
  No other naming scheme is used.
- Test-only helpers (in-memory DB harness, fixture builders) live under
  `src/test/` and are imported by tests; production code never imports
  from `src/test/`.

## What gets a unit test

- **Pure logic** — every exported function whose behaviour is not
  trivially derivable from its type signature. Date math, scoring,
  unit conversion, name-folding, locale resolution, ID parsers, etc.
- **DB-touching code** — queries and write helpers, exercised against
  an **in-memory SQLite** instance brought up by the test harness
  (better-sqlite3 with `:memory:`, the same Drizzle migrations applied,
  WAL not required for in-memory).
- **External-adapter code** — Spoonacular client, LLM call sites. The
  network/AI-SDK boundary is mocked; the adapter's *own* behaviour
  (URL construction, response shaping, error mapping) is what is
  asserted.
- **Server actions** — orchestration code that composes the above.
  Tests pin behaviour by invoking the action with prepared DB state and
  mocked external calls; they do not go through Next.js's HTTP layer.

## What does not get a unit test

- Generated code, type-only modules, and trivial re-exports.
- The Next.js framework itself (routing, layouts, page rendering) —
  covered, if at all, by manual checks called out in `00_stack.md`.
- Pure UI rendering whose only assertions would duplicate the JSX. UI
  component tests are deferred and tracked as a separate decision; if
  added later they use `@testing-library/react` under Vitest's `jsdom`
  environment.

## Test database harness

- The production singleton in `src/db/index.ts` opens an in-memory
  SQLite database when `DATABASE_PATH=:memory:`, which `vitest.config.ts`
  sets for every test worker. Vitest isolates each test file in its own
  worker, so each file starts with a fresh, fully-migrated DB. Tests in
  the same file share that connection.
- `src/test/db.ts` exposes `resetDb()` — a `beforeEach` helper that wipes
  every user-managed table while preserving the migration-seeded reference
  data (cuisines, their translated labels, `meal_plan_settings`,
  `spoonacular_quota`). Tests can rely on the seeded rows as fixed truth.
- Modules guarded by `import 'server-only'` are loaded in tests via a
  Vitest alias that resolves the package to an empty stub
  (`src/test/server-only-stub.ts`). The guard exists to keep server
  modules out of client bundles; it has no semantic effect on unit
  tests running under Node directly.
- Tests that need DB state should build it through the production write
  helpers (server actions or query writers), not by raw SQL inserts,
  so the test exercises the same write path the app uses.

## Mocking external services

- HTTP calls (Spoonacular) are intercepted by stubbing the
  `fetch`-shaped boundary the adapter uses, not by network mocking
  libraries.
- LLM calls (Vercel AI SDK) are mocked by replacing the model factory
  at the call site, returning canned `generateText` / `streamText`
  results. Production code holds the model id; tests substitute the
  client.
- Time is mocked with Vitest's `vi.useFakeTimers()` where date-of-day
  matters (rate-limit windows, meal-plan date math). The meal-plan
  date helpers accept an injected "today" parameter for the same
  reason and tests prefer that over global mocking.

## Coverage

- No coverage threshold is enforced in v1. Coverage reports are
  generated on demand via `pnpm test -- --coverage` for inspection,
  not as a gate. Thresholds may be added once the suite stabilises.

## Mutation testing

Mutation testing is a **core part of the dev process**, not a nightly
side job. Line/branch coverage proves a line ran; mutation testing
proves the assertions actually pin its behaviour. We treat surviving
mutants as test-suite bugs to fix, the same way we treat failing tests.

### Tool

- **Stryker Mutator** with `@stryker-mutator/vitest-runner`. Stryker
  is the only mature mutation-testing framework in the JS/TS
  ecosystem, consumes Vitest's existing config directly, and has the
  reporting/threshold tooling we need.

### Scope

- Same modules that get a unit test (see "What gets a unit test"
  above): pure logic, DB-touching code, external adapters, server
  actions.
- Excluded from mutation analysis (in addition to anything excluded
  from unit testing):
  - `src/test/**` (test-only helpers).
  - Next.js app router files (`app/**`), layouts, pages — they are
    framework wiring, not unit-tested.
  - Drizzle migrations and generated code.
  - Type-only modules and barrel re-exports.

### Threshold

- **High: 100, Low: 95, Break: 95.** Mutation score below 95% is a
  hard failure. There is no "warn but pass" band — the break and low
  thresholds are the same number so any regression below 95 fails
  immediately.
- Why 95 and not 100: leaves a small margin for genuinely equivalent
  mutants Stryker can't detect statically. If the suite is at 100,
  great; the gate is the floor, not the goal.

### Cadence

- **Local**: `pnpm test:mutate` runs the full Stryker suite on demand.
  Developers run it before opening a PR; this is the inner-loop
  invocation. No git hook — pre-commit / pre-push would make ordinary
  commits too slow.
- **CI**: a dedicated mutation-testing job runs `pnpm test:mutate` on
  every PR, in parallel with `test` / `typecheck` / `lint`. The job
  must pass for the PR to be mergeable. The main `pnpm test` job stays
  fast and independent so unit-test failures surface without waiting
  for Stryker.
- **No incremental mode.** Stryker's incremental cache file is not
  committed and not used in CI. Every run is a full run against the
  current code, so the score is always authoritative and there is no
  cache-staleness footgun. Acceptable cost while the suite is small;
  revisit if CI time becomes the bottleneck.

### Reports

- HTML report is written to `reports/mutation/` and git-ignored. CI
  uploads it as a job artifact so surviving mutants are inspectable
  from the PR.
- Stryker's `clear-text` reporter prints surviving mutants to the job
  log; the summary line (score + counts) is the first thing a reviewer
  sees.

### Harness reuse

- Mutation runs use the same in-memory SQLite + stubbed-fetch + mocked
  AI-SDK harness as unit tests (`DATABASE_PATH=:memory:`, `src/test/`
  helpers). Stryker does not get its own test-double layer; if a
  mutant survives because a mock is too loose, that is the signal the
  mock needs tightening.

## Open questions

- **UI component tests** — deferred. If added, settle on
  `@testing-library/react` + `jsdom` and write the component-testing
  conventions here before the first component test lands.
- **E2E / browser tests** — not in scope for v1. Manual checks of the
  mobile UI flow remain the verification path until a deliberate need
  for Playwright (or similar) emerges.
