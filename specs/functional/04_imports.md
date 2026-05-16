# Imports

Recipes enter the app from three sources: manual creation (see `01_recipes.md`),
the **Spoonacular API**, and an **LLM chat**. Every non-manual import passes
through a shared preview/edit step before becoming a saved recipe, and every
imported recipe records its origin in the recipe's *Source* field.

## Common: preview and save

Imports never write directly to the library. After an import produces a
populated draft, the user is shown a **preview**: the full recipe as it would
be saved, with every field editable. The user either saves the draft (creating
a new recipe) or cancels (discarding it). A saved import is indistinguishable
from a manually-created recipe afterward, except for its *Source*.

In the preview, each ingredient row attempts to match the central ingredient
list (see `05_ingredients.md`). The user confirms the suggested match, picks a
different one, or keeps the free-text name.

## Spoonacular import

### Trigger

- **Search**: the user searches Spoonacular by recipe name from inside the
  app and picks a result to import.
- **Direct**: the user pastes a Spoonacular recipe URL or ID to import that
  specific recipe.

### Field mapping

From the Spoonacular recipe payload to our recipe model:

- **Title** ← `title`.
- **Cuisine** ← see *Enrichment*. Spoonacular's `cuisines` array is the input
  but not used directly.
- **Active time** ← `cookingMinutes + preparationMinutes` when both are
  present; otherwise `readyInMinutes`. May be reduced by *Enrichment*.
- **Wait time** ← `0` initially. Populated by *Enrichment*.
- **Ingredients** ← `extendedIngredients`, with each amount divided by the
  payload's `servings` so storage stays per single serving.
- **Steps** ← `analyzedInstructions`, flattened into a single ordered list of
  step texts.
- **Main ingredients** (starch / vegetable / protein) ← not stored;
  derived from the ingredient list once ingredients are linked to the
  central list. See `01_recipes.md` *Main ingredients*.
- **Notes** ← empty.
- **Source** ← `spoonacular`, with the original Spoonacular recipe ID
  retained.

### Enrichment

Before the preview is shown, the structured Spoonacular data is augmented by
a single LLM enrichment call. Enrichment is responsible for:

- **Wait-time extraction**: scan the instructions and ingredients for passive
  durations ("let rest 1 hour", "soak overnight", "refrigerate 8 hours") and
  return a wait time. The matched durations are subtracted from active time so
  the two do not double-count.
- **Cuisine selection**: pick a single cuisine, mapped to the controlled-
  vocab key (see `06_i18n.md`). Prefer `cuisines[0]` from the Spoonacular
  payload when present; otherwise propose one based on the recipe's
  content.
- **Ingredient-list matching**: for each ingredient name, suggest a match
  from the central ingredient list. Linking ingredients to the central
  list is what enables main-ingredient derivation downstream. When the
  match creates a new central entry, the enrichment LLM also proposes the
  canonical name for the language not present in the source data.
- **Translation**: translate title, notes, and each step text from the
  source language (English for Spoonacular) into the other supported
  language so the saved recipe is bilingual. See `06_i18n.md`.

All enrichment outputs are **suggestions**. The preview surfaces them as
pre-filled but clearly editable so the user can verify each one.

If the enrichment call fails or times out, the preview is shown with
un-enriched data (active time = total, wait time = 0, cuisine = empty,
ingredients = free-text and unlinked from the central list). The user can
fill or correct manually. Import does not fail because of enrichment.

## LLM chat import

Two phases are envisioned, built incrementally.

### Phase A — single-shot prompt (built)

The user describes the recipe they want in a single free-text prompt
("Schnelles Pad Thai für 4 Personen mit Tofu und Erdnüssen"). The LLM
returns a structured recipe covering the stored recipe fields (title,
cuisine key, active and wait time, ingredients at the user's intended
serving count, steps). Title, notes, and step texts are emitted in
**both supported languages**, regardless of which language the prompt
itself was in. Main ingredients are not emitted; they are derived after
ingredient-list matching.

The LLM operation underlying this is `synthesizeRecipe` in fresh mode
(see `specs/tech/02_llm.md`).

The call is **cancellable**: while the LLM is thinking the user sees a
Cancel button next to the spinning Generate; clicking it aborts the
in-flight request, so token billing stops. Cancellation is not an error
state.

The structured response populates the standard preview (see *Common*).
Every field is editable before saving. Ingredient-list matching runs as
the user reviews; unmatched names auto-link or auto-create per
`05_ingredients.md`.

### Phase B — multi-turn chat (deferred)

The user opens a chat with the LLM, converses freely (clarifying
questions, ideas, "make it lighter", "use chicken thighs"), and at the
end invokes a **"save this recipe"** action that triggers the same
structured-output emit. This is a UX expansion on top of Phase A and
shares the same underlying `synthesizeRecipe` operation.

### Field mapping

Because the LLM is instructed to produce structured output covering all
fields directly, there is no separate enrichment step for chat imports.
Ingredient-list matching still runs as part of the preview, since the
LLM may emit free-text ingredient names.

### Source

- **Source** ← `llm-chat`. The chat transcript (Phase B) is not retained
  alongside the saved recipe in v1 — see *Open questions*.

## Open questions

- **Search-by-ingredients** ("what's in my fridge"). Spoonacular supports it
  and it would feed `03_tonights_dinner.md`. Decide where it lives.
- **Chat transcript persistence**. Keeping the conversation attached to the
  recipe would allow re-prompting ("make this vegetarian", "halve the salt")
  but adds storage and UI. Out of scope for v1.
- **Duplicate detection**. Importing the same Spoonacular recipe twice (or
  a chat recipe very similar to an existing one) currently creates two
  separate entries.
