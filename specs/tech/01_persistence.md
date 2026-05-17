# Persistence

The app stores all of its state in a single **SQLite** database file on a
Docker volume. This file describes the storage choices that follow from
that and shapes the relational model implied by the functional specs.

## Database engine

- **SQLite** via the **`better-sqlite3`** Node driver: synchronous,
  in-process, well-suited to a single-server Next.js deployment with a
  small concurrent-user count.
- **WAL mode** is enabled on first open so read queries don't block on
  writes. SQLite remains single-writer, which is fine for a family-sized
  workload.
- `PRAGMA foreign_keys = ON` is set on every connection. Foreign-key
  enforcement is not the SQLite default and must be opted into.
- The database file lives at a path supplied via env var, on a Docker
  volume so it survives container restarts.

## Query layer

- **Drizzle ORM** for the typed query layer and schema declarations.
- **Drizzle Kit** for migrations. Migration files are checked into the
  repo; they are applied on container startup before the Next.js server
  accepts requests.
- All schema changes flow through migrations — never by ad-hoc
  edits to the schema declarations alone.

## Naming and conventions

- Table and column names are `snake_case`.
- Primary keys are **UUIDv7** strings stored as `TEXT`, named `id`, and
  generated **application-side** via the `uuid` package. UUIDv7 is chosen
  for its time-prefixed layout (better B-tree index locality on inserts
  than v4). One exception: `sessions.id` holds the SHA-256 hash of the
  session token, not a UUID — see `04_auth.md`.
- Foreign-key columns are `<referenced_table_singular>_id` and inherit
  the `TEXT` type of the referenced PK.
- At the TypeScript layer, each table's PK has a **branded string type**
  (`UserId`, `IngredientId`, `SessionId`, etc.) wired through Drizzle's
  `$type<T>()`. The brands are nominal — a `UserId` is not interchangeable
  with an `IngredientId` even though both are strings at runtime. IDs
  arriving from FormData or URL params are validated and re-branded at
  the boundary via per-type `parse*` helpers in `src/db/ids.ts`.
- Every table has `created_at` and `updated_at` timestamps. Timestamps
  are stored as **integer Unix epoch milliseconds** (`INTEGER`) in UTC.
  Drizzle's `integer({ mode: "timestamp_ms" })` maps these to JS `Date`.
  The same encoding is used for every timestamp column across all tables
  (`expires_at`, `last_used_at`, etc.).

## Schema (logical view)

The schema reflects the functional specs. Listed below as logical tables;
exact column names and types are settled at implementation.

- **users** — one row per family member. Holds login credentials (see
  `04_auth.md`).
- **translated_strings** — central table holding per-locale strings.
  Columns: `id` (TEXT — a *group id*, not unique on its own),
  `locale` (`de` | `en`), `string` (TEXT NOT NULL), `string_folded`
  (TEXT — the NFC + de-locale lower-case + German digraph + diacritic-
  stripped fold; populated for every row so a single btree index covers
  name-equality lookups across every consumer). PK is `(id, locale)`.
  The `id` groups locale variants of the same logical string. Absence
  of a row for a locale means "no translation in that locale" — there
  is no NULL-text state. App-side helpers mint a group id and insert
  one row per locale present. Folded values are written from JS on
  every insert/update so the algorithm matches across source and index;
  a startup hook reconciles drift.
- **recipes** — one row per recipe. Holds language-independent fields:
  active time, wait time, source kind + source identifier, cuisine key
  (FK to `cuisines`), `is_complete_meal` (INTEGER 0/1, default `0`).
  Translatable title and notes are reached through `recipes_translated`
  — see *Per-language storage*.
- **recipes_translated** — join from a recipe to its translatable
  strings. Columns: `recipe_id` (FK → `recipes(id)` ON DELETE CASCADE),
  `unit_code` (`'title'` | `'notes'`), `translated_string_id` (group id
  referencing `translated_strings.id`). PK is `(recipe_id, unit_code)`
  — a recipe has at most one title group and one notes group.
- **recipe_steps** — ordered list per recipe. The row carries the
  position only; translatable step text is reached through
  `recipe_steps_translated`.
- **recipe_steps_translated** — join from a step to its translatable
  text. Columns: `recipe_step_id` (FK → `recipe_steps(id)` ON DELETE
  CASCADE), `unit_code` (`'text'`), `translated_string_id` (group id
  referencing `translated_strings.id`). PK is
  `(recipe_step_id, unit_code)`. The `unit_code` is structurally
  singular today but kept for shape consistency with the other
  `*_translated` tables.
