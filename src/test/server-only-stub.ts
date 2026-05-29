// Empty stub for the `server-only` package, aliased in `vitest.config.ts`.
// The real package throws at runtime to keep server-only modules from being
// imported by client bundles; in unit tests we exercise those modules from
// Node directly and want them to load without error.
export {}
