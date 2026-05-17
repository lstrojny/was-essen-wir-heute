# LLM access

LLM features in this app — import enrichment, chat-import recipe synthesis,
translation, on-demand translate, future suggestions — all run through the
**Vercel AI SDK** (`ai` package), which provides a provider-agnostic surface
for chat completions, structured output, and (later) streaming chat. The
SDK is the "gateway" referenced in `00_stack.md`: provider choice is a
config detail behind a uniform call shape.

## v1 provider

- The app talks to a **LiteLLM proxy** (running on a separate host) via
  `@ai-sdk/openai` with a custom `baseURL`. LiteLLM exposes an
  OpenAI-compatible API; for the app, every model — including Anthropic
  Claude — is reached through that one adapter.
- The adapter is invoked via `litellm.chat(model)` (Chat Completions
  endpoint), not the default `litellm(model)` which targets the newer
  OpenAI Responses API. LiteLLM proxies Chat Completions faithfully;
  Responses-API parity is not guaranteed, and stream chunks come back
  Chat-shaped (`chatcmpl-*` ids), which the Responses adapter
  mis-parses.
- Configuration (read from env at startup):
  - `LITELLM_BASE_URL` — the proxy's base URL (e.g.
    `https://litellm.internal/v1`).
  - `LITELLM_API_KEY` — virtual key issued by LiteLLM. The app holds no
    upstream provider keys; the Anthropic key lives in LiteLLM's
    config.
- In v1 only Anthropic Claude is wired up upstream in LiteLLM. Adding
  OpenAI (or any other provider) later is a LiteLLM-side config change
  plus a model-string change at the call-site. The feature code does
  not change.

## Internal abstraction

The app never calls the AI SDK directly from feature code. A single
**LLM module** (`src/llm/...`) wraps it and exposes a small set of named
operations, one per call-site:

- `enrichSpoonacularImport(payload)` — extract wait time, pick cuisine
  key, suggest central-list matches, translate to the other language.
  Used by `04_imports.md`.
- `synthesizeRecipeFromMessages(messages)` — turn a multi-turn chat
  history into a structured recipe in both supported languages. Used
  when the user clicks "Save as new recipe" at the end of a chat
  conversation on the recipes list (see `07_ai_chat.md`,
  `04_imports.md`).
- `chatAboutRecipe(messages, tools, pageContext)` — free-form streaming
  text response that powers the persistent AI chat (see
  `07_ai_chat.md`). Uses the AI SDK's `streamText` so the UI can render
  tokens as they arrive. The client coalesces stream notifications via
  `useChat`'s `experimental_throttle` (~50 ms); without this, large tool-
  input payloads (multi-language recipe drafts streamed token by token)
  outpace React's commit cycle and trip its nested-update guard. Accepts
  a **tool catalog** so the model can consult and mutate the user's
  data, and a **page context** describing what the user is currently
  looking at (page kind, entity id, current form state). The structured
  emit happens separately via `synthesizeRecipeFromMessages`.
- `enrichSpoonacularImport(detail)` — see `04_imports.md`.
- `translateText(text, from, to)` — used by the on-demand translate
  action in `06_i18n.md`.
- `proposeIngredientMatches(name, candidates)` — rank central-list
  candidates for a free-text ingredient name. Used in the import preview
  and in manual entry.

Each operation has its own typed input and output. Feature code never
constructs prompts or sees raw model responses — that lives inside the
module.

## Chat tools

`chatAboutRecipe` exposes a catalog of **tools** the model may call
between user turns. Tools run server-side under the authenticated
user's session; the model never sees a raw connection string or
credentials. The AI SDK's multi-step tool-calling loop drives the
conversation: the model emits tool calls, the route executes them,
results are streamed back, the model continues.

The catalog lives in `src/llm/tools.ts`. Each tool has a description
(model-facing English text), a Zod `inputSchema`, and a server-side
`execute` handler. All handlers run with the *current session user's
identity* — there is no escalation. Mutations are scoped to what the
user is allowed to do in the UI.

### Phase 1 — read + rating writes (built)

Read tools:

- `search_recipes` — by free-text query, cuisine key, complete-only.
  Returns id, titles, cuisine, rolled-up times, complete-meal flag,
  aggregate rating, current user's rating.
- `get_recipe` — full recipe detail including ingredients, steps, and
  component references.
- `list_cuisines` — controlled vocabulary (key + DE/EN labels).
- `list_ingredients` — list or search the central catalog. Omit query
  for a full list; pass a substring to match canonical names and
  aliases.
- `get_ingredient` — full ingredient detail including aliases, count
  units, density, role.
- `get_recipes_using_ingredient` — recipes that reference a given
  central ingredient.
