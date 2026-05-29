import { describe, expect, it } from 'vitest'
import type { RecipeDetail as SpoonacularRecipe } from '@/spoonacular/types'
import { spoonacularToFormInitial } from './spoonacular-import'

const base = (overrides: Partial<SpoonacularRecipe> = {}): SpoonacularRecipe => ({
    id: 1,
    title: 'Pasta',
    ...overrides,
})

describe('spoonacularToFormInitial', () => {
    it('uses title from the payload as the English form value', () => {
        const out = spoonacularToFormInitial(base({ title: 'Pad Thai' }))
        expect(out.title).toEqual({ en: 'Pad Thai' })
    })

    it('defaults cuisine to "other" (LLM enrichment will pick later)', () => {
        const out = spoonacularToFormInitial(base())
        expect(out.cuisineKey).toBe('other')
    })

    it('defaults servings to 1 when missing or non-positive', () => {
        expect(spoonacularToFormInitial(base()).formServings).toBe(1)
        expect(
            spoonacularToFormInitial(base({ servings: 0 })).formServings,
        ).toBe(1)
    })

    it('passes through positive servings', () => {
        expect(
            spoonacularToFormInitial(base({ servings: 4 })).formServings,
        ).toBe(4)
    })

    it('computes active time as cooking + preparation when both are present', () => {
        const out = spoonacularToFormInitial(
            base({ cookingMinutes: 15, preparationMinutes: 10 }),
        )
        expect(out.activeTimeMinutes).toBe('25')
    })

    it('falls back to readyInMinutes when prep/cook are missing', () => {
        const out = spoonacularToFormInitial(base({ readyInMinutes: 30 }))
        expect(out.activeTimeMinutes).toBe('30')
    })

    it('uses 0 when nothing is provided', () => {
        expect(spoonacularToFormInitial(base()).activeTimeMinutes).toBe('0')
    })

    it('rounds ingredient amounts to 3 decimal places and lowercases units', () => {
        const out = spoonacularToFormInitial(
            base({
                extendedIngredients: [
                    {
                        id: 1,
                        name: 'Sugar',
                        amount: 1.234567,
                        unit: 'TBSP',
                    },
                ],
            }),
        )
        expect(out.ingredients[0]).toMatchObject({
            amount: '1.235',
            unit: 'tbsp',
            name: 'Sugar',
        })
    })

    it('emits an empty string for ingredients with no amount', () => {
        const out = spoonacularToFormInitial(
            base({
                extendedIngredients: [
                    { id: 1, name: 'Salt', amount: null, unit: null },
                ],
            }),
        )
        expect(out.ingredients[0]).toMatchObject({
            amount: '',
            unit: '',
            name: 'Salt',
        })
    })

    it('flattens analyzedInstructions blocks into a single step list', () => {
        const out = spoonacularToFormInitial(
            base({
                analyzedInstructions: [
                    {
                        steps: [
                            { number: 1, step: 'Boil water' },
                            { number: 2, step: 'Add pasta' },
                        ],
                    },
                    {
                        steps: [{ number: 1, step: 'Sauce time' }],
                    },
                ],
            }),
        )
        expect(out.steps).toEqual([
            { id: null, text: { en: 'Boil water' } },
            { id: null, text: { en: 'Add pasta' } },
            { id: null, text: { en: 'Sauce time' } },
        ])
    })
})
