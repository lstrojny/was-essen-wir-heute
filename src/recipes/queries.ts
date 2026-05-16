import { asc, eq, like, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import type {
    CuisineKey,
    IngredientId,
    RecipeId,
    RecipeIngredientId,
    RecipeStepId,
} from '@/db/ids'
import {
    centralIngredientAliases,
    centralIngredients,
    cuisines,
    recipeIngredients,
    recipeSteps,
    recipes,
} from '@/db/schema'

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
    }
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
