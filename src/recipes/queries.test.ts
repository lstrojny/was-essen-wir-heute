import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import {
    type CuisineKey,
    newRecipeComponentId,
    newRecipeId,
    newRecipeIngredientId,
    newRecipeRatingId,
    newRecipeStepId,
} from '@/db/ids'
import {
    recipeComponents,
    recipeIngredients,
    recipeRatings,
    recipeSteps,
} from '@/db/schema'
import { writeIngredientCanonical } from '@/ingredients/translation-writes'
import { resetDb } from '@/test/db'
import { makeIngredient, makeRecipe, makeUser } from '@/test/fixtures'
import {
    findDirectChildrenForMany,
    findRecipesReferencing,
    findRecipesUsingIngredient,
    getMyRatingForRecipe,
    getRatingAggregateForRecipe,
    getRatingAggregatesForRecipes,
    getRecipe,
    getRolledUpRecipe,
    listCuisines,
    listCuisinesAllLocales,
    listIngredientsForPicker,
    listRatingsForRecipe,
    listRecipes,
    listRecipesForComponentPicker,
} from './queries'
import {
    writeRecipeStepTranslation,
    writeRecipeTranslationUnit,
} from './translation-writes'

beforeEach(() => {
    resetDb()
})

describe('listCuisines (reads the migration-seeded reference data)', () => {
    it('returns one row per seeded cuisine', () => {
        const de = listCuisines('de')
        expect(de.length).toBeGreaterThanOrEqual(15)
    })

    it('contains the v1 starter set documented in the persistence spec', () => {
        const keys = listCuisines('en').map((c) => c.key)
        for (const expected of [
            'italian',
            'thai',
            'german',
            'french',
            'mexican',
            'indian',
            'american',
            'mediterranean',
            'japanese',
            'chinese',
            'greek',
            'spanish',
            'middle-eastern',
            'vietnamese',
            'other',
            'korean', // added in migration 0004
        ]) {
            expect(keys).toContain(expected)
        }
    })

    it('returns rows sorted ascending by cuisine key', () => {
        const keys = listCuisines('de').map((c) => c.key)
        const sorted = [...keys].sort()
        expect(keys).toEqual(sorted)
    })

    it('resolves the label in the requested locale without a fallback', () => {
        const de = listCuisines('de')
        const italian = de.find((c) => c.key === 'italian')
        expect(italian?.label).toBe('Italienisch')
        expect(italian?.isFallback).toBe(false)
    })

    it('returns the English label for the en locale', () => {
        const en = listCuisines('en')
        const italian = en.find((c) => c.key === 'italian')
        expect(italian?.label).toBe('Italian')
        expect(italian?.isFallback).toBe(false)
    })
})

describe('listCuisinesAllLocales', () => {
    it('returns a label map per cuisine with both locales populated', () => {
        const rows = listCuisinesAllLocales()
        const italian = rows.find((r) => r.key === 'italian')
        expect(italian?.label).toEqual({
            de: 'Italienisch',
            en: 'Italian',
        })
    })

    it('returns the same row count as listCuisines', () => {
        expect(listCuisinesAllLocales().length).toBe(listCuisines('de').length)
    })
})

