import type { RecipeId } from '@/db/ids'
import type { RecipeDetail } from './queries'

export type RolledUpRecipe = {
    id: RecipeId
    titleDe: string | null
    titleEn: string | null
    ownIngredients: RecipeDetail['ingredients']
    ownSteps: RecipeDetail['steps']
    ownActiveTimeMinutes: number
    ownWaitTimeMinutes: number
    components: RolledUpRecipe[]
    totalActiveTimeMinutes: number
    totalWaitTimeMinutes: number
}

export function flattenSections(recipe: RolledUpRecipe): RolledUpRecipe[] {
    const out: RolledUpRecipe[] = []
    for (const c of recipe.components) {
        out.push(...flattenSections(c))
    }
    out.push(recipe)
    return out
}