- `get_recipe_ratings` — aggregate plus per-user breakdown for a recipe.

Write tools (scoped to the session user, two-step confirmation —
see *Confirmation pattern*):

- `set_my_rating(recipe_id, score)` — sets/updates the current user's
  rating for a recipe.
- `clear_my_rating(recipe_id)` — removes the current user's rating.

### Phase 2 — client-side tools (planned)

These tools are declared on the server (so the model sees the input
schema) but executed **in the browser** via `useChat`'s `onToolCall`.
They never persist on their own; the user must click Save.

Detail-page only (`DETAIL_PAGE_CLIENT_TOOL_DEFS`):

- `patch_recipe_form(patch)` — apply a sparse patch to the open recipe
  form (any subset of title, notes, cuisine, times, ingredients,
  steps, components, complete-meal flag). Triggers change-tracking
  highlights.
- `patch_ingredient_form(patch)` — same shape for the ingredient form
  (canonical names, role, density, notes, aliases, count units).

Always available (`ALWAYS_CLIENT_TOOL_DEFS`):

- `open_new_recipe_form(recipe)` — proposes a new recipe from the
  conversation. Client stashes the structured recipe in
  `sessionStorage` under a freshly generated draft id (key
  `wewh.newRecipeDraft.<id>`) and navigates to
  `/recipes/new?draft=<id>`. The new-recipe page loads the draft on
  mount, pre-fills the form (re-mounting via `key` so initial values
  are correct), and clears the stash so a reload does not re-apply.
  Per-id indexing lets multiple drafts coexist for parallel editing.

### Phase 3 — server-side update / delete tools (built)

Direct database writes from chat, callable from any page (not only
the open form):

- `update_recipe(recipe_id, patch, confirmed)` — sparse patch over
  scalars (titles, notes, cuisine, times, complete-meal flag), full-
  replacement arrays for steps and components, and (optional) full-
  replacement ingredients list with `intended_servings` for scale
  conversion. Omitted fields are left unchanged. Component cycles are
  rejected with a structured error. Reuses the same DB write path the
  form action uses (`writeRecipeFromPatch` in
  `src/recipes/actions.ts`).
- `update_ingredient(ingredient_id, patch, confirmed)` — sparse patch
  over canonical names, role, density, notes, with full-replacement
  arrays for aliases and count units.
- `delete_ingredient(ingredient_id, confirmed)` — deletes the
  ingredient. Aliases and count units cascade; `recipe_ingredients`
  rows survive with `ingredient_id` set to NULL.

### Confirmation pattern

Every **database write** tool takes a `confirmed: boolean` parameter
(default `false`). When `confirmed` is `false` the tool **does not
write**; it returns a structured `{ needs_confirmation: true,
summary: ... }` payload describing what the call *would* do (e.g.
"would change cuisine from italian to thai, set active time from 20
to 25"). The model is instructed to relay the summary in plain text,
wait for the user's explicit approval ("yes", "ok", "do it"), and
only then call the same tool again with `confirmed: true`. If the
user declines, the model does not call the tool again.

This pattern applies to:

- `set_my_rating`, `clear_my_rating`
- `update_recipe`, `update_ingredient`, `delete_ingredient`

It deliberately does **not** apply to the client-side form-patch
tools (`patch_recipe_form`, `patch_ingredient_form`): those don't
persist on their own and the yellow change-highlight on the open form
plus the explicit Save button already act as the confirmation step.

### Tool-result rendering

The chat UI shows tool invocations inline between assistant turns so
the user can see what the model consulted: tool name, a compact summary
of the arguments, and a one-line result summary (e.g. "found 3
recipes"). Tool results themselves are not displayed in full; the
model summarises them in its subsequent text turn.

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
`LLM_MODEL_MATCH`). Values are **LiteLLM model strings**
(`<provider>/<model>`), which LiteLLM resolves to the right upstream
provider. Changing a model is a config change, not a code change.
Defaults for v1:

- `LLM_MODEL_CHAT_SYNTHESIS` — `anthropic/claude-sonnet-4-6`
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
- `synthesizeRecipeFromMessages` failing: the error is surfaced inline
  in the chat sidebar with a retry affordance (re-click "Save as new
  recipe"). User-initiated abort is not reported as a failure (see
  *Cancellation*).
- `chatAboutRecipe` failing mid-stream: the partial text stays in the
  transcript; an error chip is shown and the user can retry.
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

Interactive LLM operations (`chatAboutRecipe` streaming,
`synthesizeRecipeFromMessages`) must be cancellable from the UI: the
user can click an "Abort"/"Stop" button while the call is in flight
and have the underlying request torn down server-side so tokens stop
being billed.

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
