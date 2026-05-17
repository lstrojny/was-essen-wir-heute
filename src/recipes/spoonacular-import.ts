import type { RecipeFormInitial } from '@/app/(app)/recipes/RecipeForm'
import { asCuisineKey } from '@/db/ids'
import type { RecipeDetail as SpoonacularRecipe } from '@/spoonacular/types'

function computeActiveTime(detail: SpoonacularRecipe): number {
    const cook = detail.cookingMinutes ?? null
    const prep = detail.preparationMinutes ?? null
    if (cook !== null && prep !== null) {
        return Math.max(0, cook + prep)
    }
    if (detail.readyInMinutes !== null && detail.readyInMinutes !== undefined) {
        return Math.max(0, detail.readyInMinutes)
    }
    return 0
}

export function spoonacularToFormInitial(
    detail: SpoonacularRecipe,
): RecipeFormInitial {
    const servings =
        detail.servings && detail.servings > 0 ? detail.servings : 1
    const ingredients = (detail.extendedIngredients ?? []).map((ing) => {
        const amount = ing.amount ?? null
        return {
            amount:
                amount === null || amount === undefined
                    ? ''
                    : String(Math.round(amount * 1000) / 1000),
            unit: (ing.unit ?? '').toLowerCase(),
            name: ing.name,
            ingredientId: null,
        }
    })
    const steps = (detail.analyzedInstructions ?? []).flatMap((block) =>
        block.steps.map((s) => ({ textDe: '', textEn: s.step })),
    )
    return {
        id: null,
        titleDe: '',
        titleEn: detail.title,
        notesDe: '',
        notesEn: '',
        cuisineKey: asCuisineKey('other'),
        activeTimeMinutes: String(computeActiveTime(detail)),
        waitTimeMinutes: '',
        isCompleteMeal: false,
        formServings: servings,
        ingredients,
        steps,
        components: [],
    }
}
