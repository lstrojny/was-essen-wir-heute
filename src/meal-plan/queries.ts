import { and, asc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm'
import { db } from '@/db'
import type {
    CuisineKey,
    IngredientId,
    MealPlanEntryId,
    RecipeId,
} from '@/db/ids'
import {
    ingredients,
    mealPlanEntries,
    mealPlanSettings,
    recipeComponents,
    recipeIngredients,
    recipeRatings,
    recipes,
    recipesTranslated,
} from '@/db/schema'
import type { LocaleMap } from '@/i18n/locale'
import { readAllLocalesByGroup } from '@/i18n/translations'
import { addDaysIso, asIsoDate, type IsoDate } from './dates'

export type SlotState = 'suggested' | 'edited' | 'pinned' | 'cleared'
export type Role = 'starch' | 'vegetable' | 'protein'

export type MealPlanSettingsRow = {
    activeWindowStart: IsoDate
    activeWindowEnd: IsoDate
    recentWindowWeeks: number
}

export function readMealPlanSettings(): MealPlanSettingsRow {
    const row = db
        .select({
            activeWindowStart: mealPlanSettings.activeWindowStart,
            activeWindowEnd: mealPlanSettings.activeWindowEnd,
            recentWindowWeeks: mealPlanSettings.recentWindowWeeks,
        })
        .from(mealPlanSettings)
        .where(eq(mealPlanSettings.id, 1))
        .get()
    if (!row) {
        throw new Error('meal_plan_settings row missing — migration did not seed')
    }
    return {
        activeWindowStart: asIsoDate(row.activeWindowStart),
        activeWindowEnd: asIsoDate(row.activeWindowEnd),
        recentWindowWeeks: row.recentWindowWeeks,
    }
}

export type MealPlanEntryRow = {
    id: MealPlanEntryId
    date: IsoDate
    recipeId: RecipeId | null
    state: SlotState
}

export function listEntriesBetween(
    startInclusive: IsoDate,
    endInclusive: IsoDate,
): MealPlanEntryRow[] {
    return db
        .select({
            id: mealPlanEntries.id,
            date: mealPlanEntries.date,
            recipeId: mealPlanEntries.recipeId,
            state: mealPlanEntries.state,
        })
        .from(mealPlanEntries)
        .where(
            and(
                gte(mealPlanEntries.date, startInclusive),
                lte(mealPlanEntries.date, endInclusive),
            ),
        )
        .orderBy(asc(mealPlanEntries.date))
        .all()
        .map((r) => ({
            id: r.id,
            date: asIsoDate(r.date),
            recipeId: r.recipeId,
            state: r.state,
        }))
}

export function findEntryByDate(date: IsoDate): MealPlanEntryRow | null {
    const r = db
        .select({
            id: mealPlanEntries.id,
            date: mealPlanEntries.date,
            recipeId: mealPlanEntries.recipeId,
            state: mealPlanEntries.state,
        })
        .from(mealPlanEntries)
        .where(eq(mealPlanEntries.date, date))
        .get()
    if (!r) return null
    return {
        id: r.id,
        date: asIsoDate(r.date),
        recipeId: r.recipeId,
        state: r.state,
    }
}

/**
 * Most recent date (strictly before `before`) that each recipe id was
 * placed on the plan. Powers the repetition penalty and the picker's
 * "last eaten" hint.
 */
export function lastEatenBefore(
    recipeIds: RecipeId[],
    before: IsoDate,
): Map<RecipeId, IsoDate> {
    if (recipeIds.length === 0) return new Map()
    const rows = db
        .select({
            recipeId: mealPlanEntries.recipeId,
            date: sql<string>`max(${mealPlanEntries.date})`,
        })
        .from(mealPlanEntries)
        .where(
            and(
                inArray(mealPlanEntries.recipeId, recipeIds),
                lt(mealPlanEntries.date, before),
            ),
        )
        .groupBy(mealPlanEntries.recipeId)
        .all()
    const out = new Map<RecipeId, IsoDate>()
    for (const r of rows) {
        if (r.recipeId && r.date) out.set(r.recipeId, asIsoDate(r.date))
    }
    return out
}

export function recipesEatenInWindow(
    lookbackStart: IsoDate,
    before: IsoDate,
): Set<RecipeId> {
    const rows = db
        .selectDistinct({ recipeId: mealPlanEntries.recipeId })
        .from(mealPlanEntries)
        .where(
            and(
                gte(mealPlanEntries.date, lookbackStart),
                lt(mealPlanEntries.date, before),
            ),
        )
        .all()
    const out = new Set<RecipeId>()
    for (const r of rows) if (r.recipeId) out.add(r.recipeId)
    return out
}

export type CandidateMeta = {
    id: RecipeId
    title: LocaleMap
    cuisineKey: CuisineKey
    createdAt: Date
    ratingAverage: number | null
    ratingCount: number
    rolesByIngredient: Map<IngredientId, Role>
}

export function loadCompleteMealCandidates(): CandidateMeta[] {
    const recipeRows = db
        .select({
            id: recipes.id,
            cuisineKey: recipes.cuisineKey,
            createdAt: recipes.createdAt,
        })
        .from(recipes)
        .where(eq(recipes.isCompleteMeal, true))
        .all()
    if (recipeRows.length === 0) return []
    const ids = recipeRows.map((r) => r.id)
    const ratings = loadRatingAggregates(ids)
    const rolesByRecipe = rolledUpRolesByRecipe(ids)
    const titles = resolveTitlesByIds(ids)
    return recipeRows.map((r) => {
        const rating = ratings.get(r.id)
        return {
            id: r.id,
            title: titles.get(r.id) ?? {},
            cuisineKey: r.cuisineKey,
            createdAt: r.createdAt,
            ratingAverage: rating && rating.cnt > 0 ? rating.avg : null,
            ratingCount: rating?.cnt ?? 0,
            rolesByIngredient: rolesByRecipe.get(r.id) ?? new Map(),
        }
    })
}

function loadRatingAggregates(
    recipeIds: RecipeId[],
): Map<RecipeId, { avg: number; cnt: number }> {
    if (recipeIds.length === 0) return new Map()
    const rows = db
        .select({
            recipeId: recipeRatings.recipeId,
            avg: sql<number>`avg(${recipeRatings.score})`,
            cnt: sql<number>`count(*)`,
        })
        .from(recipeRatings)
        .where(inArray(recipeRatings.recipeId, recipeIds))
        .groupBy(recipeRatings.recipeId)
        .all()
    return new Map(
        rows.map((r) => [r.recipeId, { avg: r.avg, cnt: r.cnt as number }]),
    )
}

/**
 * For every recipe in `recipeIds`, build a map of role-tagged
 * (`starch`/`vegetable`/`protein`) ingredient ids reached either directly
 * or transitively via composite components. Untagged (`none`) and unlinked
 * recipe rows are skipped. Used by the variety penalty in scoring.
 */
function rolledUpRolesByRecipe(
    recipeIds: RecipeId[],
): Map<RecipeId, Map<IngredientId, Role>> {
    const out = new Map<RecipeId, Map<IngredientId, Role>>()
    if (recipeIds.length === 0) return out
    const allReachable = new Set<RecipeId>(recipeIds)
    let frontier = [...recipeIds]
    while (frontier.length) {
        const links = db
            .select({
                parentId: recipeComponents.parentRecipeId,
                childId: recipeComponents.childRecipeId,
            })
            .from(recipeComponents)
            .where(inArray(recipeComponents.parentRecipeId, frontier))
            .all()
        const next: RecipeId[] = []
        for (const l of links) {
            if (!allReachable.has(l.childId)) {
                allReachable.add(l.childId)
                next.push(l.childId)
            }
        }
        frontier = next
    }
    const childByParent = new Map<RecipeId, RecipeId[]>()
    const allLinks = db
        .select({
            parentId: recipeComponents.parentRecipeId,
            childId: recipeComponents.childRecipeId,
        })
        .from(recipeComponents)
        .where(inArray(recipeComponents.parentRecipeId, [...allReachable]))
        .all()
    for (const l of allLinks) {
        const list = childByParent.get(l.parentId) ?? []
        list.push(l.childId)
        childByParent.set(l.parentId, list)
    }
    const ingredientRows = db
        .select({
            recipeId: recipeIngredients.recipeId,
            ingredientId: recipeIngredients.ingredientId,
            role: ingredients.role,
        })
        .from(recipeIngredients)
        .innerJoin(
            ingredients,
            eq(ingredients.id, recipeIngredients.ingredientId),
        )
        .where(inArray(recipeIngredients.recipeId, [...allReachable]))
        .all()
    const directByRecipe = new Map<RecipeId, Map<IngredientId, Role>>()
    for (const row of ingredientRows) {
        if (!row.ingredientId || row.role === 'none') continue
        const entry =
            directByRecipe.get(row.recipeId) ?? new Map<IngredientId, Role>()
        entry.set(row.ingredientId, row.role as Role)
        directByRecipe.set(row.recipeId, entry)
    }
    for (const root of recipeIds) {
        const collected = new Map<IngredientId, Role>()
        const stack: RecipeId[] = [root]
        const seen = new Set<RecipeId>()
        while (stack.length) {
            const cur = stack.pop()
            if (!cur || seen.has(cur)) continue
            seen.add(cur)
            const own = directByRecipe.get(cur)
            if (own) {
                for (const [iid, role] of own) collected.set(iid, role)
            }
            for (const childId of childByParent.get(cur) ?? []) {
                stack.push(childId)
            }
        }
        out.set(root, collected)
    }
    return out
}

export function resolveTitlesByIds(
    recipeIds: RecipeId[],
): Map<RecipeId, LocaleMap> {
    if (recipeIds.length === 0) return new Map()
    const links = db
        .select({
            recipeId: recipesTranslated.recipeId,
            groupId: recipesTranslated.translatedStringId,
        })
        .from(recipesTranslated)
        .where(
            and(
                inArray(recipesTranslated.recipeId, recipeIds),
                eq(recipesTranslated.unitCode, 'title'),
            ),
        )
        .all()
    const byGroup = readAllLocalesByGroup(links.map((l) => l.groupId))
    const out = new Map<RecipeId, LocaleMap>()
    for (const l of links) {
        const locales = byGroup.get(l.groupId)
        if (locales) out.set(l.recipeId, locales)
    }
    return out
}

export type PlanRowSummary = {
    date: IsoDate
    entryId: MealPlanEntryId | null
    state: SlotState | 'empty'
    recipeId: RecipeId | null
    title: LocaleMap
    cuisineKey: CuisineKey | null
    roles: Map<IngredientId, Role>
}

export function loadActiveWindowRows(): {
    settings: MealPlanSettingsRow
    rows: PlanRowSummary[]
} {
    const settings = readMealPlanSettings()
    const entries = listEntriesBetween(
        settings.activeWindowStart,
        settings.activeWindowEnd,
    )
    const byDate = new Map(entries.map((e) => [e.date, e]))
    const recipeIds = entries
        .map((e) => e.recipeId)
        .filter((id): id is RecipeId => id !== null)
    const titles = resolveTitlesByIds(recipeIds)
    const cuisineByRecipe = readCuisineByRecipe(recipeIds)
    const rolesByRecipe = rolledUpRolesByRecipe(recipeIds)
    const rows: PlanRowSummary[] = []
    let cur = settings.activeWindowStart
    while (cur <= settings.activeWindowEnd) {
        const entry = byDate.get(cur)
        if (!entry) {
            rows.push({
                date: cur,
                entryId: null,
                state: 'empty',
                recipeId: null,
                title: {},
                cuisineKey: null,
                roles: new Map(),
            })
        } else {
            rows.push({
                date: cur,
                entryId: entry.id,
                state: entry.state,
                recipeId: entry.recipeId,
                title: entry.recipeId
                    ? (titles.get(entry.recipeId) ?? {})
                    : {},
                cuisineKey: entry.recipeId
                    ? (cuisineByRecipe.get(entry.recipeId) ?? null)
                    : null,
                roles: entry.recipeId
                    ? (rolesByRecipe.get(entry.recipeId) ?? new Map())
                    : new Map(),
            })
        }
        cur = addDaysIso(cur, 1)
    }
    return { settings, rows }
}

function readCuisineByRecipe(
    recipeIds: RecipeId[],
): Map<RecipeId, CuisineKey> {
    if (recipeIds.length === 0) return new Map()
    const rows = db
        .select({ id: recipes.id, cuisineKey: recipes.cuisineKey })
        .from(recipes)
        .where(inArray(recipes.id, recipeIds))
        .all()
    return new Map(rows.map((r) => [r.id, r.cuisineKey]))
}

export type RecipePickerEntry = {
    id: RecipeId
    title: LocaleMap
    cuisineKey: CuisineKey
    ratingAverage: number | null
    ratingCount: number
    rolesByIngredient: Map<IngredientId, Role>
}

export function listCompleteMealsForPicker(): RecipePickerEntry[] {
    const candidates = loadCompleteMealCandidates()
    return candidates.map((c) => ({
        id: c.id,
        title: c.title,
        cuisineKey: c.cuisineKey,
        ratingAverage: c.ratingAverage,
        ratingCount: c.ratingCount,
        rolesByIngredient: c.rolesByIngredient,
    }))
}
