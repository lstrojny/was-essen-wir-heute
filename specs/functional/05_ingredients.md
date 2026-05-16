# Ingredients

The **central ingredient list** is the canonical catalog of ingredients used
across recipes. It exists to:

- normalize ingredient names (so "scallion" and "spring onion" resolve to the
  same entry),
- carry the **role tag** that drives main-ingredient derivation (see
  `01_recipes.md`),
- carry the **unit-conversion data** needed to compare amounts across units.

## Central ingredient entry

Each entry has:

- **Canonical name** — one per supported language (e.g. `de:
  "Frühlingszwiebel"`, `en: "spring onion"`). The active language picks which
  canonical is displayed; a missing canonical falls back to the other
  language and is marked as untranslated. See `06_i18n.md`.
- **Aliases** — single, language-agnostic list of alternate names that
  resolve to this entry during matching (e.g. "scallion", "green onion",
  "Lauchzwiebel"). Aliases are matching-only and never shown as the display
  name. The list may mix languages, which is what enables cross-language
  matching.
- **Role** — one of `starch`, `vegetable`, `protein`, or `none`.
- **Conversion data** — see *Units and conversion* below. Optional.
- **Notes** — optional free-text (e.g. seasonality, regional variants).

## Roles

Three roles feed main-ingredient derivation (see `01_recipes.md`):

- **starch** — potato, rice, pasta, bread, ...
- **vegetable** — broccoli, spinach, onion, ...
- **protein** — chicken, beef, lentils, tofu, eggs, ...

Anything else (salt, oil, herbs, spices, dairy used in small amounts, sugar,
...) takes role `none` and is ignored during main-ingredient derivation. Edge
cases (cheese in a cheese-heavy dish, eggs in a quiche) are decided by the
user when tagging the entry.

## Linking recipe ingredients to the central list

A recipe's ingredient row stores the structured triple *amount, unit,
name* (see `01_recipes.md`). The *name* is free text but the UI suggests
matches from the central list as the user types. A matched row is **linked**
to its central entry; the link is what makes the role and conversion data
available.

A row may remain **unlinked** (free-text name with no central match).
Unlinked ingredients display correctly but are ignored for main-ingredient
derivation and for any feature that depends on the catalog (future shopping
list, ingredient-based search, etc.).

### Naming convention

The ingredient *name* is the bare canonical noun. Qualifiers describing
form, preparation, sourcing, or size are **dropped** from the name and,
where relevant, moved into the recipe's step text instead.

- Drop **form/state**: fresh, dried, frozen, raw, cooked.
- Drop **preparation**: minced, chopped, diced, sliced, grated, peeled,
  crushed.
- Drop **sourcing/quality**: organic, free-range, extra-virgin, premium.
- Drop **size**: large, small, medium.
- **Keep** qualifiers that change the substance: `ground beef` ≠ `beef`
  (different cut); `coconut milk` ≠ `coconut` (different product);
  compound names like `soy sauce` are single nouns.
- Use the **plural form** for countable nouns: the canonical name is
  `Eier` not `Ei`, `Zwiebeln` not `Zwiebel`, `Tomaten` not `Tomate`,
  `Knoblauchzehen` not `Knoblauchzehe`, `Onions` not `Onion`,
  `Tomatoes` not `Tomato`. This matches how cooks write ingredient
  lists naturally (`5 Eier`, not `5 Stück Ei`). Mass nouns and
  uncountables stay in their natural form (`Mehl`, `Milch`, `Salz`,
  `Zucker`, `Flour`, `Salt`).

Examples: "Fresh parsley, minced" → name `Parsley`; "1 large yellow
onion, finely chopped" → name `Onion`, amount `1`, unit `piece`;
"Extra-virgin olive oil" → name `Olive oil`. Imports (Spoonacular, LLM
chat) and the manual-entry UI all follow this convention; this keeps
catalog matching reliable.

On import:

- **Spoonacular**: the enrichment LLM proposes a central-list match for each
  ingredient row; the preview shows the suggestion and the user confirms or
  overrides. See `04_imports.md`.
- **LLM chat**: matching runs in the preview UI as part of the same review
  step.

## Growing the central list

The list grows organically:

- The user can add an entry directly from a **"manage ingredients" surface**.
  The surface is available to any authenticated user; managing the catalog
  is not admin-only.
- When a recipe is saved, any ingredient row with a free-text name and no
  central link is **silently auto-linked or auto-created**:
  - First, a case-insensitive match is attempted against every central
    entry's canonical name (in both languages) and aliases. If anything
    matches, the recipe row is linked to that entry.
  - Otherwise a new central entry is created with the typed name as the
    canonical in the user's active language (the other language stays
    empty and shows the "untranslated" badge), role `none`, no
    conversion data. The user refines role / density / per-unit-mass
    later in the "manage ingredients" surface.
  - This is atomic with the recipe save: if the save rolls back, the
    new central entries roll back too.

Aliases can be added later to merge duplicates discovered after the fact
(e.g. recognising that "scallion" rows should have been the same as "spring
onion").

## Units and conversion

A recipe ingredient amount uses one of three unit categories:

- **mass** — `g`, `kg`, `oz`, `lb`
- **volume** — `ml`, `l`, `tsp`, `tbsp`, `cup`
- **count** — `piece`, `clove`, `slice`, ... (open-ended)

Within a category, conversions are universal (1 kg = 1000 g, 1 cup ≈ 240 ml,
etc.) and live in the app, not on the ingredient entry.

**Cross-category** conversion is per-ingredient and lives on the central
entry:

- **Density** in grams per millilitre — converts volume to mass. Example:
  flour ≈ 0.55 g/ml, water = 1 g/ml, olive oil ≈ 0.92 g/ml.
- **Per-unit mass** — for count units, the typical mass of one unit.
  Example: one onion ≈ 150 g, one garlic clove ≈ 5 g, one slice of bread
  ≈ 30 g. An entry may define per-unit mass for more than one count unit
  if both are common.

Both density and per-unit mass are optional. If conversion data needed to
compare two rows is missing, those rows are simply skipped by features that
require comparison (main-ingredient derivation will not pick that row).

## Main-ingredient comparison procedure

For completeness, the procedure referenced by `01_recipes.md`:

1. Take the recipe's full ingredient list, including roll-up from
   components.
2. Keep only rows that are linked to a central entry whose role matches the
   role being derived.
3. Skip rows without a usable amount ("salt to taste") and rows whose unit
   cannot be converted to grams given the entry's conversion data.
4. Convert each remaining row's amount to grams.
5. The role's main ingredient is the row with the largest gram amount. If no
   row qualifies, the role is empty for this recipe.

## Open questions

- **Default density when missing**. Assuming ≈ 1 g/ml for volume rows with no
  density would handle most water-like ingredients but silently mis-rank
  oils and dry goods. Default position: do **not** assume; require explicit
  density.
- **Role auto-suggestion**. Whether the Spoonacular enrichment LLM also
  suggests a role + conversion data when creating a new central entry, or
  whether those fields are always filled by hand. Probably worth doing for
  ergonomics, deferred for now.
- **Amount ranges**. Recipes sometimes say "1–2 cloves". Out of scope for v1
  — the user picks one number when entering.
