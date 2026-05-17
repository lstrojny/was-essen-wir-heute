import { and, asc, eq, ne, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import type { IngredientId } from '@/db/ids'
import {
    ingredientAliases,
    ingredientCountUnits,
    ingredients,
} from '@/db/schema'
import { foldForMatch } from './name-match'

export type IngredientListRow = {
    id: IngredientId
    canonicalDe: string | null
    canonicalEn: string | null
    role: 'starch' | 'vegetable' | 'protein' | 'none'
    density: number | null
    aliasCount: number
    countUnitCount: number
}

export function listIngredients(search: string): IngredientListRow[] {
    // Load everything; filter in JS so Unicode case-folding works (SQLite's
    // built-in lower() is ASCII-only, so "Olivenöl" LIKE "%öl%" misses the
    // capital "Ö" case). Catalog is family-sized; this is fine.
    const rows = db
        .select({
            id: ingredients.id,
            canonicalDe: ingredients.canonicalDe,
            canonicalEn: ingredients.canonicalEn,
            role: ingredients.role,
            density: ingredients.density,
            aliasCount: sql<number>`count(distinct ${ingredientAliases.id})`,
            countUnitCount: sql<number>`count(distinct ${ingredientCountUnits.id})`,
        })
        .from(ingredients)
        .leftJoin(
            ingredientAliases,
            eq(ingredientAliases.ingredientId, ingredients.id),
        )
        .leftJoin(
            ingredientCountUnits,
            eq(ingredientCountUnits.ingredientId, ingredients.id),
        )
        .groupBy(ingredients.id)
        .orderBy(asc(ingredients.canonicalEn), asc(ingredients.canonicalDe))
        .all()

    const trimmed = search.trim()
    if (!trimmed) return rows

    const needle = foldForMatch(trimmed)
    const aliasesById = new Map<IngredientId, string[]>()
    for (const a of db.select().from(ingredientAliases).all()) {
        const list = aliasesById.get(a.ingredientId) ?? []
        list.push(a.alias)
        aliasesById.set(a.ingredientId, list)
    }
    return rows.filter((row) => {
        const haystack = foldForMatch(
            [
                row.canonicalDe ?? '',
                row.canonicalEn ?? '',
                ...(aliasesById.get(row.id) ?? []),
            ].join(' '),
        )
        return haystack.includes(needle)
    })
}

export type IngredientDetail = {
    id: IngredientId
    canonicalDe: string | null
    canonicalEn: string | null
    role: 'starch' | 'vegetable' | 'protein' | 'none'
    density: number | null
    notes: string | null
    aliases: string[]
    countUnits: Array<{ unit: string; gramsPerUnit: number }>
}

export function getIngredient(id: IngredientId): IngredientDetail | null {
    const row = db
        .select()
        .from(ingredients)
        .where(eq(ingredients.id, id))
        .get()
    if (!row) {
        return null
    }
    const aliases = db
        .select({ alias: ingredientAliases.alias })
        .from(ingredientAliases)
        .where(eq(ingredientAliases.ingredientId, id))
        .orderBy(asc(ingredientAliases.alias))
        .all()
        .map((r) => r.alias)
    const countUnits = db
        .select({
            unit: ingredientCountUnits.unit,
            gramsPerUnit: ingredientCountUnits.gramsPerUnit,
        })
        .from(ingredientCountUnits)
        .where(eq(ingredientCountUnits.ingredientId, id))
        .orderBy(asc(ingredientCountUnits.unit))
        .all()
    return {
        id: row.id,
        canonicalDe: row.canonicalDe,
        canonicalEn: row.canonicalEn,
        role: row.role,
        density: row.density,
        notes: row.notes,
        aliases,
        countUnits,
    }
}

export type AliasConflict = {
    alias: string
    reason:
        | 'alias-on-other-ingredient'
        | 'canonical-on-other-ingredient'
        | 'canonical-on-same-ingredient'
    ownerId: IngredientId | null
    ownerLabel: string | null
}

/**
 * Returns the first proposed alias that collides with anything in the
 * catalog, or null if none collide. Uses `foldForMatch` so umlaut-only,
 * digraph-only, or diacritic-only differences are caught.
 *
 * Collisions:
 *  - the proposed alias matches an alias on another ingredient
 *    (`alias-on-other-ingredient`)
 *  - the proposed alias matches the canonical name (DE or EN) of another
 *    ingredient (`canonical-on-other-ingredient`)
 *  - the proposed alias matches the *same ingredient's* own canonical name
 *    — redundant, since the canonical is already a match
 *    (`canonical-on-same-ingredient`)
 *
 * `excludeIngredientId` is the ingredient currently being edited (null on
 * create). Its existing aliases are skipped (so re-saving the same alias
 * does not flag itself), but its canonicals are NOT skipped — we want to
 * flag "alias equals own canonical" as redundant.
 */
/**
 * Indexed lookup: for each proposed alias, run two equality queries against
 * the folded columns. With unique/btree indexes on `ingredient_aliases.alias_folded`,
 * `ingredients.canonical_de_folded`, `ingredients.canonical_en_folded` this is
 * O(log n) per probe.
 */
export function findAliasConflict(
    proposed: string[],
    excludeIngredientId: IngredientId | null,
    proposedCanonicalDe: string | null = null,
    proposedCanonicalEn: string | null = null,
): AliasConflict | null {
    if (proposed.length === 0) return null

    const proposedFolds: Array<{ raw: string; folded: string }> = []
    const seen = new Set<string>()
    for (const raw of proposed) {
        const folded = foldForMatch(raw)
        if (!folded || seen.has(folded)) continue
        seen.add(folded)
        proposedFolds.push({ raw, folded })
    }
    if (proposedFolds.length === 0) return null

    // Pre-fold the live canonicals so we can catch "alias equals my own
    // canonical" without a round-trip — the DB may not have them yet.
    const selfCanonDe = proposedCanonicalDe
        ? foldForMatch(proposedCanonicalDe)
        : null
    const selfCanonEn = proposedCanonicalEn
        ? foldForMatch(proposedCanonicalEn)
        : null

    for (const { raw, folded } of proposedFolds) {
        if (
            (selfCanonDe && selfCanonDe === folded) ||
            (selfCanonEn && selfCanonEn === folded)
        ) {
            return {
                alias: raw,
                reason: 'canonical-on-same-ingredient',
                ownerId: null,
                ownerLabel: null,
            }
        }

        // 1. Look up against canonical_*_folded indexes.
        const canonicalHit = db
            .select({
                id: ingredients.id,
                canonicalDe: ingredients.canonicalDe,
                canonicalEn: ingredients.canonicalEn,
            })
            .from(ingredients)
            .where(
                or(
                    eq(ingredients.canonicalDeFolded, folded),
                    eq(ingredients.canonicalEnFolded, folded),
                ),
            )
            .get()
        if (canonicalHit) {
            const sameRow = canonicalHit.id === excludeIngredientId
            return {
                alias: raw,
                reason: sameRow
                    ? 'canonical-on-same-ingredient'
                    : 'canonical-on-other-ingredient',
                ownerId: sameRow ? null : canonicalHit.id,
                ownerLabel: sameRow
                    ? null
                    : (canonicalHit.canonicalEn ??
                      canonicalHit.canonicalDe ??
                      '(unnamed)'),
            }
        }

        // 2. Look up against alias_folded (unique global index).
        const aliasHit = db
            .select({
                ingredientId: ingredientAliases.ingredientId,
                canonicalDe: ingredients.canonicalDe,
                canonicalEn: ingredients.canonicalEn,
            })
            .from(ingredientAliases)
            .innerJoin(
                ingredients,
                eq(ingredients.id, ingredientAliases.ingredientId),
            )
            .where(
                excludeIngredientId !== null
                    ? and(
                          eq(ingredientAliases.aliasFolded, folded),
                          ne(
                              ingredientAliases.ingredientId,
                              excludeIngredientId,
                          ),
                      )
                    : eq(ingredientAliases.aliasFolded, folded),
            )
            .get()
        if (aliasHit) {
            return {
                alias: raw,
                reason: 'alias-on-other-ingredient',
                ownerId: aliasHit.ingredientId,
                ownerLabel:
                    aliasHit.canonicalEn ?? aliasHit.canonicalDe ?? '(unnamed)',
            }
        }
    }
    return null
}
