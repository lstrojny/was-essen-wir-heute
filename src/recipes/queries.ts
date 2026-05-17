import { and, asc, count, eq, inArray, like, ne, sql } from 'drizzle-orm'
import { db } from '@/db'
import type {
    CuisineKey,
    IngredientId,
    RecipeComponentId,
    RecipeId,
    RecipeIngredientId,
    RecipeStepId,
    UserId,
} from '@/db/ids'
import {
    cuisines,
    cuisinesTranslated,
    ingredients,
    ingredientsAliases,
    ingredientsTranslated,
    recipeComponents,
    recipeIngredients,
    recipeRatings,
    recipeSteps,
    recipeStepsTranslated,
    recipes,
    recipesTranslated,
    translatedStrings,
    users,
} from '@/db/schema'
import { DEFAULT_LOCALE, type Locale, type LocaleMap } from '@/i18n/locale'
import { resolveText } from '@/i18n/translatable'
import { readAllLocalesByGroup, readGroups } from '@/i18n/translations'
import { foldForMatch } from '@/ingredients/name-match'
import type { RolledUpRecipe } from './rollup'

export type CuisineRow = {
    key: CuisineKey
    label: string
    isFallback: boolean
}

export function listCuisines(locale: Locale): CuisineRow[] {
    const links = db
        .select({
            key: cuisines.key,
            groupId: cuisinesTranslated.translatedStringId,
        })
        .from(cuisines)
        .innerJoin(
            cuisinesTranslated,
            and(
                eq(cuisinesTranslated.cuisineKey, cuisines.key),
                eq(cuisinesTranslated.unitCode, 'label'),
            ),
        )
        .orderBy(asc(cuisines.key))
        .all()
    const resolved = readGroups(
        links.map((l) => l.groupId),
        locale,
    )
    return links.map((l) => {
        const r = resolved.get(l.groupId)
        return {
            key: l.key,
            label: r?.text ?? l.key,
            isFallback: r?.isFallback ?? true,
        }
    })
}

export type CuisineAllLocalesRow = {
    key: CuisineKey
    label: LocaleMap
}

export function listCuisinesAllLocales(): CuisineAllLocalesRow[] {
    const rows = db
        .select({
            key: cuisines.key,
            locale: translatedStrings.locale,
            string: translatedStrings.string,
        })
        .from(cuisines)
        .innerJoin(
            cuisinesTranslated,
            and(
                eq(cuisinesTranslated.cuisineKey, cuisines.key),
                eq(cuisinesTranslated.unitCode, 'label'),
            ),
        )
        .innerJoin(
            translatedStrings,
            eq(translatedStrings.id, cuisinesTranslated.translatedStringId),
        )
        .orderBy(asc(cuisines.key))
        .all()
    const byKey = new Map<CuisineKey, CuisineAllLocalesRow>()
    for (const r of rows) {
        const entry = byKey.get(r.key) ?? { key: r.key, label: {} }
        entry.label[r.locale] = r.string
        byKey.set(r.key, entry)
    }
    return Array.from(byKey.values())
}

export type RatingAggregate = {
    average: number | null
    count: number
}

export type RecipeListRow = {
    id: RecipeId
    title: LocaleMap
    cuisineKey: CuisineKey
    totalActiveTimeMinutes: number
    totalWaitTimeMinutes: number
    isCompleteMeal: boolean
    ratingAverage: number | null
    ratingCount: number
    myRating: number | null
}

