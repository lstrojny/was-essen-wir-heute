# AI chat

A single persistent AI chat sits to the right of every page inside the
authenticated app. It replaces the earlier separate import-via-AI and
refine-via-AI surfaces. The chat is context-aware: it knows what page
the user is on, and on a detail page it can apply structured changes to
the open form with the same change-tracking semantics the old
refine-with-AI panel used.

## Surface

- A **fixed right sidebar** is present on every authenticated page
  (recipe list, recipe detail, ingredient list, ingredient detail,
  future planning pages). The main content area shrinks to make room.
- The sidebar is not collapsible in v1. It always shows the chat
  history, message input, and an inline action area for system
  actions the model surfaces.
- Chat state is **per-tab and ephemeral**. Reloading the page clears
  the conversation. Cross-page persistence within a single tab session
  is desirable but out of scope for v1.

## Context awareness

The chat receives a structured **page context** on every request:

- **Page kind**: `recipes-list`, `recipe-detail`, `ingredients-list`,
  `ingredient-detail`, or `other`.
- **Entity id** when on a detail page.
- **Current form values** when on a detail page. To keep prompt tokens
  bounded across long forms (recipes with many ingredients or steps),
  the system message contains only a **compact summary** (id, title,
  cuisine, ingredient/step counts, etc.) plus the open-form id. The
  model is instructed to call `get_recipe` / `get_ingredient` when it
  needs the full current state.

The context is supplied to the model in a system message preamble so
its replies and tool choices fit what the user is looking at. The
context is refreshed on each user turn.

## Capabilities by page

- **List pages** (`recipes-list`, `ingredients-list`):
  - Read-only Q&A against the user's catalogs.
  - On `recipes-list` the chat can propose a **new recipe**: when the
    user converges on something they want to save, the chat surfaces a
    "Save as new recipe" system-action button in the transcript.
    Clicking it runs `synthesizeRecipeFromMessages` and routes the
    user to the standard preview (see `04_imports.md`).
  - On `ingredients-list` the chat may propose a new ingredient via a
    "Create ingredient" system-action button (deferred — see *Open
    questions*).
- **Detail pages** (`recipe-detail`, `ingredient-detail`):
  - Same read-only Q&A.
  - Plus **client-side form-patch tools** scoped to the open form. The
    model calls a tool like `patch_recipe_form` or
    `patch_ingredient_form` with a structured patch; the patch is
    applied to the form client-side, never directly to the database.
    Examples: "add 'spring onion' as alias", "halve the salt",
    "switch the cuisine to Thai".

## Change tracking on detail pages

Form patches from the chat are visualised the same way the old refine
panel did:

- Each scalar field changed by a patch is highlighted (yellow border
  / background) until the user explicitly edits it (which clears the
  highlight on that field) or saves the form (which clears all).
- Each list row added or modified by a patch is highlighted the same
  way; a removed row leaves a "removed by AI" placeholder until the
  user accepts (deletes it for good) or rejects (re-inserts it). For
  v1 the placeholder is shown inline with an Undo button.
- AI patches **never** persist on their own. The user must click Save
  for the form to write to the database.
- The user can chain multiple patches in a single conversation; each
  patch stacks on top of the previous form state. Highlights persist
  across patches.

## System actions

System actions are special inline UI elements rendered in the chat
transcript between the model's text turns. They are not free-text
buttons the model invents — each comes from a registered tool that
returns an action descriptor. Initial set:

- **Open the "new recipe" form pre-filled** — implemented via the
  `open_new_recipe_form` client tool, available from any page. When the
  conversation has converged on a recipe the user wants to add, the
  model calls the tool with the structured recipe. The chat sidebar
  stashes the draft under a freshly generated id in `sessionStorage`
  (key: `wewh.newRecipeDraft.<id>`) and routes to
  `/recipes/new?draft=<id>`. The new-recipe page reads the id, loads
  the draft, renders the form pre-filled, and clears the stash. **The
  form never saves automatically — the user reviews and clicks Save.**
  Multiple drafts can coexist (each chat → new id), so opening
  several pre-filled tabs in parallel works.
- **"Apply N changes"** — implicit on detail pages: when the model
  calls a `patch_*` tool, the patch is applied immediately and the
  affected fields are highlighted. There is no separate confirm step
  in v1 (the highlight + manual save acts as the confirmation).

## Entity links in chat replies

When the AI mentions a recipe or ingredient that exists in the
catalog, it emits a markdown link to the corresponding detail page
(`/recipes/<id>` or `/ingredients/<id>`). The sidebar renders those
as Next.js client-side links so clicking them navigates without a
full reload. Entity links replace bare names; the model never invents
links to entities it has not first fetched via the read tools.

## Live updates after writes

When a server-write tool succeeds (rating set/clear, recipe update,
ingredient update or delete), the affected page paths are revalidated
on the server (`revalidatePath` against `/recipes`,
`/recipes/<id>`, `/ingredients`, `/ingredients/<id>` as relevant) and
the chat sidebar triggers a client-side soft refresh
(`router.refresh()`). The user sees the new data reflected in the list
or detail view they are already on without having to navigate or
reload — for example, the ratings chip on `/recipes` updates the
moment the chat finishes setting a rating. Client-side form-patch
tools (`patch_recipe_form`, `patch_ingredient_form`) do not trigger a
refresh because they only mutate React form state, not the database.

## Tools

See `specs/tech/02_llm.md` for the tool catalog. Tools are grouped:

- **Read tools** (server-side, available on every page): catalog
  search and detail lookups, ratings.
- **Server-side write tools** (scoped to the current user, two-step
  confirmation): `set_my_rating`, `clear_my_rating`, `update_recipe`,
  `update_ingredient`, `delete_ingredient`. Each takes a
  `confirmed: boolean` arg — the first call returns a *would-do*
  summary, the chat renders it in plain text, and only after the
  user explicitly approves does the model call again with
  `confirmed: true` to perform the write.
- **Form-patch tools** (client-side, available only on detail
  pages): `patch_recipe_form`, `patch_ingredient_form`. These run in
  the browser against the open form's React state and rely on the
  yellow change-highlight + manual Save as their confirmation step
  (no `confirmed` arg needed).

## What got removed

- The standalone single-shot LLM import page (`/recipes/import/llm`)
  and the standalone chat import page (`/recipes/import/llm/chat`)
  are removed. New recipes via AI now go through the persistent chat.
- The "Refine with AI" panel on the recipe form is removed.
  Refinement now happens through the persistent chat on the same
  page.
- The `synthesizeRecipe` operation is no longer used; only
  `synthesizeRecipeFromMessages` and `chatAboutRecipe` remain.

## Open questions

- **Cross-page persistence**: keeping the conversation when navigating
  from list → detail → list would be useful, especially when iterating
  on a recipe under discussion. Requires moving chat state from the
  page-level hook into a tab-scoped store. Deferred.
- **Ingredient creation via chat**: like "Save as new recipe" but for
  ingredients. Deferred until the form-patch flow proves out for
  edits.
- **Persisting transcripts** beyond the tab lifetime. Out of scope.
- **Cancellation UX** when streaming or applying patches mid-flight.
  The current Stop button on the chat input handles streaming; aborting
  a patch is undefined — the patch either fully applies or fails.
- **Multi-user collaboration**: two cooks in the same recipe at once.
  Out of scope.
