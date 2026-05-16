# Stack

The app is a **Next.js** web application running in **Docker** on a home
server, backed by **SQLite**, with LLM features routed through a **gateway**
that supports both Anthropic (Claude) and OpenAI models. Family members
authenticate separately.

## Runtime

- Deployed via Docker on a home server. A single container image hosts the
  Next.js server.
- Configuration is supplied via environment variables: database file path,
  LLM gateway URL and credentials, Spoonacular API key, session secret,
  etc.
- The SQLite database file lives on a Docker volume so it persists across
  container restarts.
- Logs are written to stdout and collected by the host's Docker logging.

## Node and package manager

- **Node.js 24 LTS** is the runtime version, in both the production
  Docker image and for local development. The version is pinned via
  `package.json` `engines.node` (`>=24 <25`)
- **pnpm** is the package manager (current major: 10.x), pinned via
  `package.json` `packageManager` so every developer and the Docker
  build use the same version.
- The lockfile (`pnpm-lock.yaml`) is checked in; CI and Docker builds
  use `pnpm install --frozen-lockfile`.
- Local Node version may differ from the pinned one; developers are
  expected to use `nvm`/`fnm`/Volta to match the pinned version.

## Code style and quality

- **Biome 2.x** for linting and formatting; a single config covers both
  TypeScript/TSX and Markdown (Markdown support is a Biome 2 feature). The
  Biome version is pinned via `package.json`.
- Formatter conventions: **4-space indentation**, **no trailing
  semicolons**, and **single quotes** in TypeScript/TSX.
- **TypeScript strict mode** is on (`strict: true` in `tsconfig.json`).
- A `typecheck` script runs `tsc --noEmit`. CI (when added) runs
  `typecheck`, `lint`, and tests.

## Web framework

- **Next.js** with the App Router and **TypeScript**.
- Server Components and Server Actions are used where possible; client
  components only where interactivity actually requires them (forms with
  live ingredient matching, the LLM chat, the recipe preview).
- The UI must be mobile-friendly. Meal planning and tonight's-dinner
  decisions happen from a phone in the kitchen; recipe authoring may
  happen from a laptop.

## Persistence

- **SQLite**, stored as a single file on the Docker volume.
- A typed query layer is used; choice of layer and migration tool are
  pinned in `01_persistence.md`.

## LLM access

- All LLM calls (import enrichment, chat-import recipe synthesis,
  translation, on-demand translate, future suggestion features) go through
  an **LLM gateway** that exposes both **Claude** and **OpenAI** models
  behind a single API.
- Provider/model choice is **per call-site**, not global. Different
  features pick the model that fits them: a cheap model for alias
  suggestions, a stronger one for chat-import recipe synthesis or
  translation review.
- Details (gateway URL shape, call interface, retries, prompt boundaries,
  failure behaviour) live in `02_llm.md`.

## External APIs

- **Spoonacular** for recipe imports.
- API key supplied via environment variable.
- Rate-limiting, caching, retry strategy: see `03_external_apis.md`.

## Auth

- Multi-user. Each **family member** is a separate user account with their
  own login. Ratings are attached to user accounts.
- Details (session model, password hashing, account management) live in
  `04_auth.md`.

## Frontend styling

- **Material UI (MUI)** is the component library. It brings its own
  styling system (Emotion-based), so no separate utility-CSS framework
  (e.g. Tailwind) is used.

## Open questions

- **LLM gateway specifics**: which gateway product/setup (LiteLLM,
  OpenRouter, Anthropic's gateway, custom), its API shape, and how model
  identifiers are referenced from the app. Resolved input is needed for
  `02_llm.md` to be concrete.
- **Background work**: enrichment and translation calls can take several
  seconds. Whether long LLM-driven flows run synchronously (with a
  loading state) or as background jobs that update the preview when
  ready. Affects both UX and operational shape.
- **Image storage**: photos are deferred (see `01_recipes.md`), but when
  they land they likely live alongside the SQLite file on the volume, not
  in the database.
- **Backups**: SQLite file backup strategy. Belongs in a future ops note.
