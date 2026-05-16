import { asCuisineKey, parseCuisineKey } from '@/db/ids'
import type { SynthesizedRecipe } from '@/llm/recipe-synthesis'
import type { RecipeFormInitial } from './RecipeForm'

export function synthesizedToFormInitial(
    recipe: SynthesizedRecipe,
): RecipeFormInitial {
    return {
        id: null,
        titleDe: recipe.titleDe,
        titleEn: recipe.titleEn,
        notesDe: recipe.notesDe ?? '',
        notesEn: recipe.notesEn ?? '',
        cuisineKey: parseCuisineKey(recipe.cuisineKey) ?? asCuisineKey('other'),
        activeTimeMinutes: String(recipe.activeTimeMinutes),
        waitTimeMinutes:
            recipe.waitTimeMinutes === 0 ? '' : String(recipe.waitTimeMinutes),
        formServings: recipe.intendedServings,
        ingredients: recipe.ingredients.map((ing) => ({
            amount: ing.amount === null ? '' : String(ing.amount),
            unit: ing.unit ?? '',
            name: ing.name,
            centralIngredientId: null,
        })),
        steps: recipe.steps.map((step) => ({
            textDe: step.textDe ?? '',
            textEn: step.textEn ?? '',
        })),
        components: [],
    }
}

export type FormFieldsSnapshot = {
    titleDe: string
    titleEn: string
    notesDe: string
    notesEn: string
    cuisineKey: string
    activeTimeMinutes: string
    waitTimeMinutes: string
    formServings: number
    ingredients: Array<{ amount: string; unit: string; name: string }>
    steps: Array<{ textDe: string; textEn: string }>
}

export function formSnapshotToSynthesized(
    snapshot: FormFieldsSnapshot,
): SynthesizedRecipe {
    return {
        titleDe: snapshot.titleDe,
        titleEn: snapshot.titleEn,
        notesDe: snapshot.notesDe || null,
        notesEn: snapshot.notesEn || null,
        cuisineKey: snapshot.cuisineKey || 'other',
        activeTimeMinutes: Number(snapshot.activeTimeMinutes) || 0,
        waitTimeMinutes: Number(snapshot.waitTimeMinutes) || 0,
        intendedServings: snapshot.formServings,
        ingredients: snapshot.ingredients.map((ing) => ({
            name: ing.name,
            amount:
                ing.amount === '' ? null : Number(ing.amount.replace(',', '.')),
            unit: ing.unit || null,
        })),
        steps: snapshot.steps.map((step) => ({
            textDe: step.textDe || null,
            textEn: step.textEn || null,
        })),
    }
}

export type ChangedFields = {
    titleDe: boolean
    titleEn: boolean
    notesDe: boolean
    notesEn: boolean
    cuisineKey: boolean
    activeTimeMinutes: boolean
    waitTimeMinutes: boolean
    formServings: boolean
    ingredients: Set<number>
    steps: Set<number>
}

export function emptyChangedFields(): ChangedFields {
    return {
        titleDe: false,
        titleEn: false,
        notesDe: false,
        notesEn: false,
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
    changed.titleDe = previous.titleDe !== next.titleDe
    changed.titleEn = previous.titleEn !== next.titleEn
    changed.notesDe = previous.notesDe !== next.notesDe
    changed.notesEn = previous.notesEn !== next.notesEn
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
        if (!a || !b || a.textDe !== b.textDe || a.textEn !== b.textEn) {
            changed.steps.add(i)
        }
    }
    return changed
}
