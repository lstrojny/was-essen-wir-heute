# Recipes

Recipes are the core entity of the app. Everything else (meal planning, tonight's
dinner, imports) exists to help choose, organize, or create them.

## Recipe data

Every recipe has:

- **Title** — short human-readable name. *(Per language — see `06_i18n.md`.)*
- **Cuisine** — single value, stored as a language-independent key from a
  controlled vocabulary (e.g. `italian`, `thai`, `german`). Display labels
  are translated. See `06_i18n.md`.
- **Active time** and **wait time** — separate durations in minutes. Active
  time is hands-on cooking and prep. Wait time is passive (soaking, marinating,
  resting, dough proofing, chilling overnight). Wait time is optional and
  zero for most recipes; total time is the sum and is not stored.
  - For composites these fields hold the **composite's own** active/wait
    time only (plating, finishing, a quick pan sauce — work not done by
    any component). The displayed total (sum / max across components,
    see *Composition*) is what the cook reads.
  - The recipe edit form shows the computed total live, just below the
    own-time inputs, so the cook can see what each component
    contributes while editing. The total updates as components are
    added or removed.
- **Ingredients** — ordered list. Each entry is a structured triple of
  *amount*, *unit*, and *ingredient name* (e.g. `50`, `g`, `flour`). Amounts
  are stored **normalized per single serving**. An entry may omit amount/unit
  for things like "salt to taste".
  - In the background a central list of ingredients is managed for normalization and deduplication
  - The ingredient name is free text for flexibility, but the UI encourages picking from the central list when possible.
- **Components** — optional, ordered list of references to other recipes
  ("steak with mashed potatoes" references the steak and mashed-potatoes
  recipes). A recipe with at least one component is a *composite*. See
  *Composition* below.
- **Steps** — ordered list of free-text instructions, one step per list item.
  A composite may have its own steps in addition to those of its components
  (e.g. plating, a quick pan sauce); they may also be empty if the
  components fully describe the work. *(Step text is per language; the list
  length and order are shared across languages — see `06_i18n.md`.)*
- **Ratings** — per family member; see below.
- **Source** — how the recipe entered the app: `manual`, `spoonacular`, or
  `llm-chat`. For imported recipes, the original identifier or URL is retained.
  See `04_imports.md`.
- **Notes** — optional free-text field for the cook (substitutions, warnings,
  "double the garlic"). *(Per language — see `06_i18n.md`.)*
- **Complete-meal flag** — boolean that marks whether the recipe stands as
  a full meal on its own. A stew with protein + starch + vegetables is
  complete; a side of mashed potatoes, a sauce, or a dressing is not.
  Default is **false** (most entries in a growing catalog are
  components and sides; the cook explicitly flags the ones that work
  as standalone meals). The flag drives:
  - Visual marking: a green "Vollständige Mahlzeit" / "Complete meal"
    chip is shown on the recipe list and detail when the flag is true;
    nothing is shown when it's false.
  - List filter: the `/recipes` list has a "Nur vollständige Mahlzeiten"
    toggle that filters the list to true-only.
  - Future meal planning (out of scope here): the planner will offer
    complete meals as the main slot, with optional sides picked from
    non-complete recipes.

A recipe has **no fixed serving size**. See *Serving size* below.

## Main ingredients

Main ingredients are **derived**, not stored. Three roles are recognized:
**starch**, **vegetable**, and **protein**. They are used for filtering and
for variety heuristics in meal planning.

Each ingredient in the central ingredient list carries a role tag (`starch`,
`vegetable`, `protein`, or none) — see `05_ingredients.md`. Free-text
ingredients that are not linked to the central list have no role and are
ignored for derivation.

For each role, the recipe's main ingredient is the **single ingredient in
that role with the largest amount** in the recipe's full ingredient list
(composite roll-up included; see *Composition*). If no ingredient in the
recipe has a given role, that role is empty for this recipe ("a soup has
no starch; a salad has no protein").

Comparing amounts across different units is necessary (e.g. `200 g spinach`
vs. `2 pieces onion`). The central ingredient list provides the conversion
data needed; the rules belong in `05_ingredients.md`. Ingredients without
a usable amount (e.g. "salt to taste") are ignored for derivation.

## Composition

A composite recipe references one or more other recipes as components and
otherwise behaves like any recipe. Components are references, not copies:
editing the *mashed potatoes* recipe changes every composite that uses it.
That is the point of composition; the user can *copy* a recipe first when
they want a one-off variant.

When a composite is displayed, the following fields are **rolled up** from
its components and the composite's own data:

- **Ingredients**: union of the composite's own ingredients and each
  component's ingredients. The display groups ingredients by their source
  recipe so the cook can read them in context. (Merging duplicates into a
  single shopping-list view is a separate concern — see future meal-plan
  spec.)
- **Active time**: **sum** of the composite's own active time and each
  component's active time. Active work is treated as serial in elapsed
  terms.
- **Wait time**: **max** of the composite's own wait time and each
  component's wait time. Waits run in parallel (the steak rests while the
  potatoes finish).
- **Steps**: each component's steps are shown as a labelled sub-section
  under the component's title, followed by the composite's own steps. The
  composite does not interleave or re-order the components' steps.
- **Main ingredients**: derived per *Main ingredients* above, over the
  rolled-up ingredient list. Components contribute their ingredients but
  not their derived main-ingredient values.

