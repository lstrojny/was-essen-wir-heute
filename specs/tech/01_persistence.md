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
- **recipes** — one row per recipe. Holds language-independent fields:
  active time, wait time, source kind + source identifier, cuisine key
  (FK to `cuisines`). Per-language text columns live on this row — see
  *Per-language storage*.
- **recipe_steps** — ordered list per recipe. The row carries the position
  and **per-language text columns** (`text_de`, `text_en`).
- **recipe_ingredients** — ordered list per recipe. Each row holds amount
  (REAL), unit (string), free-text name (string), and a nullable FK to
  `central_ingredients` for the linked row. Order is preserved by a
  position column.
- **recipe_components** — ordered references from a composite recipe to
  its component recipes. Columns: `parent_recipe_id`, `child_recipe_id`,
  position. Both FKs reference `recipes(id)`. Cycles are forbidden — see
  *Composition cycle detection*.
- **recipe_ratings** — `(recipe_id, user_id)` unique; score 1–5.
- **central_ingredients** — one row per central entry. Language-
  independent fields: role (enum: `starch`, `vegetable`, `protein`,
  `none`), optional density (g/ml), notes. Per-language canonicals live
  on this row as separate columns (see below).
- **central_ingredient_aliases** — many rows per central entry, holding a
  single alias string. Aliases are matching-only and language-agnostic
  (no language column). An alias is **unique within an entry**
  (case-insensitive); the same alias string may legitimately appear under
  different entries and is not globally unique. Rows cascade-delete with
  the parent entry.
- **central_ingredient_count_units** — many rows per central entry,
  holding a count unit name (e.g. `piece`, `clove`) and its grams-per-unit
  (REAL). An entry may have zero or more. The unit name is **unique
  within an entry** (case-insensitive). Rows cascade-delete with the
  parent entry.
- **cuisines** — controlled vocabulary. Columns: cuisine key (PK string),
  `label_de`, `label_en`. **Seeded** in the recipes migration with a
  v1 starter set (`italian`, `thai`, `german`, `french`, `mexican`,
  `indian`, `american`, `mediterranean`, `japanese`, `chinese`, `greek`,
  `spanish`, `middle-eastern`, `vietnamese`, `other`). New cuisines are
  added by appending to a follow-up migration; no in-app cuisine-
  management surface in v1.
- **sessions** — server-side sessions for authenticated users. See
  `04_auth.md` for the column shape.
- **spoonacular_cache** — cached Spoonacular API responses keyed by
  request URL (API key excluded). See `03_external_apis.md`.
- **spoonacular_quota** — single-row table tracking remaining Spoonacular
  quota. See `03_external_apis.md`.

## Per-language storage

Per-language text fields use **separate columns per language** rather than
a join table or a JSON blob:

- `recipes`: `title_de`, `title_en`, `notes_de`, `notes_en`
- `recipe_steps`: `text_de`, `text_en`
- `central_ingredients`: `canonical_de`, `canonical_en`
- `cuisines`: `label_de`, `label_en`

The two-language scope (see `06_i18n.md`) makes columns the simplest
option: every read is a single row, every search is a straight `OR`
between columns, no joins. The tradeoff is that adding a third language
later requires a schema migration. That is acceptable given the v1 scope.

## Composition cycle detection

The `recipe_components` table has no native cycle check in SQLite.
Before any insert or update that adds or changes a component reference,
the application walks the descendant graph of the candidate child and
verifies the parent does not appear. Walks are short in practice (the
graph is small and tree-shaped); cycles are reported as a validation
error and the write is refused.

## Search

Cross-language search over recipe titles, ingredient names, and aliases
is needed once `02_meal_plan.md` and `03_tonights_dinner.md` exist.
SQLite's **FTS5** module is the planned implementation: shadow FTS tables
indexed off the canonical tables (recipes, central_ingredients,
central_ingredient_aliases), populated by triggers. Detailed search
behaviour is deferred until those functional specs land.

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
