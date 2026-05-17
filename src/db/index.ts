import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { foldForMatch } from '@/ingredients/name-match'
import * as schema from './schema'

const dbPath =
    process.env.DATABASE_PATH ?? join(process.cwd(), 'data', 'app.db')

mkdirSync(dirname(dbPath), { recursive: true })

const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle({ client: sqlite, schema })

migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle', 'migrations') })
repairFoldedValues()

/**
 * Recomputes the pre-computed `*_folded` columns whenever they drift from
 * `foldForMatch(source)`. The initial migration backfilled via SQLite's
 * ASCII-only `lower()`, so non-ASCII rows (umlauts, ß, diacritics) need a
 * one-time refresh; this also self-heals if the fold algorithm ever
 * changes. Runs once per process; catalog is family-sized so this is
 * cheap.
 */
function repairFoldedValues() {
    type IngredientRow = {
        id: string
        canonical_de: string | null
        canonical_en: string | null
        canonical_de_folded: string | null
        canonical_en_folded: string | null
    }
    const ingredientRows = sqlite
        .prepare(
            'SELECT id, canonical_de, canonical_en, canonical_de_folded, canonical_en_folded FROM ingredients',
        )
        .all() as IngredientRow[]
    const updateIngredient = sqlite.prepare(
        'UPDATE ingredients SET canonical_de_folded = ?, canonical_en_folded = ? WHERE id = ?',
    )
    let ingredientsFixed = 0
    for (const row of ingredientRows) {
        const de = row.canonical_de ? foldForMatch(row.canonical_de) : null
        const en = row.canonical_en ? foldForMatch(row.canonical_en) : null
        if (de !== row.canonical_de_folded || en !== row.canonical_en_folded) {
            updateIngredient.run(de, en, row.id)
            ingredientsFixed++
        }
    }

    type AliasRow = {
        id: string
        alias: string
        alias_folded: string | null
    }
    const aliasRows = sqlite
        .prepare('SELECT id, alias, alias_folded FROM ingredient_aliases')
        .all() as AliasRow[]
    const updateAlias = sqlite.prepare(
        'UPDATE ingredient_aliases SET alias_folded = ? WHERE id = ?',
    )
    let aliasesFixed = 0
    for (const row of aliasRows) {
        const folded = foldForMatch(row.alias)
        if (folded !== row.alias_folded) {
            updateAlias.run(folded, row.id)
            aliasesFixed++
        }
    }

    if (ingredientsFixed + aliasesFixed > 0) {
        // eslint-disable-next-line no-console
        console.log(
            `[db] repaired folded columns: ${ingredientsFixed} ingredients, ${aliasesFixed} aliases`,
        )
    }
}
