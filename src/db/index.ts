import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { v7 as uuidv7 } from 'uuid'
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
rewriteLegacyTranslatedStringIds()
repairFoldedValues()
backfillIngredientLookupFoldedIfEmpty()

/**
 * Migration 0008 creates `ingredient_lookup_folded` empty; rebuild from
 * canonical and alias translated_strings on first boot if it's still empty.
 * On every subsequent canonical/alias write the per-ingredient rebuild
 * (`rebuildIngredientLookupFolded`) keeps it current.
 */
function backfillIngredientLookupFoldedIfEmpty() {
    const count = sqlite
        .prepare('SELECT COUNT(*) AS c FROM ingredient_lookup_folded')
        .get() as { c: number }
    if (count.c > 0) return
    type Row = {
        ingredient_id: string
        kind: 'canonical' | 'alias'
        translated_string_id: string
        locale: string
        string_folded: string
    }
    const canonicalRows = sqlite
        .prepare(
            `SELECT it.ingredient_id, 'canonical' AS kind,
                    it.translated_string_id, ts.locale, ts.string_folded
             FROM ingredients_translated it
             JOIN translated_strings ts
               ON ts.id = it.translated_string_id
             WHERE it.unit_code = 'canonical'`,
        )
        .all() as Row[]
    const aliasRows = sqlite
        .prepare(
            `SELECT ia.ingredient_id, 'alias' AS kind,
                    ia.translated_string_id, ts.locale, ts.string_folded
             FROM ingredients_aliases ia
             JOIN translated_strings ts
               ON ts.id = ia.translated_string_id`,
        )
        .all() as Row[]
    const insert = sqlite.prepare(
        `INSERT OR IGNORE INTO ingredient_lookup_folded
            (string_folded, kind, ingredient_id, translated_string_id, locale)
         VALUES (?, ?, ?, ?, ?)`,
    )
    const txn = sqlite.transaction((rows: Row[]) => {
        for (const r of rows) {
            insert.run(
                r.string_folded,
                r.kind,
                r.ingredient_id,
                r.translated_string_id,
                r.locale,
            )
        }
    })
    txn([...canonicalRows, ...aliasRows])
    // eslint-disable-next-line no-console
    console.log(
        `[db] backfilled ingredient_lookup_folded: ${canonicalRows.length} canonical + ${aliasRows.length} alias rows`,
    )
}

/**
 * Migration 0008 backfilled `translated_strings.id` with deterministic
 * `<parent_id>__<unit_code>` strings so the SQL was debuggable. New writes
 * mint UUIDv7 via `newTranslatedStringGroupId`. This hook rewrites any
 * legacy `__`-suffixed ids to fresh UUIDv7s on first boot, then becomes a
 * no-op. Updates every join table that references a group id.
 */
function rewriteLegacyTranslatedStringIds() {
    const legacy = sqlite
        .prepare(
            "SELECT DISTINCT id FROM translated_strings WHERE id LIKE '%\\_\\_%' ESCAPE '\\'",
        )
        .all() as { id: string }[]
    if (legacy.length === 0) return
    const update = (table: string, column: string) =>
        sqlite.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`)
    const stmts = {
        translated_strings: sqlite.prepare(
            'UPDATE translated_strings SET id = ? WHERE id = ?',
        ),
        recipes_translated: update(
            'recipes_translated',
            'translated_string_id',
        ),
        recipe_steps_translated: update(
            'recipe_steps_translated',
            'translated_string_id',
        ),
        ingredients_translated: update(
            'ingredients_translated',
            'translated_string_id',
        ),
        cuisines_translated: update(
            'cuisines_translated',
            'translated_string_id',
        ),
        ingredients_aliases: update(
            'ingredients_aliases',
            'translated_string_id',
        ),
        ingredient_lookup_folded: update(
            'ingredient_lookup_folded',
            'translated_string_id',
        ),
    }
    const rewrite = sqlite.transaction((rows: { id: string }[]) => {
        for (const { id: oldId } of rows) {
            const newId = uuidv7()
            stmts.translated_strings.run(newId, oldId)
            stmts.recipes_translated.run(newId, oldId)
            stmts.recipe_steps_translated.run(newId, oldId)
            stmts.ingredients_translated.run(newId, oldId)
            stmts.cuisines_translated.run(newId, oldId)
            stmts.ingredients_aliases.run(newId, oldId)
            stmts.ingredient_lookup_folded.run(newId, oldId)
        }
    })
    rewrite(legacy)
    // eslint-disable-next-line no-console
    console.log(
        `[db] rewrote ${legacy.length} legacy translated_strings group ids to uuidv7`,
    )
}

/**
 * Recomputes `translated_strings.string_folded` whenever it drifts from
 * `foldForMatch(string)`. Migration 0008 backfilled via SQLite's ASCII-only
 * `lower()`, so non-ASCII rows (umlauts, ß, diacritics) need a one-time
 * refresh; this also self-heals if the fold algorithm ever changes. Runs
 * once per process; the catalog is family-sized so this is cheap.
 */
function repairFoldedValues() {
    type TranslatedStringRow = {
        id: string
        locale: string
        string: string
        string_folded: string
    }
    const rows = sqlite
        .prepare(
            'SELECT id, locale, string, string_folded FROM translated_strings',
        )
        .all() as TranslatedStringRow[]
    const update = sqlite.prepare(
        'UPDATE translated_strings SET string_folded = ? WHERE id = ? AND locale = ?',
    )
    let fixed = 0
    for (const row of rows) {
        const folded = foldForMatch(row.string)
        if (folded !== row.string_folded) {
            update.run(folded, row.id, row.locale)
            fixed++
        }
    }
    if (fixed > 0) {
        // eslint-disable-next-line no-console
        console.log(`[db] repaired ${fixed} translated_strings folds`)
    }
}
