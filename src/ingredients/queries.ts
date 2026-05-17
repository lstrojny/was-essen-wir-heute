import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db'
import type { IngredientId, IngredientsAliasId } from '@/db/ids'
import {
    ingredientCountUnits,
    ingredients,
    ingredientsAliases,
    ingredientsTranslated,
    recipeIngredients,
    translatedStrings,
} from '@/db/schema'
import type { Locale, LocaleMap } from '@/i18n/locale'
import { DEFAULT_LOCALE } from '@/i18n/locale'
import { resolveText } from '@/i18n/translatable'
import { readAllLocalesByGroup } from '@/i18n/translations'
import { foldForMatch } from './name-match'
import { findFoldedNameOwner } from './translation-writes'

export type IngredientListRow = {
    id: IngredientId
    canonical: LocaleMap
    role: 'starch' | 'vegetable' | 'protein' | 'none'
    density: number | null
    aliasCount: number
    countUnitCount: number
}

export function listIngredients(
    search: string,
    unusedOnly = false,
): IngredientListRow[] {
    const rows = db
        .select({
            id: ingredients.id,
            role: ingredients.role,
            density: ingredients.density,
            aliasCount: sql<number>`count(distinct ${ingredientsAliases.id})`,
            countUnitCount: sql<number>`count(distinct ${ingredientCountUnits.id})`,
            recipeUseCount: sql<number>`count(distinct ${recipeIngredients.id})`,
        })
        .from(ingredients)
        .leftJoin(
            ingredientsAliases,
            eq(ingredientsAliases.ingredientId, ingredients.id),
        )
        .leftJoin(
            ingredientCountUnits,
            eq(ingredientCountUnits.ingredientId, ingredients.id),
        )
        .leftJoin(
            recipeIngredients,
            eq(recipeIngredients.ingredientId, ingredients.id),
        )
        .groupBy(ingredients.id)
        .all()

    const filteredByUse = unusedOnly
        ? rows.filter((r) => r.recipeUseCount === 0)
        : rows
    if (filteredByUse.length === 0) return []

    const ids = filteredByUse.map((r) => r.id)
    const canonicals = resolveIngredientCanonicals(ids)
    const aliasesByIngredient = readAliasesByIngredient(ids)

    let candidates = filteredByUse
    const trimmed = search.trim()
    if (trimmed) {
        const needle = foldForMatch(trimmed)
        candidates = filteredByUse.filter((row) => {
            const haystackParts: string[] = []
            const canonical = canonicals.get(row.id)
            if (canonical) {
                for (const value of Object.values(canonical)) {
                    if (value) haystackParts.push(value)
                }
            }
            for (const alias of aliasesByIngredient.get(row.id) ?? []) {
                for (const value of Object.values(alias.text)) {
                    if (value) haystackParts.push(value)
                }
            }
            return foldForMatch(haystackParts.join(' ')).includes(needle)
        })
    }

    candidates.sort((a, b) =>
        compareByCanonical(canonicals.get(a.id), canonicals.get(b.id)),
    )
    return candidates.map((row) => ({
        id: row.id,
        canonical: canonicals.get(row.id) ?? {},
        role: row.role,
        density: row.density,
        aliasCount: row.aliasCount,
        countUnitCount: row.countUnitCount,
    }))
}

export type IngredientAliasRow = {
    id: IngredientsAliasId
    text: LocaleMap
}

export type IngredientDetail = {
    id: IngredientId
    canonical: LocaleMap
    role: 'starch' | 'vegetable' | 'protein' | 'none'
    density: number | null
    notes: string | null
    aliases: IngredientAliasRow[]
    countUnits: Array<{ unit: string; gramsPerUnit: number }>
}

export function getIngredient(id: IngredientId): IngredientDetail | null {
    const row = db
        .select({
            id: ingredients.id,
            role: ingredients.role,
            density: ingredients.density,
            notes: ingredients.notes,
        })
        .from(ingredients)
        .where(eq(ingredients.id, id))
        .get()
    if (!row) {
        return null
    }
    const canonical = resolveIngredientCanonicals([id]).get(id) ?? {}
    const aliases = readAliasesByIngredient([id]).get(id) ?? []
    aliases.sort((a, b) => compareByCanonical(a.text, b.text))
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
        canonical,
        role: row.role,
        density: row.density,
        notes: row.notes,
        aliases,
        countUnits,
    }
}