describe('listRecipes', () => {
    it('returns an empty array when no recipes exist', () => {
        expect(listRecipes('', null, false)).toEqual([])
    })

    it('sorts rows by German title', () => {
        const a = makeRecipe()
        const b = makeRecipe()
        const c = makeRecipe()
        writeRecipeTranslationUnit(a, 'title', { de: 'Zucchini' })
        writeRecipeTranslationUnit(b, 'title', { de: 'Apfelkuchen' })
        writeRecipeTranslationUnit(c, 'title', { de: 'Möhrensuppe' })
        const titles = listRecipes('', null, false).map((r) => r.title.de)
        expect(titles).toEqual(['Apfelkuchen', 'Möhrensuppe', 'Zucchini'])
    })

    it('filters by folded title substring', () => {
        const a = makeRecipe()
        const b = makeRecipe()
        writeRecipeTranslationUnit(a, 'title', { de: 'Apfelkuchen' })
        writeRecipeTranslationUnit(b, 'title', { de: 'Spaghetti' })
        const ids = listRecipes('apfel', null, false).map((r) => r.id)
        expect(ids).toEqual([a])
    })

    it('filters by cuisine key', () => {
        const ita = makeRecipe({ cuisineKey: 'italian' as CuisineKey })
        const thai = makeRecipe({ cuisineKey: 'thai' as CuisineKey })
        const result = listRecipes('', 'italian' as CuisineKey, false).map(
            (r) => r.id,
        )
        expect(result).toContain(ita)
        expect(result).not.toContain(thai)
    })

    it('filters to complete-meal recipes when completeOnly is true', () => {
        const meal = makeRecipe({ isCompleteMeal: true })
        const side = makeRecipe({ isCompleteMeal: false })
        const ids = listRecipes('', null, true).map((r) => r.id)
        expect(ids).toContain(meal)
        expect(ids).not.toContain(side)
    })

    it('reports rating average/count and the viewer’s personal rating', () => {
        const recipe = makeRecipe()
        const me = makeUser()
        const peer = makeUser()
        db.insert(recipeRatings)
            .values({
                id: newRecipeRatingId(),
                recipeId: recipe,
                userId: me,
                score: 5,
            })
            .run()
        db.insert(recipeRatings)
            .values({
                id: newRecipeRatingId(),
                recipeId: recipe,
                userId: peer,
                score: 3,
            })
            .run()
        const result = listRecipes('', null, false, me)[0]
        expect(result.ratingAverage).toBe(4)
        expect(result.ratingCount).toBe(2)
        expect(result.myRating).toBe(5)
    })
})

describe('getRatingAggregatesForRecipes / getRatingAggregateForRecipe', () => {
    it('returns null/0 for unrated recipes when looked up individually', () => {
        const r = makeRecipe()
        expect(getRatingAggregateForRecipe(r)).toEqual({
            average: null,
            count: 0,
        })
    })

    it('aggregates across many users in a single round-trip', () => {
        const r1 = makeRecipe()
        const r2 = makeRecipe()
        const u1 = makeUser()
        const u2 = makeUser()
        db.insert(recipeRatings)
            .values({
                id: newRecipeRatingId(),
                recipeId: r1,
                userId: u1,
                score: 4,
            })
            .run()
        db.insert(recipeRatings)
            .values({
                id: newRecipeRatingId(),
                recipeId: r1,
                userId: u2,
                score: 2,
            })
            .run()
        db.insert(recipeRatings)
            .values({
                id: newRecipeRatingId(),
                recipeId: r2,
                userId: u1,
                score: 5,
            })
            .run()
        const out = getRatingAggregatesForRecipes([r1, r2])
        expect(out.get(r1)).toEqual({ average: 3, count: 2 })
        expect(out.get(r2)).toEqual({ average: 5, count: 1 })
    })

    it('returns an empty map for an empty id list', () => {
        expect(getRatingAggregatesForRecipes([]).size).toBe(0)
    })
})

describe('listRatingsForRecipe', () => {
    it('returns one row per rater with the rater’s display name, sorted A–Z', () => {
        const recipe = makeRecipe()
        const alice = makeUser({ displayName: 'Alice' })
        const bob = makeUser({ displayName: 'Bob' })
        db.insert(recipeRatings)
            .values({
                id: newRecipeRatingId(),
                recipeId: recipe,
                userId: bob,
                score: 3,
            })
            .run()
        db.insert(recipeRatings)
            .values({
                id: newRecipeRatingId(),
                recipeId: recipe,
                userId: alice,
                score: 5,
            })
            .run()
        const rows = listRatingsForRecipe(recipe)
        expect(rows.map((r) => r.displayName)).toEqual(['Alice', 'Bob'])
        expect(rows[0].score).toBe(5)
    })
})

