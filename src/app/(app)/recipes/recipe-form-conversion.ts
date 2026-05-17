import { asCuisineKey, parseCuisineKey } from '@/db/ids'
import { type LocaleMap, SUPPORTED_LOCALES } from '@/i18n/locale'
import type { SynthesizedRecipe } from '@/llm/recipe-synthesis'
import type { RecipeFormInitial } from './RecipeForm'

export function synthesizedToFormInitial(
    recipe: SynthesizedRecipe,
): RecipeFormInitial {
    return {
        id: null,
        title: recipe.title,
        notes: recipe.notes,
        cuisineKey: parseCuisineKey(recipe.cuisineKey) ?? asCuisineKey('other'),
        activeTimeMinutes: String(recipe.activeTimeMinutes),
        waitTimeMinutes:
            recipe.waitTimeMinutes === 0 ? '' : String(recipe.waitTimeMinutes),
        isCompleteMeal: recipe.isCompleteMeal,
        formServings: recipe.intendedServings,
        ingredients: recipe.ingredients.map((ing) => ({
            amount: ing.amount === null ? '' : String(ing.amount),
            unit: ing.unit ?? '',
            name: ing.name,
            ingredientId: null,
        })),
        steps: recipe.steps.map((step) => ({ id: null, text: step.text })),
        components: [],
    }
}

function localeMapEquals(a: LocaleMap, b: LocaleMap): boolean {
    for (const locale of SUPPORTED_LOCALES) {
        if ((a[locale] ?? '') !== (b[locale] ?? '')) return false
    }
    return true
}

export type ChangedFields = {
    title: boolean
    notes: boolean
    cuisineKey: boolean
    activeTimeMinutes: boolean
    waitTimeMinutes: boolean
    formServings: boolean
    ingredients: Set<number>
    steps: Set<number>
}

export function emptyChangedFields(): ChangedFields {
    return {
        title: false,
        notes: false,
        cuisineKey: false,
        activeTimeMinutes: false,
        waitTimeMinutes: false,
        formServings: false,
        ingredients: new Set(),
        steps: new Set(),
    }
}

export function diffFormInitial(
    previous: RecipeFormInitial,
    next: RecipeFormInitial,
): ChangedFields {
    const changed = emptyChangedFields()
    changed.title = !localeMapEquals(previous.title, next.title)
    changed.notes = !localeMapEquals(previous.notes, next.notes)
    changed.cuisineKey = previous.cuisineKey !== next.cuisineKey
    changed.activeTimeMinutes =
        previous.activeTimeMinutes !== next.activeTimeMinutes
    changed.waitTimeMinutes = previous.waitTimeMinutes !== next.waitTimeMinutes
    changed.formServings = previous.formServings !== next.formServings
    const ingredientLen = Math.max(
        previous.ingredients.length,
        next.ingredients.length,
    )
    for (let i = 0; i < ingredientLen; i++) {
        const a = previous.ingredients[i]
        const b = next.ingredients[i]
        if (
            !a ||
            !b ||
            a.amount !== b.amount ||
            a.unit !== b.unit ||
            a.name !== b.name
        ) {
            changed.ingredients.add(i)
        }
    }
    const stepLen = Math.max(previous.steps.length, next.steps.length)
    for (let i = 0; i < stepLen; i++) {
        const a = previous.steps[i]
        const b = next.steps[i]
        if (!a || !b || !localeMapEquals(a.text, b.text)) {
            changed.steps.add(i)
        }
    }
    return changed
}
