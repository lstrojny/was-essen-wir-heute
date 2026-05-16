import { z } from 'zod'

export const searchHitSchema = z.object({
    id: z.number().int(),
    title: z.string(),
    image: z.string().nullable().optional(),
})

export const searchResultSchema = z.object({
    results: z.array(searchHitSchema),
    totalResults: z.number().int().optional(),
    offset: z.number().int().optional(),
    number: z.number().int().optional(),
})

export type SearchHit = z.infer<typeof searchHitSchema>
export type SearchResult = z.infer<typeof searchResultSchema>

export const extendedIngredientSchema = z.object({
    id: z.number().int().nullable().optional(),
    name: z.string(),
    amount: z.number().nullable().optional(),
    unit: z.string().nullable().optional(),
    original: z.string().nullable().optional(),
})

export const analyzedInstructionStepSchema = z.object({
    number: z.number().int(),
    step: z.string(),
})

export const analyzedInstructionSchema = z.object({
    name: z.string().nullable().optional(),
    steps: z.array(analyzedInstructionStepSchema),
})

export const recipeDetailSchema = z.object({
    id: z.number().int(),
    title: z.string(),
    image: z.string().nullable().optional(),
    sourceUrl: z.string().nullable().optional(),
    servings: z.number().nullable().optional(),
    readyInMinutes: z.number().nullable().optional(),
    cookingMinutes: z.number().nullable().optional(),
    preparationMinutes: z.number().nullable().optional(),
    cuisines: z.array(z.string()).optional(),
    extendedIngredients: z.array(extendedIngredientSchema).optional(),
    analyzedInstructions: z.array(analyzedInstructionSchema).optional(),
})

export type RecipeDetail = z.infer<typeof recipeDetailSchema>

export type SpoonacularQuota = {
    used: number | null
    left: number | null
    request: number | null
}

export class QuotaExceededError extends Error {
    constructor() {
        super('Spoonacular quota exceeded')
        this.name = 'QuotaExceededError'
    }
}

export class NotFoundError extends Error {
    constructor() {
        super('Spoonacular resource not found')
        this.name = 'NotFoundError'
    }
}

export class TransientError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'TransientError'
    }
}

export class MalformedResponseError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'MalformedResponseError'
    }
}
