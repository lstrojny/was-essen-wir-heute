# LLM access

LLM features in this app — import enrichment, chat-import recipe synthesis,
translation, on-demand translate, future suggestions — all run through the
**Vercel AI SDK** (`ai` package), which provides a provider-agnostic surface
for chat completions, structured output, and (later) streaming chat. The
SDK is the "gateway" referenced in `00_stack.md`: provider choice is a
config detail behind a uniform call shape.

## v1 provider

- **Anthropic Claude** via `@ai-sdk/anthropic`. API key is read from the
  `ANTHROPIC_API_KEY` env var (SDK default).
- Adding OpenAI later is a config change: install `@ai-sdk/openai`, swap
  the model factory at the call-site. The feature code does not change.

## Internal abstraction

The app never calls the AI SDK directly from feature code. A single
**LLM module** (`src/llm/...`) wraps it and exposes a small set of named
operations, one per call-site:

- `enrichSpoonacularImport(payload)` — extract wait time, pick cuisine
  key, suggest central-list matches, translate to the other language.
  Used by `04_imports.md`.
- `synthesizeRecipe(prompt, currentRecipe?)` — turn a free-text prompt
  (and optionally an existing structured recipe) into a structured
  recipe in both supported languages.
  - **Fresh mode** (`currentRecipe` omitted): used by the LLM chat
    import (see `04_imports.md`). The prompt describes the recipe the
    user wants to save.
  - **Refine mode** (`currentRecipe` supplied): used by the
    "Refine with AI" action on any recipe (see `01_recipes.md`). The
    prompt describes a change ("make this vegetarian"); the LLM
    returns the full modified recipe. The system prompt is the same;
    the user message includes the current recipe JSON plus the
    change request.
- `translateText(text, from, to)` — used by the on-demand translate
  action in `06_i18n.md`.
- `proposeIngredientMatches(name, candidates)` — rank central-list
  candidates for a free-text ingredient name. Used in the import preview
  and in manual entry.

Each operation has its own typed input and output. Feature code never
constructs prompts or sees raw model responses — that lives inside the
module.

## Model choice per call-site

Each operation picks its own model. The choice is configuration, not
hard-coded:

- A cheap, fast model for `proposeIngredientMatches` (high volume, narrow
  task).
- A stronger model for `synthesizeChatRecipe` and `enrichSpoonacularImport`
  (broader reasoning, structured output).
- A mid-tier model for `translateText`.

Model identifiers are supplied via environment variables (e.g.
`LLM_MODEL_ENRICHMENT`, `LLM_MODEL_TRANSLATION`, `LLM_MODEL_CHAT_SYNTHESIS`,
`LLM_MODEL_MATCH`). Changing a model is a config change, not a code change.
Defaults for v1:

- `LLM_MODEL_CHAT_SYNTHESIS` — `claude-sonnet-4-6`
- (other operations defaulted as they are introduced)

## Prompts

- Prompts live in **version-controlled files** colocated with the LLM
  module, not as inline string literals scattered through feature code.
- Each operation has a system prompt and a user-prompt template.
- Prompts are versioned with the code. There is no runtime prompt editing.
- The chat-import case is the only one that uses a multi-turn message
  history; the others are single-shot.

## Structured output

Operations that return structured data (`enrichSpoonacularImport`,
`synthesizeChatRecipe`, `proposeIngredientMatches`) request **JSON output
constrained by a Zod schema** via the AI SDK's `generateObject` (or
`streamObject` if/when streaming is enabled). The SDK validates the
response against the schema and surfaces a typed error on mismatch;
validation failures are treated as call failures (see *Failure
handling*).

## Failure handling

Each operation has a **timeout** (default 30 s; longer for
`synthesizeChatRecipe`) and **at most one retry** with backoff on
transient errors (gateway 5xx, timeouts). Authoritative-error responses
(4xx that aren't transient) are not retried.

How failure surfaces to the user is per call-site, matching the
functional specs:

- `enrichSpoonacularImport` failing: the preview is shown with un-enriched
  data (see `04_imports.md`). Import does not fail because of enrichment.
- `synthesizeRecipe` failing: the error is surfaced inline on the
  triggering surface (LLM import page or refine panel) with a retry
  affordance (re-submit the prompt). User-initiated abort is not
  reported as a failure (see *Cancellation*).
- `translateText` failing: the source-language text continues to display
  with the "untranslated" marker (see `06_i18n.md`).
- `proposeIngredientMatches` failing: the preview shows the row as
  unlinked; the user can still manually link.

## Long-running calls (sync vs. background)

Enrichment and chat synthesis can take several seconds. v1 runs them
**synchronously** within the request that triggered them, with a loading
state in the UI. This avoids a job queue.

If latency becomes a problem (or a Spoonacular import with full
enrichment + dual-language translation routinely exceeds ~10 s), the
operations move to a background-job model: the import is created in a
*pending* state and the preview updates when the job completes. This is
a v2 concern and is flagged in `00_stack.md`.

## Cancellation

Interactive LLM operations (`synthesizeRecipe` in both fresh and refine
mode) must be cancellable from the UI: the user can click an "Abort"
button while the call is in flight and have the underlying request
torn down server-side so tokens stop being billed.

This requires that the operation runs behind a **Route Handler**
(`/api/...`), not a Next.js Server Action. Server Actions cannot
propagate a client-controlled `AbortSignal` to the call, so a Server
Action cannot be cancelled mid-flight. The Route Handler reads
`request.signal` and forwards it to the AI SDK's `abortSignal`
parameter, which aborts the upstream provider call.

Client-side, the UI uses `fetch` with an `AbortController`. Aborting:

- Cancels the in-flight request.
- Is **not** an error condition. The error state stays empty; the
  pending state clears; no retry button is shown.
- Discards any partial response. The form state is unchanged.

Background-only or fire-and-forget operations (enrichment kicked off
async, future translation backfills) can still live behind Server
Actions, because user-initiated cancellation is not applicable.

## Observability

Every LLM call is logged with:

- call-site name (the operation name above),
- model identifier as actually used,
- latency,
- token usage (input/output) if the gateway returns it,
- success / failure and the failure reason,
- a correlation ID linking back to the user-facing request.

Prompt and response content are **not** logged by default. A debug flag
(env var) enables full-content logging for development.

## Cost guardrails

- Each operation declares a **maximum input token budget**; the module
  refuses to call the gateway if the constructed prompt exceeds it. This
  catches runaway inputs (e.g. enormous chat histories) before they hit
  the gateway.
- Monthly spend caps are enforced at the **gateway**, not in the app.

## Testing

- Unit and integration tests **mock the LLM module** at its public
  interface. Tests do not call the gateway.
- A small set of optional end-to-end smoke tests can call the real
  gateway with cheap models, gated on an env var so they don't run in
  every test run.

## Open questions

- **Streaming**. The AI SDK has `streamObject` / `streamText`. Useful for
  chat-import responsiveness. v1 stays non-streaming; revisit if chat
  synthesis feels slow.
- **Prompt-evaluation harness**. As prompts evolve, a fixture-based
  evaluation suite (golden inputs → expected structured outputs) helps
  prevent regression. Deferred until prompts stabilise.
- **Caching**. Whether to cache by prompt-hash for repeated identical
  inputs (e.g. translating the same ingredient name twice). Likely
  worthwhile for `translateText` and `proposeIngredientMatches`,
  unnecessary for the per-recipe operations.
