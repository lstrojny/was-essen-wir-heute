/**
 * Minimal test fixtures for the DB harness. Each helper returns the inserted
 * row's id (or the row itself) so callers can chain further setup.
 */
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import {
    asCuisineKey,
    type CuisineKey,
    type IngredientId,
    type MealPlanEntryId,
    newIngredientId,
    newMealPlanEntryId,
    newRecipeId,
    newUserId,
    type RecipeId,
    type UserId,
} from '@/db/ids'
import {
    ingredients,
    mealPlanEntries,
    mealPlanSettings,
    recipes,
    users,
} from '@/db/schema'
import type { IsoDate } from '@/meal-plan/dates'

export const DEFAULT_CUISINE: CuisineKey = asCuisineKey('italian')

export type MakeRecipeOpts = {
    cuisineKey?: CuisineKey
    activeTimeMinutes?: number
    waitTimeMinutes?: number
    isCompleteMeal?: boolean
    source?: 'manual' | 'spoonacular' | 'llm-chat'
}

export function makeRecipe(opts: MakeRecipeOpts = {}): RecipeId {
    const id = newRecipeId()
    db.insert(recipes)
        .values({
            id,
            cuisineKey: opts.cuisineKey ?? DEFAULT_CUISINE,
            activeTimeMinutes: opts.activeTimeMinutes ?? 20,
            waitTimeMinutes: opts.waitTimeMinutes ?? 0,
            isCompleteMeal: opts.isCompleteMeal ?? true,
            source: opts.source ?? 'manual',
        })
        .run()
    return id
}

export type MakeIngredientOpts = {
    role?: 'starch' | 'vegetable' | 'protein' | 'none'
    density?: number | null
    notes?: string | null
}

export function makeIngredient(opts: MakeIngredientOpts = {}): IngredientId {
    const id = newIngredientId()
    db.insert(ingredients)
        .values({
            id,
            role: opts.role ?? 'vegetable',
            density: opts.density ?? null,
            notes: opts.notes ?? null,
        })
        .run()
    return id
}

export type MakeUserOpts = {
    email?: string
    displayName?: string
    role?: 'admin' | 'user'
    language?: 'de' | 'en'
}

let userSeq = 0
export function makeUser(opts: MakeUserOpts = {}): UserId {
    const id = newUserId()
    db.insert(users)
        .values({
            id,
            email: opts.email ?? `test-${++userSeq}@example.test`,
            displayName: opts.displayName ?? `Test User ${userSeq}`,
            passwordHash: 'placeholder',
            role: opts.role ?? 'user',
            language: opts.language ?? 'de',
        })
        .run()
    return id
}

export type MakeMealPlanEntryOpts = {
    date: IsoDate
    recipeId?: RecipeId | null
    state?: 'suggested' | 'edited' | 'pinned' | 'cleared'
}

export function makeMealPlanEntry(opts: MakeMealPlanEntryOpts): MealPlanEntryId {
    const id = newMealPlanEntryId()
    db.insert(mealPlanEntries)
        .values({
            id,
            date: opts.date,
            recipeId: opts.recipeId ?? null,
            state: opts.state ?? 'suggested',
        })
        .run()
    return id
}

export function setMealPlanWindow(
    activeWindowStart: IsoDate,
    activeWindowEnd: IsoDate,
    recentWindowWeeks = 4,
): void {
    db.update(mealPlanSettings)
        .set({ activeWindowStart, activeWindowEnd, recentWindowWeeks })
        .where(eq(mealPlanSettings.id, 1))
        .run()
}