- **recipe_ingredients** — ordered list per recipe. Each row holds amount
  (REAL), unit (string), free-text name (string), and a nullable FK
  `ingredient_id` to `ingredients` for the linked row. Order is
  preserved by a position column.
- **recipe_components** — ordered references from a composite recipe to
  its component recipes. Columns: `parent_recipe_id`, `child_recipe_id`,
  position. Both FKs reference `recipes(id)`. Cycles are forbidden — see
  *Composition cycle detection*.
- **recipe_ratings** — `(recipe_id, user_id)` unique; score 1–5 stored
  as `INTEGER`. Rows cascade-delete with the parent recipe and with the
  user. The aggregate (average + count) used by list and detail views
  is computed by a per-recipe `GROUP BY` over this table, joined onto
  the recipe row at read time (not denormalized).
- **ingredients** — one row per ingredient catalog entry. Language-
  independent fields: role (enum: `starch`, `vegetable`, `protein`,
  `none`), optional density (g/ml), notes. Canonical name and aliases
  are reached through `ingredients_translated` and `ingredients_aliases`
  respectively — see *Per-language storage*. (Table renamed from
  `central_ingredients` in migration 0005.)
- **ingredients_translated** — join from an ingredient to its canonical
  string group. Columns: `ingredient_id` (FK → `ingredients(id)`
  ON DELETE CASCADE), `unit_code` (`'canonical'`),
  `translated_string_id` (group id referencing `translated_strings.id`).
  PK is `(ingredient_id, unit_code)`.
- **ingredients_aliases** — many rows per ingredient, one per *alias
  group*. Columns: `id` (PK), `ingredient_id` (FK → `ingredients(id)`
  ON DELETE CASCADE), `translated_string_id` (group id referencing
  `translated_strings.id`). Each alias group has one or two locale
  variants in `translated_strings`; matching searches across all
  variants (see `specs/functional/06_i18n.md`). DB-level enforcement
  of the global folded-uniqueness rule against canonicals lives in
  `ingredient_lookup_folded`. (Renamed from `ingredient_aliases` to
  match the `*_translated`/`*_aliases` naming used by the new model.)
- **ingredient_lookup_folded** — shadow table that gives DB-level
  enforcement of the alias-and-canonical global folded-uniqueness rule.
  One row per `translated_strings` row reachable from either
  `ingredients_translated` with `unit_code = 'canonical'` or
  `ingredients_aliases`. Columns: `string_folded` (TEXT, UNIQUE),
  `kind` (`'canonical'` | `'alias'`), `ingredient_id` (FK →
  `ingredients(id)` ON DELETE CASCADE), `translated_string_id`,
  `locale`. The app maintains this table on every insert / update /
  delete of source rows on the canonical or alias paths. A startup
  hook reconciles drift by rebuilding the shadow from the source rows,
  same role the previous `canonical_*_folded` repair served.
- **ingredient_count_units** — many rows per ingredient, holding a
  count unit name (e.g. `piece`, `clove`) and its grams-per-unit
  (REAL). An entry may have zero or more. The unit name is **unique
  within an entry** (case-insensitive). Rows cascade-delete with the
  parent entry. FK column is `ingredient_id`.
- **recipe_ingredients** carries `ingredient_id` (was
  `central_ingredient_id`) referencing `ingredients(id)`.
- **cuisines** — controlled vocabulary. Columns: cuisine key (PK string).
  Display labels are reached through `cuisines_translated`. **Seeded**
  in the recipes migration with a v1 starter set (`italian`, `thai`,
  `german`, `french`, `mexican`, `indian`, `american`, `mediterranean`,
  `japanese`, `chinese`, `greek`, `spanish`, `middle-eastern`,
  `vietnamese`, `other`); the seed also inserts a `translated_strings`
  group with `de` and `en` rows for each label and the matching
  `cuisines_translated` join row. Additional cuisines added in
  follow-up migrations: `korean`. New cuisines are added by appending
  to a follow-up migration; no in-app cuisine-management surface in v1.
- **cuisines_translated** — join from a cuisine key to its label string
  group. Columns: `cuisine_key` (FK → `cuisines(key)` ON DELETE
  CASCADE), `unit_code` (`'label'`), `translated_string_id` (group id
  referencing `translated_strings.id`). PK is
  `(cuisine_key, unit_code)`.
- **sessions** — server-side sessions for authenticated users. See
  `04_auth.md` for the column shape.
- **spoonacular_cache** — cached Spoonacular API responses keyed by
  request URL (API key excluded). See `03_external_apis.md`.