export function listRecipes(
    search: string,
    cuisineKey: CuisineKey | null,
    completeOnly: boolean,
    viewerId: UserId | null = null,
): RecipeListRow[] {
    const trimmed = search.trim()
    const base = db
        .select({
            id: recipes.id,
            cuisineKey: recipes.cuisineKey,
            isCompleteMeal: recipes.isCompleteMeal,
        })
        .from(recipes)
    const conditions = []
    if (trimmed) {
        const foldedPattern = `%${foldForMatch(trimmed)}%`
        const matching = db
            .select({ recipeId: recipesTranslated.recipeId })
            .from(recipesTranslated)
            .innerJoin(
                translatedStrings,
                eq(translatedStrings.id, recipesTranslated.translatedStringId),
            )
            .where(
                and(
                    eq(recipesTranslated.unitCode, 'title'),
                    like(translatedStrings.stringFolded, foldedPattern),
                ),
            )
        conditions.push(inArray(recipes.id, matching))
    }
    if (cuisineKey) {
        conditions.push(eq(recipes.cuisineKey, cuisineKey))
    }
    if (completeOnly) {
        conditions.push(eq(recipes.isCompleteMeal, true))
    }
    const query =
        conditions.length === 0
            ? base
            : base.where(
                  conditions.length === 1
                      ? conditions[0]
                      : sql.join(conditions, sql` AND `),
              )
    const rows = query.all()
    if (rows.length === 0) return []
    const ids = rows.map((r) => r.id)
    const titles = resolveTitles(ids)
    rows.sort((a, b) => compareByTitle(titles.get(a.id), titles.get(b.id)))
    const aggregates = getRatingAggregatesForRecipes(ids)
    const myRatings = viewerId
        ? getRatingsByUserForRecipes(viewerId, ids)
        : null
    return rows.map((r) => {
        const rolled = getRolledUpRecipe(r.id)
        const agg = aggregates.get(r.id) ?? { average: null, count: 0 }
        return {
            id: r.id,
            title: titles.get(r.id) ?? {},
            cuisineKey: r.cuisineKey,
            isCompleteMeal: r.isCompleteMeal,
            totalActiveTimeMinutes: rolled?.totalActiveTimeMinutes ?? 0,
            totalWaitTimeMinutes: rolled?.totalWaitTimeMinutes ?? 0,
            ratingAverage: agg.average,
            ratingCount: agg.count,
            myRating: myRatings?.get(r.id) ?? null,
        }
    })
}

function compareByTitle(
    a: LocaleMap | undefined,
    b: LocaleMap | undefined,
): number {
    const aText = resolveText(a ?? {}, DEFAULT_LOCALE)?.text ?? ''
    const bText = resolveText(b ?? {}, DEFAULT_LOCALE)?.text ?? ''
    return aText.localeCompare(bText)
}

function resolveTitles(recipeIds: RecipeId[]): Map<RecipeId, LocaleMap> {
    return resolveRecipeUnit(recipeIds, 'title')
}

function resolveNotes(recipeIds: RecipeId[]): Map<RecipeId, LocaleMap> {
    return resolveRecipeUnit(recipeIds, 'notes')
}

function resolveRecipeUnit(
    recipeIds: RecipeId[],
    unitCode: 'title' | 'notes',
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
                eq(recipesTranslated.unitCode, unitCode),
            ),
        )
        .all()
    const groupIds = links.map((l) => l.groupId)
    const byGroup = readAllLocalesByGroup(groupIds)
    const out = new Map<RecipeId, Partial<Record<Locale, string>>>()
    for (const l of links) {
        const locales = byGroup.get(l.groupId)
        if (locales) {
            out.set(l.recipeId, locales)
        }
    }
    return out
}

export function getRatingAggregatesForRecipes(
    recipeIds: RecipeId[],
): Map<RecipeId, RatingAggregate> {
    const out = new Map<RecipeId, RatingAggregate>()
    if (recipeIds.length === 0) return out
    const rows = db
        .select({
            recipeId: recipeRatings.recipeId,
            avg: sql<number>`avg(${recipeRatings.score})`,
            cnt: count(recipeRatings.id),
        })
        .from(recipeRatings)
        .where(inArray(recipeRatings.recipeId, recipeIds))
        .groupBy(recipeRatings.recipeId)
        .all()
    for (const r of rows) {
        out.set(r.recipeId, {
            average: r.cnt > 0 ? r.avg : null,
            count: r.cnt,
        })
    }
    return out
}

