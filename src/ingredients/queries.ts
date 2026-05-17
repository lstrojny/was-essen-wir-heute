import { asc, eq, like, or, sql } from 'drizzle-orm'
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
    const trimmed = search.trim()
    const pattern = `%${trimmed.toLowerCase()}%`
    const baseQuery = db
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

    const query = trimmed
        ? baseQuery.where(
              or(
                  like(sql`lower(${ingredients.canonicalDe})`, pattern),
                  like(sql`lower(${ingredients.canonicalEn})`, pattern),
                  sql`EXISTS (
                      SELECT 1 FROM ${ingredientAliases} a
                      WHERE a.ingredient_id = ${ingredients.id}
                      AND lower(a.alias) LIKE ${pattern}
                  )`,
              ),
          )
        : baseQuery

    return query
        .orderBy(asc(ingredients.canonicalEn), asc(ingredients.canonicalDe))
        .all()
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
