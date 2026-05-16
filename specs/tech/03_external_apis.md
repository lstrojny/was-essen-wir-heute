# External APIs

The only external API in v1 is **Spoonacular**, used to import recipes
(see `04_imports.md`). This file describes the client wrapper, auth,
caching, and error handling for it.

## Client module

The app never calls Spoonacular directly from feature code. A single
**Spoonacular client module** wraps the HTTP API and exposes a small set
of typed operations:

- `searchRecipes(query, options)` — search by recipe name; returns a list
  of search hits with id, title, and image URL.
- `getRecipeById(id)` — fetch the full recipe payload by Spoonacular ID.
- `extractRecipeByUrl(url)` — extract from a Spoonacular recipe URL.

The wrapper normalises responses into the app's own typed shape before
returning. Missing optional fields become `null`; this is where the
"Spoonacular returns sparse data" reality is absorbed so feature code can
trust the types.

## Authentication

- API key supplied via `SPOONACULAR_API_KEY` environment variable.
- Sent on every request as required by the Spoonacular API. The key is
  never logged.

## Rate limits and quota

Spoonacular meters usage in **points**, not request count. Responses
include quota headers (`X-API-Quota-Used`, `X-API-Quota-Left`,
`X-API-Quota-Request`).

- The client reads quota headers on every response and exposes them via
  the operation result.
- A persistent record of remaining quota is kept (a single row in a
  `spoonacular_quota` table, updated on each call) so the app can warn
  the user when quota is low.
- `402` (payment required / quota exceeded) and `429` (too many requests)
  are surfaced as a typed `QuotaExceeded` error. Imports fail with a
  clear "Spoonacular quota exhausted for today" message; nothing is
  retried.

## Caching

Recipe-by-ID and extract responses are cache-friendly (the upstream data
changes rarely). Search results are less so but still benefit from
short-lived caching.

- A `spoonacular_cache` SQLite table stores the response keyed by the
  full request URL (including query string, excluding the API key).
  Columns: cache key, response JSON, fetched-at timestamp.
- TTLs per operation:
  - `getRecipeById` / `extractRecipeByUrl`: **30 days**.
  - `searchRecipes`: **24 hours**.
- The cache is consulted before any network call. Cache hits do not
  consume quota and skip rate-limit handling entirely.
- The cache can be invalidated manually from a maintenance surface
  (out of scope for v1; flag).

## Retries and timeouts

- Per-request timeout: **15 seconds**.
- One retry on transient errors (network errors, 5xx, body parse
  failure). Exponential backoff with jitter, capped at 2 s.
- No retry on 4xx (including 402/429). Authoritative errors propagate.

## Failure surfacing

The functional spec for imports owns the user-facing wording; the client
surfaces typed errors so feature code can map them:

- `QuotaExceeded` — quota / rate-limit failure.
- `NotFound` — invalid recipe id or URL.
- `Transient` — retried-and-failed network/5xx case.
- `MalformedResponse` — schema-shape failure even after normalisation.

The import preview flow handles each: the user sees a clear message and
can retry or fall back to manual entry.

## Observability

Every Spoonacular call is logged with:

- operation name (the named methods above),
- request URL with the API key redacted,
- HTTP status code,
- latency,
- whether the response came from cache,
- quota-used / quota-left from response headers,
- success / failure with error type.

Response bodies are not logged by default. A debug env var enables full-
body logging for development.

## Images

Spoonacular returns image URLs in both search and recipe payloads. Photos
are not stored or used in v1 (see open question in `01_recipes.md`). The
URLs are normalised into the typed response shape so they are available
when image support lands, but no fetching or caching of image bytes
happens yet.

## Open questions

- **Cache invalidation surface**. Whether there is any user-facing way to
  force a re-fetch of a previously-cached recipe (e.g. "the imported
  recipe was missing a field"), or whether cache eviction is purely
  TTL-driven.
- **Quota-low threshold**. At what remaining-points level the app should
  start warning the user. Likely once the gateway product and plan are
  known.
- **Search-by-ingredients endpoint**. Carried over from `04_imports.md`'s
  open questions; will likely add a `searchRecipesByIngredients`
  operation when `03_tonights_dinner.md` lands.
- **Image proxying**. When photos are introduced, decide whether to
  hotlink Spoonacular's CDN or proxy/store images locally. Affects
  privacy and reliability.