function resolveIngredientCanonicals(
    ids: IngredientId[],
): Map<IngredientId, LocaleMap> {
    if (ids.length === 0) return new Map()
    const links = db
        .select({
            ingredientId: ingredientsTranslated.ingredientId,
            groupId: ingredientsTranslated.translatedStringId,
        })
        .from(ingredientsTranslated)
        .where(
            and(
                inArray(ingredientsTranslated.ingredientId, ids),
                eq(ingredientsTranslated.unitCode, 'canonical'),
            ),
        )
        .all()
    const byGroup = readAllLocalesByGroup(links.map((l) => l.groupId))
    const out = new Map<IngredientId, LocaleMap>()
    for (const l of links) {
        const locales = byGroup.get(l.groupId)
        if (locales) out.set(l.ingredientId, locales)
    }
    return out
}

function readAliasesByIngredient(
    ids: IngredientId[],
): Map<IngredientId, IngredientAliasRow[]> {
    if (ids.length === 0) return new Map()
    const links = db
        .select({
            id: ingredientsAliases.id,
            ingredientId: ingredientsAliases.ingredientId,
            groupId: ingredientsAliases.translatedStringId,
        })
        .from(ingredientsAliases)
        .where(inArray(ingredientsAliases.ingredientId, ids))
        .all()
    const byGroup = readAllLocalesByGroup(links.map((l) => l.groupId))
    const out = new Map<IngredientId, IngredientAliasRow[]>()
    for (const l of links) {
        const text = byGroup.get(l.groupId) ?? {}
        const list = out.get(l.ingredientId) ?? []
        list.push({ id: l.id, text })
        out.set(l.ingredientId, list)
    }
    return out
}

function compareByCanonical(
    a: LocaleMap | undefined,
    b: LocaleMap | undefined,
): number {
    const aText = resolveText(a ?? {}, DEFAULT_LOCALE)?.text ?? ''
    const bText = resolveText(b ?? {}, DEFAULT_LOCALE)?.text ?? ''
    return aText.localeCompare(bText)
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
 * Find the first proposed alias that collides with any existing canonical or
 * alias across the catalog. Compares via `foldForMatch`. Backed by the
 * `ingredient_lookup_folded` shadow plus the active ingredient's own
 * canonical (folded) for the same-ingredient redundancy check.
 *
 * `excludeIngredientId` is the ingredient currently being edited (null on
 * create). Its existing rows are ignored in the cross-ingredient lookup
 * (so re-saving the same alias does not flag itself), but its proposed
 * canonical (`proposedCanonical`) is still checked for the
 * "alias equals own canonical" redundancy.
 */
export function findAliasConflict(
    proposed: string[],
    excludeIngredientId: IngredientId | null,
    proposedCanonical: LocaleMap,
    activeLocale: Locale,
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

    const selfCanonFolded = new Set<string>()
    for (const value of Object.values(proposedCanonical)) {
        if (!value) continue
        const folded = foldForMatch(value)
        if (folded) selfCanonFolded.add(folded)
    }

    for (const { raw, folded } of proposedFolds) {
        if (selfCanonFolded.has(folded)) {
            return {
                alias: raw,
                reason: 'canonical-on-same-ingredient',
                ownerId: null,
                ownerLabel: null,
            }
        }
        const owner = findFoldedNameOwner(folded, excludeIngredientId)
        if (!owner) continue
        const label =
            resolveText(
                resolveIngredientCanonicals([owner.ingredientId]).get(
                    owner.ingredientId,
                ) ?? {},
                activeLocale,
            )?.text ?? '(unnamed)'
        return {
            alias: raw,
            reason:
                owner.kind === 'canonical'
                    ? 'canonical-on-other-ingredient'
                    : 'alias-on-other-ingredient',
            ownerId: owner.ingredientId,
            ownerLabel: label,
        }
    }
    return null
}

/**
 * Indexed equality lookup on `ingredient_lookup_folded`. Used by the recipe
 * form's "did the user type an existing ingredient" check. Returns the
 * owning ingredient id, regardless of whether the match was on a canonical
 * or alias row.
 */
export function findIngredientByName(name: string): IngredientId | null {
    const needle = foldForMatch(name.trim())
    if (!needle) return null
    const hit = findFoldedNameOwner(needle, null)
    return hit?.ingredientId ?? null
}
