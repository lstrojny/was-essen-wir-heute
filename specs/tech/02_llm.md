# LLM access

LLM features in this app — import enrichment, chat-import recipe synthesis,
translation, on-demand translate, future suggestions — all run through an
**LLM gateway** that exposes both Anthropic (Claude) and OpenAI models behind
a single API (see `00_stack.md`).

## Internal abstraction

The app never calls the gateway directly from feature code. A single
**LLM module** wraps the gateway and exposes a small set of named
operations, one per call-site:

- `enrichSpoonacularImport(payload)` — extract wait time, pick cuisine
  key, suggest central-list matches, translate to the other language.
  Used by `04_imports.md`.
- `synthesizeChatRecipe(messages)` — turn a chat conversation into a
  structured recipe in both supported languages. Used by `04_imports.md`.
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
constrained by a schema** via whatever facility the gateway provides
(tool-use / function-calling / response_format). The module **validates**
the parsed response against the schema before returning it to feature
code; validation failures are treated as call failures (see *Failure
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
- `synthesizeChatRecipe` failing: the error is surfaced in the chat with
  a retry button.
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

- **Concrete gateway product** (LiteLLM, OpenRouter, Anthropic's gateway,
  custom). Pin once known so the wire-level call shape is concrete.
- **Streaming**. Useful for chat-import responsiveness. v1 can stay
  non-streaming; revisit if chat synthesis feels slow.
- **Prompt-evaluation harness**. As prompts evolve, a fixture-based
  evaluation suite (golden inputs → expected structured outputs) helps
  prevent regression. Deferred until prompts stabilise.
- **Caching**. Whether to cache by prompt-hash for repeated identical
  inputs (e.g. translating the same ingredient name twice). Likely
  worthwhile for `translateText` and `proposeIngredientMatches`,
  unnecessary for the per-recipe operations.