describe('getMyRatingForRecipe', () => {
    it('returns the score when present', () => {
        const recipe = makeRecipe()
        const user = makeUser()
        db.insert(recipeRatings)
            .values({
                id: newRecipeRatingId(),
                recipeId: recipe,
                userId: user,
                score: 4,
            })
            .run()
        expect(getMyRatingForRecipe(recipe, user)).toBe(4)
    })

    it('returns null when this user has not rated the recipe', () => {
        expect(
            getMyRatingForRecipe(makeRecipe(), makeUser()),
        ).toBeNull()
    })
})

describe('getRecipe', () => {
    it('returns null for an unknown id', () => {
        expect(getRecipe(newRecipeId())).toBeNull()
    })

    it('returns full detail with translated title, notes, ingredients, steps, components', () => {
        const recipe = makeRecipe({
            activeTimeMinutes: 30,
            waitTimeMinutes: 10,
        })
        writeRecipeTranslationUnit(recipe, 'title', { de: 'Pasta' })
        writeRecipeTranslationUnit(recipe, 'notes', { de: 'Mit Liebe.' })

        const stepA = newRecipeStepId()
        const stepB = newRecipeStepId()
        db.insert(recipeSteps)
            .values({ id: stepA, recipeId: recipe, position: 0 })
            .run()
        db.insert(recipeSteps)
            .values({ id: stepB, recipeId: recipe, position: 1 })
            .run()
        writeRecipeStepTranslation(stepA, { de: 'Wasser kochen.' })
        writeRecipeStepTranslation(stepB, { de: 'Pasta hinein.' })

        const ingredient = makeIngredient({ role: 'starch' })
        writeIngredientCanonical(ingredient, { de: 'Pasta' })
        db.insert(recipeIngredients)
            .values({
                id: newRecipeIngredientId(),
                recipeId: recipe,
                position: 0,
                name: 'Pasta',
                ingredientId: ingredient,
                amount: 200,
                unit: 'g',
            })
            .run()

        const child = makeRecipe()
        writeRecipeTranslationUnit(child, 'title', { de: 'Sosse' })
        db.insert(recipeComponents)
            .values({
                id: newRecipeComponentId(),
                parentRecipeId: recipe,
                childRecipeId: child,
                position: 0,
            })
            .run()

        const detail = getRecipe(recipe)!
        expect(detail.title.de).toBe('Pasta')
        expect(detail.notes.de).toBe('Mit Liebe.')
        expect(detail.activeTimeMinutes).toBe(30)
        expect(detail.waitTimeMinutes).toBe(10)
        expect(detail.steps.map((s) => s.text.de)).toEqual([
            'Wasser kochen.',
            'Pasta hinein.',
        ])
        expect(detail.ingredients).toHaveLength(1)
        expect(detail.ingredients[0].name).toBe('Pasta')
        expect(detail.components).toHaveLength(1)
        expect(detail.components[0].childTitle.de).toBe('Sosse')
    })

    it('orders ingredients and steps by position', () => {
        const recipe = makeRecipe()
        for (const position of [2, 0, 1]) {
            db.insert(recipeIngredients)
                .values({
                    id: newRecipeIngredientId(),
                    recipeId: recipe,
                    position,
                    name: `ing-${position}`,
                    ingredientId: null,
                })
                .run()
        }
        const detail = getRecipe(recipe)!
        expect(detail.ingredients.map((i) => i.position)).toEqual([0, 1, 2])
    })
})

describe('listRecipesForComponentPicker', () => {
    it('excludes the candidate id when one is provided', () => {
        const a = makeRecipe()
        const b = makeRecipe()
        const ids = listRecipesForComponentPicker(a).map((r) => r.id)
        expect(ids).toContain(b)
        expect(ids).not.toContain(a)
    })

    it('includes every recipe when no exclusion is given', () => {
        const a = makeRecipe()
        const b = makeRecipe()
        const ids = listRecipesForComponentPicker(null).map((r) => r.id)
        expect(ids).toContain(a)
        expect(ids).toContain(b)
    })
})