Composition can nest: a component may itself be a composite. Cycles are
forbidden; how cycles are detected is a tech-spec concern.

Other recipe data (title, cuisine, ratings, notes, source) belong to the
composite itself and are not rolled up.

## Serving size

- Ingredient amounts on a recipe are always stored as the amount **for one
  serving**.
- The app has an application-level **default serving size** (a positive
  integer, configurable in settings). The v1 default is **2**; a
  settings surface to change it lands with later phases.
- When viewing a recipe, the user sees ingredient amounts scaled to a chosen
  serving count. The chosen count starts at the app default and can be changed
  on the fly for the current view.
- The recipe form has an **"amounts for N servings"** field (defaulting to
  the app default) so the cook can enter the amounts in their natural
  scale instead of doing per-serving math by hand. On save the entered
  amounts are divided by N before being stored, keeping the per-1-serving
  invariant intact.
- Changing N alone does **not** rescale the displayed amounts — it just
  re-labels them as "for the new N". On save, the per-1-serving value
  effectively changes (amount / new N). This is the right action when
  the cook wants to **adjust portion size**: leaving the amounts but
  saying "this is for fewer servings" makes each serving bigger, and
  vice versa.
- An explicit **Apply** action (a button next to the field) does the
  proportional rescale instead: when the cook wants to **scale the
  recipe up or down** while keeping per-serving constant, they change N,
  click Apply, and every amount input scales by `new / previous-applied`.
  Apply is disabled when N matches the last applied value.
- When importing a recipe that is expressed for *N* servings, amounts are
  divided by *N* at import time so storage stays normalized.

## Actions

- **Create** a recipe from scratch. Amounts are entered per serving.
- **Update** any field of an existing recipe.
- **Copy** an existing recipe to produce a new, independent recipe pre-filled
  with the original's data. Used to create variants ("kid-friendly version")
  without losing the original. The copy has its own ratings, starting empty.
  When copying a composite, the copy's components are the **same references**
  as the original — components are not deep-copied. The user can copy a
  component separately if they need an independent variant of it.
- **Delete** a recipe. Effect on past meal plans is an open question — see
  `02_meal_plan.md`.
- **Rate** — see below.
- **Modify via AI chat**. Recipe modifications happen through the
  persistent AI chat (see `07_ai_chat.md`), not a dedicated panel.
  The user describes a change in natural language ("make this
  vegetarian", "halve the salt", "use chicken thighs instead of
  breast"); the chat applies a structured patch to the open recipe
  form. Changed scalar fields and changed ingredient/step rows are
  visually highlighted so the user can review the AI's diff before
  saving. Editing a highlighted field clears its highlight. The user
  saves explicitly — AI changes never persist on their own.

## Ratings

- Each rating is given by a user account; see `specs/tech/04_auth.md` for
  the user/account model. Any authenticated, non-disabled user may rate
  any recipe — there is no separate "family member" role.
- Each family member can give the recipe an **integer** score from **1
  to 5**. Half scores are not supported.
- A rating from a given family member is optional; absence means "not yet
  rated", not zero.
- The recipe displays both individual scores per family member and an
  aggregate. The aggregate is the **average of the scores that have been
  given**, ignoring missing ones. The displayed average is rounded to
  **one decimal place** using the active language's number format (comma
  in `de`, dot in `en`); the rating count is displayed alongside it.
- When no rating exists yet, the aggregate area shows a "not yet rated"
  placeholder instead of a zero.

### Rating UI

- **Combined widget**. A single per-recipe control toggles between two
  states based on user interaction:
  - **Idle, no own rating yet** — shows 5 empty interactive stars
    inviting the user to rate. This is the only state where the
    aggregate is *not* visible inline (since there is none to show
    when the user is also the first rater); when other users have
    rated, the aggregate is shown next to the empty stars as a
    secondary read-only display.
  - **Idle, user has rated** — shows the aggregate (filled star row
    proportional to the average, followed by the numeric average and
    rating count, e.g. `★★★★☆ 4.3 (3)`).
  - **Hover** — regardless of whether the user has rated, the widget
    swaps to interactive 5-star input. The user's current rating is
    highlighted; hovering a star previews the new value. Clicking a
    star sets it. Clicking the *currently selected* star clears the
    rating.
- The widget appears identically on the recipe **list** (one per row)
  and on the recipe **detail** page. On detail, individual scores of
  other users are listed read-only below the widget (display name +
  star row).
- **Optimistic updates**: rating actions update the local view
  immediately and reconcile with the server response. Failures revert
  and surface an inline error. The aggregate is updated on the next
  server render after revalidation; transient mismatch between own
  rating and aggregate is accepted.

## Open questions

- **Photos.** Not in v1. Revisit once imports exist (Spoonacular returns image
  URLs).
- **Tags beyond cuisine.** E.g. "vegetarian", "quick", "kid-friendly". Likely
  needed for meal planning filters — decide when authoring `02_meal_plan.md`.
- **Ingredient identity.** Right now an ingredient is a free-text name. Whether
  ingredients are normalized into a shared catalog (so "scallion" and "spring
  onion" deduplicate) is deferred to `05_ingredients.md`.
- **Deletion semantics.** Hard delete vs. archive, and what happens to past
  meal plans that reference the recipe.
- **Default serving size scope.** Currently app-level (see *Serving size*);
  per-user override might fit a household where different cooks have
  different defaults.