export function getRatingAggregateForRecipe(
    recipeId: RecipeId,
): RatingAggregate {
    return (
        getRatingAggregatesForRecipes([recipeId]).get(recipeId) ?? {
            average: null,
            count: 0,
        }
    )
}

function getRatingsByUserForRecipes(
    userId: UserId,
    recipeIds: RecipeId[],
): Map<RecipeId, number> {
    const out = new Map<RecipeId, number>()
    if (recipeIds.length === 0) return out
    const rows = db
        .select({
            recipeId: recipeRatings.recipeId,
            score: recipeRatings.score,
        })
        .from(recipeRatings)
        .where(
            and(
                eq(recipeRatings.userId, userId),
                inArray(recipeRatings.recipeId, recipeIds),
            ),
        )
        .all()
    for (const r of rows) out.set(r.recipeId, r.score)
    return out
}

export type RecipeRatingRow = {
    userId: UserId
    displayName: string
    score: number
}

export function listRatingsForRecipe(recipeId: RecipeId): RecipeRatingRow[] {
    return db
        .select({
            userId: recipeRatings.userId,
            displayName: users.displayName,
            score: recipeRatings.score,
        })
        .from(recipeRatings)
        .innerJoin(users, eq(recipeRatings.userId, users.id))
        .where(eq(recipeRatings.recipeId, recipeId))
        .orderBy(asc(users.displayName))
        .all()
}

export function getMyRatingForRecipe(
    recipeId: RecipeId,
    userId: UserId,
): number | null {
    const row = db
        .select({ score: recipeRatings.score })
        .from(recipeRatings)
        .where(
            and(
                eq(recipeRatings.recipeId, recipeId),
                eq(recipeRatings.userId, userId),
            ),
        )
        .get()
    return row?.score ?? null
}

export type RecipeIngredientRow = {
    id: RecipeIngredientId
    position: number
    amount: number | null
    unit: string | null
    name: string
    ingredientId: IngredientId | null
}

export type RecipeStepRow = {
    id: RecipeStepId
    position: number
    text: LocaleMap
}

export type RecipeComponentRow = {
    id: RecipeComponentId
    position: number
    childRecipeId: RecipeId
    childTitle: LocaleMap
}

export type RecipeDetail = {
    id: RecipeId
    title: LocaleMap
    notes: LocaleMap
    cuisineKey: CuisineKey
    activeTimeMinutes: number
    waitTimeMinutes: number
    isCompleteMeal: boolean
    source: 'manual' | 'spoonacular' | 'llm-chat'
    sourceIdentifier: string | null
    ingredients: RecipeIngredientRow[]
    steps: RecipeStepRow[]
    components: RecipeComponentRow[]
}

