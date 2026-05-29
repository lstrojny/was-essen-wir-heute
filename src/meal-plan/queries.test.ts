import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import {
    type CuisineKey,
    newRecipeComponentId,
    newRecipeIngredientId,
    newRecipeRatingId,
} from '@/db/ids'
import { recipeComponents, recipeIngredients, recipeRatings } from '@/db/schema'
import { resetDb } from '@/test/db'
import {
    makeIngredient,
    makeMealPlanEntry,
    makeRecipe,
    makeUser,
    setMealPlanWindow,
} from '@/test/fixtures'
import { writeIngredientCanonical } from '@/ingredients/translation-writes'
import { asIsoDate } from './dates'
import {
    findEntryByDate,
    lastEatenBefore,
    listCompleteMealsForPicker,
    listEntriesBetween,
    loadActiveWindowRows,
    loadCompleteMealCandidates,
    readMealPlanSettings,
    recipesEatenInWindow,
    resolveTitlesByIds,
} from './queries'
import { writeRecipeTranslationUnit } from '@/recipes/translation-writes'

beforeEach(() => {
    resetDb()
})

describe('readMealPlanSettings', () => {
    it('returns the migration-seeded row', () => {
        const s = readMealPlanSettings()
        expect(s.activeWindowStart).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(s.activeWindowEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(s.recentWindowWeeks).toBe(4)
    })

    it('reflects updates written via setMealPlanWindow', () => {
        setMealPlanWindow(asIsoDate('2026-05-22'), asIsoDate('2026-05-28'), 6)
        const s = readMealPlanSettings()
        expect(s.activeWindowStart).toBe('2026-05-22')
        expect(s.activeWindowEnd).toBe('2026-05-28')
        expect(s.recentWindowWeeks).toBe(6)
    })
})

describe('listEntriesBetween', () => {
    it('returns rows whose date falls in the inclusive range, sorted ascending', () => {
        const recipeId = makeRecipe()
        makeMealPlanEntry({ date: asIsoDate('2026-05-22'), recipeId })
        makeMealPlanEntry({ date: asIsoDate('2026-05-24'), recipeId })
        makeMealPlanEntry({ date: asIsoDate('2026-05-20'), recipeId })

        const result = listEntriesBetween(
            asIsoDate('2026-05-22'),
            asIsoDate('2026-05-24'),
        )
        expect(result.map((e) => e.date)).toEqual(['2026-05-22', '2026-05-24'])
    })

    it('returns an empty array when no entries fall in the range', () => {
        expect(
            listEntriesBetween(asIsoDate('2026-05-22'), asIsoDate('2026-05-28')),
        ).toEqual([])
    })
})

describe('findEntryByDate', () => {
    it('returns the entry for the date', () => {
        const recipeId = makeRecipe()
        makeMealPlanEntry({
            date: asIsoDate('2026-05-22'),
            recipeId,
            state: 'pinned',
        })
        const e = findEntryByDate(asIsoDate('2026-05-22'))
        expect(e?.recipeId).toBe(recipeId)
        expect(e?.state).toBe('pinned')
    })

    it('returns null when no entry exists for the date', () => {
        expect(findEntryByDate(asIsoDate('2026-05-22'))).toBeNull()
    })
})

describe('lastEatenBefore', () => {
    it('returns the most recent past date per recipe (strictly before)', () => {
        const a = makeRecipe()
        const b = makeRecipe()
        makeMealPlanEntry({ date: asIsoDate('2026-05-10'), recipeId: a })
        makeMealPlanEntry({ date: asIsoDate('2026-05-15'), recipeId: a })
        makeMealPlanEntry({ date: asIsoDate('2026-05-22'), recipeId: a }) // boundary
        makeMealPlanEntry({ date: asIsoDate('2026-05-12'), recipeId: b })

        const out = lastEatenBefore([a, b], asIsoDate('2026-05-22'))
        expect(out.get(a)).toBe('2026-05-15')
        expect(out.get(b)).toBe('2026-05-12')
    })

    it('omits recipes that have never been placed before the cutoff', () => {
        const a = makeRecipe()
        const b = makeRecipe()
        makeMealPlanEntry({ date: asIsoDate('2026-05-25'), recipeId: a })
        const out = lastEatenBefore([a, b], asIsoDate('2026-05-22'))
        expect(out.has(a)).toBe(false)
        expect(out.has(b)).toBe(false)
    })

    it('returns an empty map for an empty recipe list', () => {
        expect(lastEatenBefore([], asIsoDate('2026-05-22')).size).toBe(0)
    })
})

describe('recipesEatenInWindow', () => {
    it('returns recipes placed in the half-open [start, before) window', () => {
        const a = makeRecipe()
        const b = makeRecipe()
        makeMealPlanEntry({ date: asIsoDate('2026-04-20'), recipeId: a }) // before
        makeMealPlanEntry({ date: asIsoDate('2026-05-01'), recipeId: a }) // in
        makeMealPlanEntry({ date: asIsoDate('2026-05-10'), recipeId: b }) // in
        makeMealPlanEntry({ date: asIsoDate('2026-05-22'), recipeId: b }) // boundary excluded

        const out = recipesEatenInWindow(
            asIsoDate('2026-04-24'),
            asIsoDate('2026-05-22'),
        )
        expect(out.has(a)).toBe(true)
        expect(out.has(b)).toBe(true)
        expect(out.size).toBe(2)
    })

    it('deduplicates a recipe that appears on multiple in-window days', () => {
        const a = makeRecipe()
        makeMealPlanEntry({ date: asIsoDate('2026-05-01'), recipeId: a })
        makeMealPlanEntry({ date: asIsoDate('2026-05-02'), recipeId: a })
        const out = recipesEatenInWindow(
            asIsoDate('2026-05-01'),
            asIsoDate('2026-05-22'),
        )
        expect([...out]).toEqual([a])
    })
})

describe('loadCompleteMealCandidates', () => {
    it('returns only recipes flagged is_complete_meal', () => {
        const meal = makeRecipe({ isCompleteMeal: true })
        const side = makeRecipe({ isCompleteMeal: false })
        const ids = loadCompleteMealCandidates().map((c) => c.id)
        expect(ids).toContain(meal)
        expect(ids).not.toContain(side)
    })

    it('attaches title via the recipesTranslated chain', () => {
        const id = makeRecipe({ isCompleteMeal: true })
        writeRecipeTranslationUnit(id, 'title', {
            de: 'Spaghetti',
            en: 'Spaghetti',
        })
        const c = loadCompleteMealCandidates().find((x) => x.id === id)
        expect(c?.title).toEqual({ de: 'Spaghetti', en: 'Spaghetti' })
    })

    it('reports ratingAverage as null and ratingCount as 0 for unrated recipes', () => {
        const id = makeRecipe({ isCompleteMeal: true })
        const c = loadCompleteMealCandidates().find((x) => x.id === id)
        expect(c?.ratingAverage).toBeNull()
        expect(c?.ratingCount).toBe(0)
    })

    it('computes the rating aggregate from recipe_ratings rows', () => {
        const id = makeRecipe({ isCompleteMeal: true })
        const u1 = makeUser()
        const u2 = makeUser()
        db.insert(recipeRatings)
            .values({
                id: newRecipeRatingId(),
                recipeId: id,
                userId: u1,
                score: 5,
            })
            .run()
        db.insert(recipeRatings)
            .values({
                id: newRecipeRatingId(),
                recipeId: id,
                userId: u2,
                score: 3,
            })
            .run()
        const c = loadCompleteMealCandidates().find((x) => x.id === id)
        expect(c?.ratingAverage).toBe(4)
        expect(c?.ratingCount).toBe(2)
    })

    it('collects role-tagged ingredients used directly by the recipe', () => {
        const recipe = makeRecipe({ isCompleteMeal: true })
        const starch = makeIngredient({ role: 'starch' })
        const ignore = makeIngredient({ role: 'none' })
        db.insert(recipeIngredients)
            .values({
                id: newRecipeIngredientId(),
                recipeId: recipe,
                position: 0,
                name: 'Pasta',
                ingredientId: starch,
            })
            .run()
        db.insert(recipeIngredients)
            .values({
                id: newRecipeIngredientId(),
                recipeId: recipe,
                position: 1,
                name: 'Water',
                ingredientId: ignore,
            })
            .run()
        const c = loadCompleteMealCandidates().find((x) => x.id === recipe)
        expect(c?.rolesByIngredient.get(starch)).toBe('starch')
        expect(c?.rolesByIngredient.get(ignore)).toBeUndefined()
    })

    it('walks composite recipes to roll up role-tagged ingredients from components', () => {
        const parent = makeRecipe({ isCompleteMeal: true })
        const child = makeRecipe({ isCompleteMeal: false })
        db.insert(recipeComponents)
            .values({
                id: newRecipeComponentId(),
                parentRecipeId: parent,
                childRecipeId: child,
                position: 0,
            })
            .run()
        const protein = makeIngredient({ role: 'protein' })
        db.insert(recipeIngredients)
            .values({
                id: newRecipeIngredientId(),
                recipeId: child,
                position: 0,
                name: 'Tofu',
                ingredientId: protein,
            })
            .run()
        const c = loadCompleteMealCandidates().find((x) => x.id === parent)
        expect(c?.rolesByIngredient.get(protein)).toBe('protein')
    })
})

describe('resolveTitlesByIds', () => {
    it('returns an empty map for an empty input', () => {
        expect(resolveTitlesByIds([]).size).toBe(0)
    })

    it('returns titles for recipes that have a title group', () => {
        const a = makeRecipe()
        const b = makeRecipe()
        writeRecipeTranslationUnit(a, 'title', { de: 'A', en: 'A-en' })
        // b has no title
        const out = resolveTitlesByIds([a, b])
        expect(out.get(a)).toEqual({ de: 'A', en: 'A-en' })
        expect(out.has(b)).toBe(false)
    })
})

describe('loadActiveWindowRows', () => {
    it('emits one row per day in the active window with empty placeholders', () => {
        setMealPlanWindow(asIsoDate('2026-05-22'), asIsoDate('2026-05-24'))
        const { settings, rows } = loadActiveWindowRows()
        expect(settings.activeWindowStart).toBe('2026-05-22')
        expect(rows.map((r) => r.date)).toEqual([
            '2026-05-22',
            '2026-05-23',
            '2026-05-24',
        ])
        expect(rows.every((r) => r.state === 'empty')).toBe(true)
    })

    it('populates rows with title/cuisine/state for filled days', () => {
        setMealPlanWindow(asIsoDate('2026-05-22'), asIsoDate('2026-05-23'))
        const recipeId = makeRecipe({ cuisineKey: 'thai' as CuisineKey })
        writeRecipeTranslationUnit(recipeId, 'title', { de: 'Pad Thai' })
        makeMealPlanEntry({
            date: asIsoDate('2026-05-22'),
            recipeId,
            state: 'pinned',
        })
        const { rows } = loadActiveWindowRows()
        const filled = rows.find((r) => r.date === '2026-05-22')
        expect(filled?.state).toBe('pinned')
        expect(filled?.recipeId).toBe(recipeId)
        expect(filled?.title.de).toBe('Pad Thai')
        expect(filled?.cuisineKey).toBe('thai')
    })

    it('renders a cleared slot with state="cleared" and no recipe', () => {
        setMealPlanWindow(asIsoDate('2026-05-22'), asIsoDate('2026-05-22'))
        makeMealPlanEntry({
            date: asIsoDate('2026-05-22'),
            recipeId: null,
            state: 'cleared',
        })
        const { rows } = loadActiveWindowRows()
        expect(rows[0].state).toBe('cleared')
        expect(rows[0].recipeId).toBeNull()
        expect(rows[0].title).toEqual({})
    })
})

describe('listCompleteMealsForPicker', () => {
    it('returns the same rows as loadCompleteMealCandidates without the createdAt field', () => {
        const id = makeRecipe({ isCompleteMeal: true })
        writeRecipeTranslationUnit(id, 'title', { de: 'A' })
        const picker = listCompleteMealsForPicker()
        expect(picker).toHaveLength(1)
        expect(picker[0].id).toBe(id)
        expect(picker[0].title).toEqual({ de: 'A' })
        expect('createdAt' in picker[0]).toBe(false)
    })
})
