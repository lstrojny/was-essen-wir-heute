/**
 * Test-side helpers for the SQLite database.
 *
 * The production singleton in `src/db/index.ts` opens an in-memory database
 * when `DATABASE_PATH=:memory:`, which is set in `vitest.config.ts`. Each
 * Vitest worker therefore gets its own fresh, migrated database; tests in
 * the same file share that database.
 *
 * Use `resetDb()` between tests to wipe user-managed rows while keeping the
 * migration-seeded reference data (cuisines and their translated labels).
 */
import { sql } from 'drizzle-orm'
import { db } from '@/db'

const USER_DATA_TABLES = [
    // Children before parents — FKs are ON.
    'recipe_components',
    'recipe_ratings',
    'recipe_ingredients',
    'recipe_steps_translated',
    'recipe_steps',
    'recipes_translated',
    'recipes',
    'meal_plan_entries',
    'ingredient_lookup_folded',
    'ingredients_aliases',
    'ingredients_translated',
    'ingredient_count_units',
    'ingredients',
    'sessions',
    'users',
    'spoonacular_cache',
    'spoonacular_quota',
] as const

/**
 * Wipe every user-managed table. Reference tables seeded by migrations
 * (cuisines, cuisines_translated, the translated_strings rows that back
 * cuisine labels, meal_plan_settings, spoonacular_quota) are left intact —
 * those are part of the "shipped" DB state and tests can assume them.
 */
export function resetDb(): void {
    db.run(sql`PRAGMA foreign_keys = OFF`)
    for (const table of USER_DATA_TABLES) {
        db.run(sql.raw(`DELETE FROM ${table}`))
    }
    db.run(sql`
        DELETE FROM translated_strings
        WHERE id NOT IN (
            SELECT translated_string_id FROM cuisines_translated
        )
    `)
    db.run(sql`PRAGMA foreign_keys = ON`)
}
