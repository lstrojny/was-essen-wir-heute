import { asc, eq, inArray, like, ne, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import type {
    CuisineKey,
    IngredientId,
    RecipeComponentId,
    RecipeId,
    RecipeIngredientId,
    RecipeStepId,
} from '@/db/ids'
import {
    centralIngredientAliases,
    centralIngredients,
    cuisines,
    recipeComponents,
    recipeIngredients,
    recipeSteps,
    recipes,
} from '@/db/schema'
import type { RolledUpRecipe } from './rollup'

export type CuisineRow = {
    key: CuisineKey
    labelDe: string
    labelEn: string
}

export function listCuisines(): CuisineRow[] {
    return db
        .select({
            key: cuisines.key,
            labelDe: cuisines.labelDe,
            labelEn: cuisines.labelEn,
        })
        .from(cuisines)
        .orderBy(asc(cuisines.key))
        .all()
}

export type RecipeListRow = {
    id: RecipeId
    titleDe: string | null
    titleEn: string | null
    cuisineKey: CuisineKey
    activeTimeMinutes: number
    waitTimeMinutes: number
}

export function listRecipes(
    search: string,
    cuisineKey: CuisineKey | null,
): RecipeListRow[] {
    const trimmed = search.trim()
    const pattern = `%${trimmed.toLowerCase()}%`
    const base = db
        .select({
            id: recipes.id,
            titleDe: recipes.titleDe,
            titleEn: recipes.titleEn,
            cuisineKey: recipes.cuisineKey,
            activeTimeMinutes: recipes.activeTimeMinutes,
            waitTimeMinutes: recipes.waitTimeMinutes,
        })
        .from(recipes)
    const conditions = []
    if (trimmed) {
        conditions.push(
            or(
                like(sql`lower(${recipes.titleDe})`, pattern),
                like(sql`lower(${recipes.titleEn})`, pattern),
            ),
        )
    }
    if (cuisineKey) {
        conditions.push(eq(recipes.cuisineKey, cuisineKey))
    }
    const query =
        conditions.length === 0
            ? base
            : base.where(
                  conditions.length === 1
                      ? conditions[0]
                      : sql.join(conditions, sql` AND `),
              )
    return query.orderBy(asc(recipes.titleEn), asc(recipes.titleDe)).all()
}

export type RecipeIngredientRow = {
    id: RecipeIngredientId
    position: number
    amount: number | null
    unit: string | null
    name: string
    centralIngredientId: IngredientId | null
}

export type RecipeStepRow = {
    id: RecipeStepId
    position: number
    textDe: string | null
    textEn: string | null
}

export type RecipeComponentRow = {
    id: RecipeComponentId
    position: number
    childRecipeId: RecipeId
    childTitleDe: string | null
    childTitleEn: string | null
}

export type RecipeDetail = {
    id: RecipeId
    titleDe: string | null
    titleEn: string | null
    notesDe: string | null
    notesEn: string | null
    cuisineKey: CuisineKey
    activeTimeMinutes: number
    waitTimeMinutes: number
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
            centralIngredientId: recipeIngredients.centralIngredientId,
        })
        .from(recipeIngredients)
        .where(eq(recipeIngredients.recipeId, id))
        .orderBy(asc(recipeIngredients.position))
        .all()
    const steps = db
        .select({
            id: recipeSteps.id,
            position: recipeSteps.position,
            textDe: recipeSteps.textDe,
            textEn: recipeSteps.textEn,
        })
        .from(recipeSteps)
        .where(eq(recipeSteps.recipeId, id))
        .orderBy(asc(recipeSteps.position))
        .all()
    const components = db
        .select({
            id: recipeComponents.id,
            position: recipeComponents.position,
            childRecipeId: recipeComponents.childRecipeId,
            childTitleDe: recipes.titleDe,
            childTitleEn: recipes.titleEn,
        })
        .from(recipeComponents)
        .innerJoin(recipes, eq(recipeComponents.childRecipeId, recipes.id))
        .where(eq(recipeComponents.parentRecipeId, id))
        .orderBy(asc(recipeComponents.position))
        .all()
    return {
        id: row.id,
        titleDe: row.titleDe,
        titleEn: row.titleEn,
        notesDe: row.notesDe,
        notesEn: row.notesEn,
        cuisineKey: row.cuisineKey,
        activeTimeMinutes: row.activeTimeMinutes,
        waitTimeMinutes: row.waitTimeMinutes,
        source: row.source,
        sourceIdentifier: row.sourceIdentifier,
        ingredients,
        steps,
        components,
    }
}

