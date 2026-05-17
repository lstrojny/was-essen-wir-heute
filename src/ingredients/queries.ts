import { asc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import type { IngredientId } from '@/db/ids'
import {
    ingredientAliases,
    ingredientCountUnits,
    ingredients,
} from '@/db/schema'

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

    const needle = normalizeForMatch(trimmed)
    const aliasesById = new Map<IngredientId, string[]>()
    for (const a of db.select().from(ingredientAliases).all()) {
        const list = aliasesById.get(a.ingredientId) ?? []
        list.push(a.alias)
        aliasesById.set(a.ingredientId, list)
    }
    return rows.filter((row) => {
        const haystack = normalizeForMatch(
            [
                row.canonicalDe ?? '',
                row.canonicalEn ?? '',
                ...(aliasesById.get(row.id) ?? []),
            ].join(' '),
        )
        return haystack.includes(needle)
    })
}

function normalizeForMatch(s: string): string {
    // NFC so "ö" (U+00F6) and "ö" (NFD) compare equal, then locale-aware lower-case.
    return s.normalize('NFC').toLocaleLowerCase()
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