describe('findRecipesReferencing', () => {
    it('returns parents that reference the given child via recipe_components', () => {
        const child = makeRecipe()
        const parentA = makeRecipe()
        const parentB = makeRecipe()
        for (const p of [parentA, parentB]) {
            db.insert(recipeComponents)
                .values({
                    id: newRecipeComponentId(),
                    parentRecipeId: p,
                    childRecipeId: child,
                    position: 0,
                })
                .run()
        }
        const refs = findRecipesReferencing(child).map((r) => r.id)
        expect(refs.sort()).toEqual([parentA, parentB].sort())
    })

    it('returns empty when no parent references the child', () => {
        expect(findRecipesReferencing(makeRecipe())).toEqual([])
    })
})

describe('findDirectChildrenForMany', () => {
    it('returns child ids for the provided parents', () => {
        const parent = makeRecipe()
        const child = makeRecipe()
        db.insert(recipeComponents)
            .values({
                id: newRecipeComponentId(),
                parentRecipeId: parent,
                childRecipeId: child,
                position: 0,
            })
            .run()
        expect(findDirectChildrenForMany([parent])).toEqual([child])
    })

    it('returns empty for an empty parent list', () => {
        expect(findDirectChildrenForMany([])).toEqual([])
    })
})

describe('getRolledUpRecipe', () => {
    it('sums active time across components and takes the max wait time', () => {
        const child = makeRecipe({
            activeTimeMinutes: 10,
            waitTimeMinutes: 20,
        })
        const parent = makeRecipe({
            activeTimeMinutes: 30,
            waitTimeMinutes: 5,
        })
        db.insert(recipeComponents)
            .values({
                id: newRecipeComponentId(),
                parentRecipeId: parent,
                childRecipeId: child,
                position: 0,
            })
            .run()
        const rolled = getRolledUpRecipe(parent)!
        expect(rolled.totalActiveTimeMinutes).toBe(40)
        expect(rolled.totalWaitTimeMinutes).toBe(20)
    })

    it('returns null for an unknown recipe id', () => {
        expect(getRolledUpRecipe(newRecipeId())).toBeNull()
    })
})

describe('findRecipesUsingIngredient', () => {
    it('returns recipes that reference the ingredient, deduped, sorted by title', () => {
        const ing = makeIngredient()
        const a = makeRecipe()
        const b = makeRecipe()
        writeRecipeTranslationUnit(a, 'title', { de: 'Bravo' })
        writeRecipeTranslationUnit(b, 'title', { de: 'Alpha' })
        for (const r of [a, b, a]) {
            // recipe `a` gets two ingredient rows — selectDistinct dedupes
            db.insert(recipeIngredients)
                .values({
                    id: newRecipeIngredientId(),
                    recipeId: r,
                    position: r === a ? Math.random() * 1e9 : 0,
                    name: 'x',
                    ingredientId: ing,
                })
                .run()
        }
        const ids = findRecipesUsingIngredient(ing).map((r) => r.id)
        expect(ids).toEqual([b, a])
    })

    it('returns empty when the ingredient is unreferenced', () => {
        expect(findRecipesUsingIngredient(makeIngredient())).toEqual([])
    })
})

describe('listIngredientsForPicker', () => {
    it('returns an empty array when the catalog is empty', () => {
        expect(listIngredientsForPicker()).toEqual([])
    })

    it('returns one entry per ingredient with canonical and aliases', () => {
        const id = makeIngredient()
        writeIngredientCanonical(id, { de: 'Apfel' })
        const options = listIngredientsForPicker()
        const ours = options.find((o) => o.id === id)
        expect(ours?.canonical).toEqual({ de: 'Apfel' })
    })
})