export function getRecipe(id: RecipeId): RecipeDetail | null {
    const row = db.select().from(recipes).where(eq(recipes.id, id)).get()
    if (!row) {
        return null
    }
    const ingredients = db
        .select({
            id: recipeIngredients.id,
            position: recipeIngredients.position,
            amount: recipeIngredients.amount,
            unit: recipeIngredients.unit,
            name: recipeIngredients.name,
            ingredientId: recipeIngredients.ingredientId,
        })
        .from(recipeIngredients)
        .where(eq(recipeIngredients.recipeId, id))
        .orderBy(asc(recipeIngredients.position))
        .all()
    const stepRows = db
        .select({
            id: recipeSteps.id,
            position: recipeSteps.position,
        })
        .from(recipeSteps)
        .where(eq(recipeSteps.recipeId, id))
        .orderBy(asc(recipeSteps.position))
        .all()
    const stepIds = stepRows.map((s) => s.id)
    const stepTexts = resolveStepTexts(stepIds)
    const steps: RecipeStepRow[] = stepRows.map((s) => ({
        id: s.id,
        position: s.position,
        text: stepTexts.get(s.id) ?? {},
    }))
    const componentRows = db
        .select({
            id: recipeComponents.id,
            position: recipeComponents.position,
            childRecipeId: recipeComponents.childRecipeId,
        })
        .from(recipeComponents)
        .where(eq(recipeComponents.parentRecipeId, id))
        .orderBy(asc(recipeComponents.position))
        .all()
    const childIds = componentRows.map((c) => c.childRecipeId)
    const childTitles = resolveTitles(childIds)
    const components: RecipeComponentRow[] = componentRows.map((c) => ({
        id: c.id,
        position: c.position,
        childRecipeId: c.childRecipeId,
        childTitle: childTitles.get(c.childRecipeId) ?? {},
    }))
    return {
        id: row.id,
        title: resolveTitles([id]).get(id) ?? {},
        notes: resolveNotes([id]).get(id) ?? {},
        cuisineKey: row.cuisineKey,
        activeTimeMinutes: row.activeTimeMinutes,
        waitTimeMinutes: row.waitTimeMinutes,
        isCompleteMeal: row.isCompleteMeal,
        source: row.source,
        sourceIdentifier: row.sourceIdentifier,
        ingredients,
        steps,
        components,
    }
}

function resolveStepTexts(
    stepIds: RecipeStepId[],
): Map<RecipeStepId, LocaleMap> {
    if (stepIds.length === 0) return new Map()
    const links = db
        .select({
            stepId: recipeStepsTranslated.recipeStepId,
            groupId: recipeStepsTranslated.translatedStringId,
        })
        .from(recipeStepsTranslated)
        .where(
            and(
                inArray(recipeStepsTranslated.recipeStepId, stepIds),
                eq(recipeStepsTranslated.unitCode, 'text'),
            ),
        )
        .all()
    const byGroup = readAllLocalesByGroup(links.map((l) => l.groupId))
    const out = new Map<RecipeStepId, LocaleMap>()
    for (const l of links) {
        const locales = byGroup.get(l.groupId)
        if (locales) out.set(l.stepId, locales)
    }
    return out
}

export type RecipePickerRow = {
    id: RecipeId
    title: LocaleMap
    totalActiveTimeMinutes: number
    totalWaitTimeMinutes: number
}

export function listRecipesForComponentPicker(
    excludeId: RecipeId | null,
): RecipePickerRow[] {
    const base = db.select({ id: recipes.id }).from(recipes)
    const query = excludeId ? base.where(ne(recipes.id, excludeId)) : base
    const rows = query.all()
    const ids = rows.map((r) => r.id)
    const titles = resolveTitles(ids)
    rows.sort((a, b) => compareByTitle(titles.get(a.id), titles.get(b.id)))
    return rows.map((r) => {
        const rolled = getRolledUpRecipe(r.id)
        return {
            id: r.id,
            title: titles.get(r.id) ?? {},
            totalActiveTimeMinutes: rolled?.totalActiveTimeMinutes ?? 0,
            totalWaitTimeMinutes: rolled?.totalWaitTimeMinutes ?? 0,
        }
    })
}

export type ParentRecipeRef = {
    id: RecipeId
    title: LocaleMap
}

export function findRecipesReferencing(childId: RecipeId): ParentRecipeRef[] {
    const rows = db
        .select({ id: recipes.id })
        .from(recipeComponents)
        .innerJoin(recipes, eq(recipeComponents.parentRecipeId, recipes.id))
        .where(eq(recipeComponents.childRecipeId, childId))
        .all()
    const ids = rows.map((r) => r.id)
    const titles = resolveTitles(ids)
    return rows.map((r) => ({ id: r.id, title: titles.get(r.id) ?? {} }))
}

export function findDirectChildrenForMany(parentIds: RecipeId[]): RecipeId[] {
    if (parentIds.length === 0) return []
    return db
        .select({ id: recipeComponents.childRecipeId })
        .from(recipeComponents)
        .where(inArray(recipeComponents.parentRecipeId, parentIds))
        .all()
        .map((r) => r.id)
}