export type RecipePickerRow = {
    id: RecipeId
    titleDe: string | null
    titleEn: string | null
}

export function listRecipesForComponentPicker(
    excludeId: RecipeId | null,
): RecipePickerRow[] {
    const base = db
        .select({
            id: recipes.id,
            titleDe: recipes.titleDe,
            titleEn: recipes.titleEn,
        })
        .from(recipes)
    const query = excludeId ? base.where(ne(recipes.id, excludeId)) : base
    return query.orderBy(asc(recipes.titleEn), asc(recipes.titleDe)).all()
}

export type ParentRecipeRef = {
    id: RecipeId
    titleDe: string | null
    titleEn: string | null
}

export function findRecipesReferencing(childId: RecipeId): ParentRecipeRef[] {
    return db
        .select({
            id: recipes.id,
            titleDe: recipes.titleDe,
            titleEn: recipes.titleEn,
        })
        .from(recipeComponents)
        .innerJoin(recipes, eq(recipeComponents.parentRecipeId, recipes.id))
        .where(eq(recipeComponents.childRecipeId, childId))
        .orderBy(asc(recipes.titleEn), asc(recipes.titleDe))
        .all()
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
        titleDe: detail.titleDe,
        titleEn: detail.titleEn,
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
    titleDe: string | null
    titleEn: string | null
    cuisineKey: CuisineKey
}

export function findRecipesUsingIngredient(
    ingredientId: IngredientId,
): RecipeUsingIngredient[] {
    return db
        .selectDistinct({
            id: recipes.id,
            titleDe: recipes.titleDe,
            titleEn: recipes.titleEn,
            cuisineKey: recipes.cuisineKey,
        })
        .from(recipes)
        .innerJoin(
            recipeIngredients,
            eq(recipeIngredients.recipeId, recipes.id),
        )
        .where(eq(recipeIngredients.centralIngredientId, ingredientId))
        .orderBy(asc(recipes.titleEn), asc(recipes.titleDe))
        .all()
}

export function findCentralIngredientByName(name: string): IngredientId | null {
    const lowered = name.trim().toLowerCase()
    if (!lowered) return null
    const canonicalMatch = db
        .select({ id: centralIngredients.id })
        .from(centralIngredients)
        .where(
            or(
                eq(sql`lower(${centralIngredients.canonicalDe})`, lowered),
                eq(sql`lower(${centralIngredients.canonicalEn})`, lowered),
            ),
        )
        .get()
    if (canonicalMatch) {
        return canonicalMatch.id
    }
    const aliasMatch = db
        .select({ id: centralIngredientAliases.centralIngredientId })
        .from(centralIngredientAliases)
        .where(eq(sql`lower(${centralIngredientAliases.alias})`, lowered))
        .get()
    return aliasMatch?.id ?? null
}

export type CentralIngredientOption = {
    id: IngredientId
    canonicalDe: string | null
    canonicalEn: string | null
    aliases: string[]
}

export function listCentralIngredientsForPicker(): CentralIngredientOption[] {
    const rows = db
        .select({
            id: centralIngredients.id,
            canonicalDe: centralIngredients.canonicalDe,
            canonicalEn: centralIngredients.canonicalEn,
        })
        .from(centralIngredients)
        .orderBy(
            asc(centralIngredients.canonicalEn),
            asc(centralIngredients.canonicalDe),
        )
        .all()
    const aliasRows = db
        .select({
            centralIngredientId: centralIngredientAliases.centralIngredientId,
            alias: centralIngredientAliases.alias,
        })
        .from(centralIngredientAliases)
        .all()
    const aliasMap = new Map<IngredientId, string[]>()
    for (const a of aliasRows) {
        const list = aliasMap.get(a.centralIngredientId) ?? []
        list.push(a.alias)
        aliasMap.set(a.centralIngredientId, list)
    }
    return rows.map((r) => ({
        ...r,
        aliases: aliasMap.get(r.id) ?? [],
    }))
}
