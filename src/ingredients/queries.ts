import { asc, eq, like, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import type { IngredientId } from '@/db/ids'
import {
    centralIngredientAliases,
    centralIngredientCountUnits,
    centralIngredients,
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
            id: centralIngredients.id,
            canonicalDe: centralIngredients.canonicalDe,
            canonicalEn: centralIngredients.canonicalEn,
            role: centralIngredients.role,
            density: centralIngredients.density,
            aliasCount: sql<number>`count(distinct ${centralIngredientAliases.id})`,
            countUnitCount: sql<number>`count(distinct ${centralIngredientCountUnits.id})`,
        })
        .from(centralIngredients)
        .leftJoin(
            centralIngredientAliases,
            eq(
                centralIngredientAliases.centralIngredientId,
                centralIngredients.id,
            ),
        )
        .leftJoin(
            centralIngredientCountUnits,
            eq(
                centralIngredientCountUnits.centralIngredientId,
                centralIngredients.id,
            ),
        )
        .groupBy(centralIngredients.id)

    const query = trimmed
        ? baseQuery.where(
              or(
                  like(sql`lower(${centralIngredients.canonicalDe})`, pattern),
                  like(sql`lower(${centralIngredients.canonicalEn})`, pattern),
                  sql`EXISTS (
                      SELECT 1 FROM ${centralIngredientAliases} a
                      WHERE a.central_ingredient_id = ${centralIngredients.id}
                      AND lower(a.alias) LIKE ${pattern}
                  )`,
              ),
          )
        : baseQuery

    return query
        .orderBy(
            asc(centralIngredients.canonicalEn),
            asc(centralIngredients.canonicalDe),
        )
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
        .from(centralIngredients)
        .where(eq(centralIngredients.id, id))
        .get()
    if (!row) {
        return null
    }
    const aliases = db
        .select({ alias: centralIngredientAliases.alias })
        .from(centralIngredientAliases)
        .where(eq(centralIngredientAliases.centralIngredientId, id))
        .orderBy(asc(centralIngredientAliases.alias))
        .all()
        .map((r) => r.alias)
    const countUnits = db
        .select({
            unit: centralIngredientCountUnits.unit,
            gramsPerUnit: centralIngredientCountUnits.gramsPerUnit,
        })
        .from(centralIngredientCountUnits)
        .where(eq(centralIngredientCountUnits.centralIngredientId, id))
        .orderBy(asc(centralIngredientCountUnits.unit))
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