export function getRolledUpRecipe(id: RecipeId): RolledUpRecipe | null {
    const detail = getRecipe(id)
    if (!detail) return null
    const components: RolledUpRecipe[] = []
    for (const c of detail.components) {
        const child = getRolledUpRecipe(c.childRecipeId)
        if (child) components.push(child)
    }
    const totalActive =
        detail.activeTimeMinutes +
        components.reduce((sum, c) => sum + c.totalActiveTimeMinutes, 0)
    const childMaxWait = components.reduce(
        (max, c) => Math.max(max, c.totalWaitTimeMinutes),
        0,
    )
    const totalWait = Math.max(detail.waitTimeMinutes, childMaxWait)
    return {
        id: detail.id,
        title: detail.title,
        ownIngredients: detail.ingredients,
        ownSteps: detail.steps,
        ownActiveTimeMinutes: detail.activeTimeMinutes,
        ownWaitTimeMinutes: detail.waitTimeMinutes,
        components,
        totalActiveTimeMinutes: totalActive,
        totalWaitTimeMinutes: totalWait,
    }
}

export type RecipeUsingIngredient = {
    id: RecipeId
    title: LocaleMap
    cuisineKey: CuisineKey
}

export function findRecipesUsingIngredient(
    ingredientId: IngredientId,
): RecipeUsingIngredient[] {
    const rows = db
        .selectDistinct({
            id: recipes.id,
            cuisineKey: recipes.cuisineKey,
        })
        .from(recipes)
        .innerJoin(
            recipeIngredients,
            eq(recipeIngredients.recipeId, recipes.id),
        )
        .where(eq(recipeIngredients.ingredientId, ingredientId))
        .all()
    const ids = rows.map((r) => r.id)
    const titles = resolveTitles(ids)
    rows.sort((a, b) => compareByTitle(titles.get(a.id), titles.get(b.id)))
    return rows.map((r) => ({
        id: r.id,
        title: titles.get(r.id) ?? {},
        cuisineKey: r.cuisineKey,
    }))
}

export type IngredientOption = {
    id: IngredientId
    canonical: LocaleMap
    aliases: LocaleMap[]
}

export function listIngredientsForPicker(): IngredientOption[] {
    const idRows = db.select({ id: ingredients.id }).from(ingredients).all()
    const ids = idRows.map((r) => r.id)
    if (ids.length === 0) return []
    const canonicalLinks = db
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
    const canonicalByGroup = readAllLocalesByGroup(
        canonicalLinks.map((l) => l.groupId),
    )
    const canonicalByIngredient = new Map<IngredientId, LocaleMap>()
    for (const l of canonicalLinks) {
        const locales = canonicalByGroup.get(l.groupId)
        if (locales) canonicalByIngredient.set(l.ingredientId, locales)
    }
    const aliasLinks = db
        .select({
            ingredientId: ingredientsAliases.ingredientId,
            groupId: ingredientsAliases.translatedStringId,
        })
        .from(ingredientsAliases)
        .where(inArray(ingredientsAliases.ingredientId, ids))
        .all()
    const aliasByGroup = readAllLocalesByGroup(aliasLinks.map((l) => l.groupId))
    const aliasesByIngredient = new Map<IngredientId, LocaleMap[]>()
    for (const l of aliasLinks) {
        const text = aliasByGroup.get(l.groupId) ?? {}
        const list = aliasesByIngredient.get(l.ingredientId) ?? []
        list.push(text)
        aliasesByIngredient.set(l.ingredientId, list)
    }
    const out: IngredientOption[] = idRows.map((r) => ({
        id: r.id,
        canonical: canonicalByIngredient.get(r.id) ?? {},
        aliases: aliasesByIngredient.get(r.id) ?? [],
    }))
    out.sort((a, b) => compareByTitle(a.canonical, b.canonical))
    return out
}