- **spoonacular_quota** — single-row table tracking remaining Spoonacular
  quota. See `03_external_apis.md`.

## Per-language storage

Per-language text uses a **central translation table** with per-parent
join tables that point into it.

- `translated_strings (id, locale, string, string_folded)` — central.
  PK is `(id, locale)`. The `id` is a group id, not unique on its own
  — it groups the locale variants of one logical string. Absence of a
  row for a locale means "no translation in that locale". There is no
  NULL-text state.
- Per-parent join tables map `(parent_row, unit_code) → translated_string_group`:
  - `recipes_translated` — `unit_code ∈ ('title', 'notes')`,
    PK `(recipe_id, unit_code)`.
  - `recipe_steps_translated` — `unit_code = 'text'`,
    PK `(recipe_step_id, unit_code)`.
  - `ingredients_translated` — `unit_code = 'canonical'`,
    PK `(ingredient_id, unit_code)`. Aliases are *not* in this table —
    they have many-per-ingredient cardinality with no slot name and
    live in `ingredients_aliases` (which points into the same
    `translated_strings`).
  - `cuisines_translated` — `unit_code = 'label'`,
    PK `(cuisine_key, unit_code)`.

Each join table holds a real FK to its parent (with `ON DELETE
CASCADE`) and references a `translated_strings` group through the
group id. SQLite cannot cascade-delete in the join → group direction
because `translated_strings.id` is not a single-row PK; orphaned
groups are cleaned up in app code on the same write path that removes
the join row.

Reasons for this shape over per-language columns:

- Adding a third locale is a code change (extend the `locale` enum and
  the resolver's supported set; see `05_i18n.md`), not a schema
  migration.
- Name-equality and search lookups use one btree index on
  `translated_strings.string_folded` covering every consumer × locale,
  instead of one `canonical_<locale>_folded` index per locale per
  parent table.
- "Missing translation" is the absence of a row, not a NULL on a
  column. The fallback resolver reads both locales for the referenced
  group, picks the preferred, and marks the displayed text as a
  fallback when the preferred locale's row is missing.

Costs accepted:

- Detail reads fan out: parent row + an `IN`-list against
  `translated_strings` for every referenced group id. Hot list views
  compose this as a single `LEFT JOIN translated_strings` per active
  locale through the parent's `*_translated` table.
- The alias-vs-canonical global folded-uniqueness rule still cuts
  across two tables (`ingredients_translated` filtered to
  `unit_code = 'canonical'` and `ingredients_aliases`). DB-level
  enforcement is provided by the `ingredient_lookup_folded` shadow
  table; the app maintains it on every write to either source.

## Composition cycle detection

The `recipe_components` table has no native cycle check in SQLite.
Before any insert or update that adds or changes a component reference,
the application walks the descendant graph of the candidate child and
verifies the parent does not appear. Walks are short in practice (the
graph is small and tree-shaped); cycles are reported as a validation
error and the write is refused. A recipe referencing itself directly
as a component is the trivial cycle case and is also rejected.

## Deleting a recipe used as a component

The `recipe_components.child_recipe_id` foreign key is declared
`ON DELETE RESTRICT`, so the database refuses to delete a recipe that
is referenced by any composite. The application layer translates this
into a friendly error that lists the referencing composites by their
display title (in the active language, with the standard fallback to
the other language when missing). The user is asked to remove those
component references first; deletion is otherwise refused.

## Search

Cross-language search over recipe titles, ingredient names, and aliases
is needed once `02_meal_plan.md` and `03_tonights_dinner.md` exist.
SQLite's **FTS5** module is the planned implementation: a shadow FTS
table indexed off `translated_strings`, populated by triggers, joined
back through the `*_translated` and `ingredients_aliases` tables to
locate the owning entity. Detailed search behaviour is deferred until
those functional specs land.

## Deletion

Recipe deletion semantics are an open question in `01_recipes.md`. Until
that is resolved, deletes are **hard** but constrained by foreign keys:
deleting a recipe that is referenced by `recipe_components` or by a
meal-plan entry (future) is rejected.

## Open questions

- **JSON columns** for any field. None used in v1 — every list-valued
  attribute uses a child table. Revisit only if a list-valued field
  proves not to need indexing or querying.
- **Soft delete**. Deferred with the recipe deletion question.
- **Backups**. Belongs in a future ops note (mentioned in `00_stack.md`).
- **Schema for the LLM chat transcript**. Out of scope until the
  `04_imports.md` open question on transcript persistence is decided.
