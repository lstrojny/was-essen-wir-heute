import { tool } from 'ai'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { SessionUser } from '@/auth/session'
import { db } from '@/db'
import {
    type CuisineKey,
    type IngredientId,
    parseCuisineKey,
    parseIngredientId,
    parseRecipeId,
    type RecipeId,
} from '@/db/ids'
import {
    ingredientAliases,
    ingredientCountUnits,
    ingredients as ingredientsTable,
    recipeComponents,
    recipeIngredients,
    recipeRatings,
    recipeSteps,
    recipes,
} from '@/db/schema'
import { foldForMatch } from '@/ingredients/name-match'
import {
    findAliasConflict,
    getIngredient,
    listIngredients,
} from '@/ingredients/queries'
import {
    findDirectChildrenForMany,
    findIngredientByName,
    findRecipesUsingIngredient,
    getMyRatingForRecipe,
    getRatingAggregateForRecipe,
    getRecipe,
    getRolledUpRecipe,
    listCuisines,
    listRatingsForRecipe,
    listRecipes,
} from '@/recipes/queries'

function projectRecipeListRow(activeLanguage: 'de' | 'en') {
    return (row: {
        id: string
        titleDe: string | null
        titleEn: string | null
        cuisineKey: string
        totalActiveTimeMinutes: number
        totalWaitTimeMinutes: number
        isCompleteMeal: boolean
        ratingAverage: number | null
        ratingCount: number
        myRating: number | null
    }) => ({
        id: row.id,
        title:
            activeLanguage === 'de'
                ? (row.titleDe ?? row.titleEn)
                : (row.titleEn ?? row.titleDe),
        titleDe: row.titleDe,
        titleEn: row.titleEn,
        cuisineKey: row.cuisineKey,
        totalActiveTimeMinutes: row.totalActiveTimeMinutes,
        totalWaitTimeMinutes: row.totalWaitTimeMinutes,
        isCompleteMeal: row.isCompleteMeal,
        ratingAverage: row.ratingAverage,
        ratingCount: row.ratingCount,
        myRating: row.myRating,
    })
}

export function buildChatTools({
    user,
    activeLanguage,
}: {
    user: SessionUser
    activeLanguage: 'de' | 'en'
}) {
    const projectRow = projectRecipeListRow(activeLanguage)

    return {
        search_recipes: tool({
            description:
                "Search the user's recipe catalog. Returns a compact list of recipes matching the filters. Use this to answer questions like 'do I have a pasta recipe?', 'what Italian recipes do I have?', 'which complete meals can I cook tonight?'.",
            inputSchema: z.object({
                query: z
                    .string()
                    .nullable()
                    .describe(
                        'Free-text substring matched against titles in both languages. Pass null to skip text matching.',
                    ),
                cuisineKey: z
                    .string()
                    .nullable()
                    .describe(
                        "Optional cuisine key to filter by (e.g. 'italian'). Use list_cuisines to discover valid keys. Pass null to skip.",
                    ),
                completeOnly: z
                    .boolean()
                    .describe(
                        'When true, only recipes flagged as complete meals are returned.',
                    ),
            }),
            execute: async ({ query, cuisineKey, completeOnly }) => {
                const parsedCuisine: CuisineKey | null = cuisineKey
                    ? parseCuisineKey(cuisineKey)
                    : null
                if (cuisineKey && !parsedCuisine) {
                    return { error: `unknown cuisine key: ${cuisineKey}` }
                }
                const rows = listRecipes(
                    query ?? '',
                    parsedCuisine,
                    completeOnly,
                    user.id,
                )
                return {
                    count: rows.length,
                    recipes: rows.map(projectRow),
                }
            },
        }),

        get_recipe: tool({
            description:
                'Fetch the full details of one recipe: title, cuisine, times, ingredients, steps, components, complete-meal flag. Use after search_recipes when the user wants specifics.',
            inputSchema: z.object({
                recipeId: z.string().describe('Recipe ID (UUID).'),
            }),
            execute: async ({ recipeId }) => {
                const id = parseRecipeId(recipeId)
                if (!id) return { error: 'invalid recipe id' }
                const detail = getRecipe(id)
                if (!detail) return { error: 'recipe not found' }
                const rolled = getRolledUpRecipe(id)
                const aggregate = getRatingAggregateForRecipe(id)
                const myRating = getMyRatingForRecipe(id, user.id)
                return {
                    id: detail.id,
                    titleDe: detail.titleDe,
                    titleEn: detail.titleEn,
                    notesDe: detail.notesDe,
                    notesEn: detail.notesEn,
                    cuisineKey: detail.cuisineKey,
                    ownActiveTimeMinutes: detail.activeTimeMinutes,
                    ownWaitTimeMinutes: detail.waitTimeMinutes,
                    totalActiveTimeMinutes:
                        rolled?.totalActiveTimeMinutes ??
                        detail.activeTimeMinutes,
                    totalWaitTimeMinutes:
                        rolled?.totalWaitTimeMinutes ?? detail.waitTimeMinutes,
                    isCompleteMeal: detail.isCompleteMeal,
                    source: detail.source,
                    sourceIdentifier: detail.sourceIdentifier,
                    ingredients: detail.ingredients.map((ing) => ({
                        amountPerServing: ing.amount,
                        unit: ing.unit,
                        name: ing.name,
                        ingredientId: ing.ingredientId,
                    })),
                    steps: detail.steps.map((step) => ({
                        textDe: step.textDe,
                        textEn: step.textEn,
                    })),
                    components: detail.components.map((c) => ({
                        childRecipeId: c.childRecipeId,
                        titleDe: c.childTitleDe,
                        titleEn: c.childTitleEn,
                    })),
                    ratingAverage: aggregate.average,
                    ratingCount: aggregate.count,
                    myRating,
                }
            },
        }),

        list_cuisines: tool({
            description:
                'List all cuisine keys with their labels. Use this to translate a free-text cuisine name to a valid key before calling search_recipes.',
            inputSchema: z.object({}),
            execute: async () => {
                return { cuisines: listCuisines() }
            },
        }),

        list_ingredients: tool({
            description:
                "List or search the user's ingredient catalog. Returns canonical names (DE/EN), role (starch/vegetable/protein/none), density, alias and count-unit counts. To answer 'what ingredients do I have?' or 'show me my catalog' you MUST omit `query` entirely (or pass an empty string) — do NOT invent a search term like 'all' or 'Zutaten', because it would filter the result by that substring. Only pass `query` when the user names a specific ingredient (e.g. 'do I have ginger?' → query='ginger').",
            inputSchema: z.object({
                query: z
                    .string()
                    .optional()
                    .describe(
                        'Free-text substring to match against canonical names (DE/EN) and aliases. Omit (or pass an empty string) to list every ingredient.',
                    ),
            }),
            execute: async ({ query }) => {
                const rows = listIngredients(query ?? '')
                return {
                    count: rows.length,
                    ingredients: rows.map((r) => ({
                        id: r.id,
                        canonicalDe: r.canonicalDe,
                        canonicalEn: r.canonicalEn,
                        role: r.role,
                        density: r.density,
                        aliasCount: r.aliasCount,
                        countUnitCount: r.countUnitCount,
                    })),
                }
            },
        }),

        get_ingredient: tool({
            description:
                'Fetch full details of one central ingredient: aliases, role, density, count units, notes.',
            inputSchema: z.object({
                ingredientId: z.string().describe('Ingredient ID (UUID).'),
            }),
            execute: async ({ ingredientId }) => {
                const id = parseIngredientId(ingredientId)
                if (!id) return { error: 'invalid ingredient id' }
                const detail = getIngredient(id)
                if (!detail) return { error: 'ingredient not found' }
                return detail
            },
        }),

        get_recipes_using_ingredient: tool({
            description:
                "List recipes that reference a given central ingredient. Use to answer 'what can I cook with X?' once you've resolved X to a central ingredient ID via search_ingredients.",
            inputSchema: z.object({
                ingredientId: z
                    .string()
                    .describe('Central ingredient ID (UUID).'),
            }),
            execute: async ({ ingredientId }) => {
                const id = parseIngredientId(ingredientId)
                if (!id) return { error: 'invalid ingredient id' }
                const rows = findRecipesUsingIngredient(id)
                return {
                    count: rows.length,
                    recipes: rows.map((r) => ({
                        id: r.id,
                        titleDe: r.titleDe,
                        titleEn: r.titleEn,
                        title:
                            activeLanguage === 'de'
                                ? (r.titleDe ?? r.titleEn)
                                : (r.titleEn ?? r.titleDe),
                        cuisineKey: r.cuisineKey,
                    })),
                }
            },
        }),

        get_recipe_ratings: tool({
            description:
                "Get the aggregate rating and per-user breakdown for one recipe. Includes the current user's own rating.",
            inputSchema: z.object({
                recipeId: z.string().describe('Recipe ID (UUID).'),
            }),
            execute: async ({ recipeId }) => {
                const id = parseRecipeId(recipeId)
                if (!id) return { error: 'invalid recipe id' }
                const aggregate = getRatingAggregateForRecipe(id)
                const all = listRatingsForRecipe(id)
                const myRating = getMyRatingForRecipe(id, user.id)
                return {
                    average: aggregate.average,
                    count: aggregate.count,
                    myRating,
                    perUser: all.map((r) => ({
                        userId: r.userId,
                        displayName: r.displayName,
                        score: r.score,
                        isCurrentUser: r.userId === user.id,
                    })),
                }
            },
        }),

        set_my_rating: tool({
            description:
                "Set or update the CURRENT USER's rating for a recipe. Score must be an integer 1-5. Two-step write: call first with confirmed=false to see the summary, then again with confirmed=true after the user has approved.",
            inputSchema: z.object({
                recipeId: z.string().describe('Recipe ID (UUID).'),
                score: z
                    .number()
                    .int()
                    .min(1)
                    .max(5)
                    .describe('Integer 1 (worst) to 5 (best).'),
                confirmed: z
                    .boolean()
                    .describe(
                        'Set to true only after the user has explicitly approved the change. False (default) returns a dry-run summary.',
                    ),
            }),
            execute: async ({ recipeId, score, confirmed }) => {
                const id = parseRecipeId(recipeId)
                if (!id) return { error: 'invalid recipe id' }
                const row = db
                    .select({
                        titleDe: recipes.titleDe,
                        titleEn: recipes.titleEn,
                    })
                    .from(recipes)
                    .where(eq(recipes.id, id))
                    .get()
                if (!row) return { error: 'recipe not found' }
                const current = getMyRatingForRecipe(id, user.id)
                const title = row.titleEn ?? row.titleDe ?? '(?)'
                if (!confirmed) {
                    return {
                        needs_confirmation: true,
                        summary:
                            current === null
                                ? `would set your rating on "${title}" to ${score}/5`
                                : `would change your rating on "${title}" from ${current}/5 to ${score}/5`,
                    }
                }
                const existing = db
                    .select({ id: recipeRatings.id })
                    .from(recipeRatings)
                    .where(
                        and(
                            eq(recipeRatings.recipeId, id),
                            eq(recipeRatings.userId, user.id),
                        ),
                    )
                    .get()
                if (existing) {
                    db.update(recipeRatings)
                        .set({ score, updatedAt: new Date() })
                        .where(eq(recipeRatings.id, existing.id))
                        .run()
                } else {
                    db.insert(recipeRatings)
                        .values({
                            recipeId: id,
                            userId: user.id,
                            score,
                        })
                        .run()
                }
                const aggregate = getRatingAggregateForRecipe(id)
                revalidatePath('/recipes')
                revalidatePath(`/recipes/${id}`)
                return {
                    ok: true,
                    score,
                    aggregateAverage: aggregate.average,
                    aggregateCount: aggregate.count,
                }
            },
        }),

        clear_my_rating: tool({
            description:
                "Remove the CURRENT USER's rating for a recipe. Two-step write: call first with confirmed=false to see the summary, then again with confirmed=true after the user has approved.",
            inputSchema: z.object({
                recipeId: z.string().describe('Recipe ID (UUID).'),
                confirmed: z
                    .boolean()
                    .describe(
                        'Set to true only after the user has explicitly approved. False (default) returns a dry-run summary.',
                    ),
            }),
            execute: async ({ recipeId, confirmed }) => {
                const id = parseRecipeId(recipeId)
                if (!id) return { error: 'invalid recipe id' }
                const row = db
                    .select({
                        titleDe: recipes.titleDe,
                        titleEn: recipes.titleEn,
                    })
                    .from(recipes)
                    .where(eq(recipes.id, id))
                    .get()
                if (!row) return { error: 'recipe not found' }
                const current = getMyRatingForRecipe(id, user.id)
                const title = row.titleEn ?? row.titleDe ?? '(?)'
                if (!confirmed) {
                    if (current === null) {
                        return {
                            needs_confirmation: false,
                            summary: `you have no rating on "${title}" — nothing to clear`,
                        }
                    }
                    return {
                        needs_confirmation: true,
                        summary: `would remove your ${current}/5 rating on "${title}"`,
                    }
                }
                db.delete(recipeRatings)
                    .where(
                        and(
                            eq(recipeRatings.recipeId, id),
                            eq(recipeRatings.userId, user.id),
                        ),
                    )
                    .run()
                const aggregate = getRatingAggregateForRecipe(id)
                revalidatePath('/recipes')
                revalidatePath(`/recipes/${id}`)
                return {
                    ok: true,
                    aggregateAverage: aggregate.average,
                    aggregateCount: aggregate.count,
                }
            },
        }),

        update_recipe: tool({
            description:
                'Apply a structured update to ANY recipe in the database (not limited to the open form). Sparse patch: omit fields you do not change. Arrays for ingredients/steps/components are full replacements when provided. Two-step write: call first with confirmed=false to see the diff; the model relays the summary; only on explicit user approval call again with confirmed=true.',
            inputSchema: z.object({
                recipeId: z.string().describe('Recipe ID (UUID).'),
                patch: z.object({
                    titleDe: z.string().optional(),
                    titleEn: z.string().optional(),
                    notesDe: z.string().nullable().optional(),
                    notesEn: z.string().nullable().optional(),
                    cuisineKey: z.string().optional(),
                    activeTimeMinutes: z
                        .number()
                        .int()
                        .nonnegative()
                        .optional(),
                    waitTimeMinutes: z.number().int().nonnegative().optional(),
                    isCompleteMeal: z.boolean().optional(),
                    intendedServings: z
                        .number()
                        .int()
                        .positive()
                        .optional()
                        .describe(
                            'Only required when `ingredients` is supplied: the scale the amounts are at. Server divides by this before saving (storage is per-1-serving).',
                        ),
                    ingredients: z
                        .array(
                            z.object({
                                amount: z.number().positive().nullable(),
                                unit: z.string().nullable(),
                                name: z.string(),
                            }),
                        )
                        .optional()
                        .describe(
                            'Full replacement list at intendedServings scale. Include unchanged rows.',
                        ),
                    steps: z
                        .array(
                            z.object({
                                textDe: z.string().nullable(),
                                textEn: z.string().nullable(),
                            }),
                        )
                        .optional()
                        .describe('Full replacement list of steps.'),
                    components: z
                        .array(z.string())
                        .optional()
                        .describe(
                            'Full replacement list of child recipe IDs. Cycles are rejected.',
                        ),
                }),
                confirmed: z
                    .boolean()
                    .describe(
                        'Set to true only after the user has explicitly approved. False returns a dry-run summary.',
                    ),
            }),
            execute: async ({ recipeId, patch, confirmed }) => {
                const id = parseRecipeId(recipeId)
                if (!id) return { error: 'invalid recipe id' }
                const detail = getRecipe(id)
                if (!detail) return { error: 'recipe not found' }

                const changes: string[] = []
                if (
                    patch.titleDe !== undefined &&
                    patch.titleDe !== detail.titleDe
                )
                    changes.push(
                        `titleDe: "${detail.titleDe ?? ''}" → "${patch.titleDe}"`,
                    )
                if (
                    patch.titleEn !== undefined &&
                    patch.titleEn !== detail.titleEn
                )
                    changes.push(
                        `titleEn: "${detail.titleEn ?? ''}" → "${patch.titleEn}"`,
                    )
                if (
                    patch.notesDe !== undefined &&
                    (patch.notesDe ?? null) !== detail.notesDe
                )
                    changes.push('notesDe changed')
                if (
                    patch.notesEn !== undefined &&
                    (patch.notesEn ?? null) !== detail.notesEn
                )
                    changes.push('notesEn changed')
                let parsedCuisine: CuisineKey | null = null
                if (patch.cuisineKey !== undefined) {
                    parsedCuisine = parseCuisineKey(patch.cuisineKey)
                    if (!parsedCuisine)
                        return {
                            error: `unknown cuisine key: ${patch.cuisineKey}`,
                        }
                    if (parsedCuisine !== detail.cuisineKey)
                        changes.push(
                            `cuisine: ${detail.cuisineKey} → ${parsedCuisine}`,
                        )
                }
                if (
                    patch.activeTimeMinutes !== undefined &&
                    patch.activeTimeMinutes !== detail.activeTimeMinutes
                )
                    changes.push(
                        `active time: ${detail.activeTimeMinutes} → ${patch.activeTimeMinutes} min`,
                    )
                if (
                    patch.waitTimeMinutes !== undefined &&
                    patch.waitTimeMinutes !== detail.waitTimeMinutes
                )
                    changes.push(
                        `wait time: ${detail.waitTimeMinutes} → ${patch.waitTimeMinutes} min`,
                    )
                if (
                    patch.isCompleteMeal !== undefined &&
                    patch.isCompleteMeal !== detail.isCompleteMeal
                )
                    changes.push(
                        `complete meal: ${detail.isCompleteMeal} → ${patch.isCompleteMeal}`,
                    )
                if (patch.ingredients !== undefined)
                    changes.push(
                        `ingredients: ${detail.ingredients.length} → ${patch.ingredients.length} rows`,
                    )
                if (patch.steps !== undefined)
                    changes.push(
                        `steps: ${detail.steps.length} → ${patch.steps.length} rows`,
                    )
                if (patch.components !== undefined) {
                    if (patch.components.includes(recipeId))
                        return { error: 'a recipe cannot reference itself' }
                    changes.push(
                        `components: ${detail.components.length} → ${patch.components.length} rows`,
                    )
                }

                if (changes.length === 0) {
                    return {
                        needs_confirmation: false,
                        summary: 'no changes',
                    }
                }

                const title =
                    detail.titleEn ?? detail.titleDe ?? '(unnamed recipe)'
                if (!confirmed) {
                    return {
                        needs_confirmation: true,
                        summary: `would update "${title}": ${changes.join('; ')}`,
                    }
                }

                // Validate components for cycles
                let parsedComponents: RecipeId[] | undefined
                if (patch.components !== undefined) {
                    parsedComponents = []
                    for (const raw of patch.components) {
                        const cid = parseRecipeId(raw)
                        if (!cid)
                            return { error: `invalid component id: ${raw}` }
                        if (cid === id)
                            return {
                                error: 'a recipe cannot reference itself',
                            }
                        if (wouldCreateCycle(id, cid))
                            return {
                                error: `component ${cid} would create a cycle`,
                            }
                        parsedComponents.push(cid)
                    }
                }

                // Resolve / autocreate central ingredients
                type ParsedIngredient = {
                    amount: number | null
                    unit: string | null
                    name: string
                    ingredientId: IngredientId | null
                }
                let parsedIngredients: ParsedIngredient[] | undefined
                if (patch.ingredients !== undefined) {
                    const N = patch.intendedServings ?? 1
                    if (N < 1) return { error: 'intendedServings must be >= 1' }
                    parsedIngredients = patch.ingredients.map((ing) => ({
                        amount: ing.amount === null ? null : ing.amount / N,
                        unit: ing.unit,
                        name: ing.name,
                        ingredientId: findIngredientByName(ing.name),
                    }))
                }

                db.transaction(() => {
                    // Auto-create unmatched ingredients first
                    if (parsedIngredients) {
                        parsedIngredients = parsedIngredients.map((ing) => {
                            if (ing.ingredientId || !ing.name.trim()) return ing
                            const trimmedName = ing.name.trim()
                            const folded = foldForMatch(trimmedName)
                            const inserted = db
                                .insert(ingredientsTable)
                                .values({
                                    canonicalDe:
                                        activeLanguage === 'de'
                                            ? trimmedName
                                            : null,
                                    canonicalEn:
                                        activeLanguage === 'en'
                                            ? trimmedName
                                            : null,
                                    canonicalDeFolded:
                                        activeLanguage === 'de' ? folded : null,
                                    canonicalEnFolded:
                                        activeLanguage === 'en' ? folded : null,
                                    role: 'none',
                                    density: null,
                                    notes: null,
                                })
                                .returning({ id: ingredientsTable.id })
                                .get()
                            return { ...ing, ingredientId: inserted.id }
                        })
                    }

                    const updates: Record<string, unknown> = {
                        updatedAt: new Date(),
                    }
                    if (patch.titleDe !== undefined)
                        updates.titleDe = patch.titleDe || null
                    if (patch.titleEn !== undefined)
                        updates.titleEn = patch.titleEn || null
                    if (patch.notesDe !== undefined)
                        updates.notesDe = patch.notesDe || null
                    if (patch.notesEn !== undefined)
                        updates.notesEn = patch.notesEn || null
                    if (parsedCuisine) updates.cuisineKey = parsedCuisine
                    if (patch.activeTimeMinutes !== undefined)
                        updates.activeTimeMinutes = patch.activeTimeMinutes
                    if (patch.waitTimeMinutes !== undefined)
                        updates.waitTimeMinutes = patch.waitTimeMinutes
                    if (patch.isCompleteMeal !== undefined)
                        updates.isCompleteMeal = patch.isCompleteMeal
                    db.update(recipes)
                        .set(updates)
                        .where(eq(recipes.id, id))
                        .run()

                    if (parsedIngredients) {
                        db.delete(recipeIngredients)
                            .where(eq(recipeIngredients.recipeId, id))
                            .run()
                        if (parsedIngredients.length) {
                            db.insert(recipeIngredients)
                                .values(
                                    parsedIngredients.map((ing, position) => ({
                                        recipeId: id,
                                        position,
                                        amount: ing.amount,
                                        unit: ing.unit,
                                        name: ing.name,
                                        ingredientId: ing.ingredientId,
                                    })),
                                )
                                .run()
                        }
                    }
                    if (patch.steps !== undefined) {
                        db.delete(recipeSteps)
                            .where(eq(recipeSteps.recipeId, id))
                            .run()
                        if (patch.steps.length) {
                            db.insert(recipeSteps)
                                .values(
                                    patch.steps.map((s, position) => ({
                                        recipeId: id,
                                        position,
                                        textDe: s.textDe,
                                        textEn: s.textEn,
                                    })),
                                )
                                .run()
                        }
                    }
                    if (parsedComponents) {
                        db.delete(recipeComponents)
                            .where(eq(recipeComponents.parentRecipeId, id))
                            .run()
                        if (parsedComponents.length) {
                            db.insert(recipeComponents)
                                .values(
                                    parsedComponents.map(
                                        (childId, position) => ({
                                            parentRecipeId: id,
                                            childRecipeId: childId,
                                            position,
                                        }),
                                    ),
                                )
                                .run()
                        }
                    }
                })
                revalidatePath('/recipes')
                revalidatePath(`/recipes/${id}`)
                return {
                    ok: true,
                    appliedTo: title,
                    changes: changes.length,
                }
            },
        }),

        update_ingredient: tool({
            description:
                'Apply a structured update to ANY ingredient catalog entry. Sparse patch. Aliases and countUnits are full-replacement arrays when provided. Two-step write: call first with confirmed=false to see the diff; then again with confirmed=true after explicit user approval.',
            inputSchema: z.object({
                ingredientId: z.string().describe('Ingredient ID (UUID).'),
                patch: z.object({
                    canonicalDe: z.string().nullable().optional(),
                    canonicalEn: z.string().nullable().optional(),
                    role: z
                        .enum(['starch', 'vegetable', 'protein', 'none'])
                        .optional(),
                    density: z.number().positive().nullable().optional(),
                    notes: z.string().nullable().optional(),
                    aliases: z
                        .array(z.string())
                        .optional()
                        .describe(
                            'Full replacement list of aliases. Include existing aliases plus new ones.',
                        ),
                    countUnits: z
                        .array(
                            z.object({
                                unit: z.string(),
                                gramsPerUnit: z.number().positive(),
                            }),
                        )
                        .optional()
                        .describe('Full replacement list of count units.'),
                }),
                confirmed: z
                    .boolean()
                    .describe(
                        'Set to true only after explicit user approval. False returns a dry-run summary.',
                    ),
            }),
            execute: async ({ ingredientId, patch, confirmed }) => {
                const id = parseIngredientId(ingredientId)
                if (!id) return { error: 'invalid ingredient id' }
                const current = getIngredient(id)
                if (!current) return { error: 'ingredient not found' }

                const changes: string[] = []
                if (
                    patch.canonicalDe !== undefined &&
                    (patch.canonicalDe ?? null) !== current.canonicalDe
                )
                    changes.push(
                        `canonicalDe: "${current.canonicalDe ?? ''}" → "${patch.canonicalDe ?? ''}"`,
                    )
                if (
                    patch.canonicalEn !== undefined &&
                    (patch.canonicalEn ?? null) !== current.canonicalEn
                )
                    changes.push(
                        `canonicalEn: "${current.canonicalEn ?? ''}" → "${patch.canonicalEn ?? ''}"`,
                    )
                if (patch.role !== undefined && patch.role !== current.role)
                    changes.push(`role: ${current.role} → ${patch.role}`)
                if (
                    patch.density !== undefined &&
                    (patch.density ?? null) !== current.density
                )
                    changes.push(
                        `density: ${current.density ?? '∅'} → ${patch.density ?? '∅'}`,
                    )
                if (
                    patch.notes !== undefined &&
                    (patch.notes ?? null) !== current.notes
                )
                    changes.push('notes changed')
                if (patch.aliases !== undefined) {
                    const sameLen =
                        patch.aliases.length === current.aliases.length
                    const sameContent =
                        sameLen &&
                        patch.aliases.every((a, i) => a === current.aliases[i])
                    if (!sameContent)
                        changes.push(
                            `aliases: [${current.aliases.join(', ')}] → [${patch.aliases.join(', ')}]`,
                        )
                }
                if (patch.countUnits !== undefined) {
                    const same =
                        patch.countUnits.length === current.countUnits.length &&
                        patch.countUnits.every(
                            (cu, i) =>
                                cu.unit === current.countUnits[i]?.unit &&
                                cu.gramsPerUnit ===
                                    current.countUnits[i]?.gramsPerUnit,
                        )
                    if (!same)
                        changes.push(
                            `countUnits: ${current.countUnits.length} → ${patch.countUnits.length} rows`,
                        )
                }

                if (changes.length === 0) {
                    return { needs_confirmation: false, summary: 'no changes' }
                }
                const label =
                    current.canonicalEn ??
                    current.canonicalDe ??
                    '(unnamed ingredient)'

                if (patch.aliases !== undefined) {
                    const nextCanonicalDe =
                        patch.canonicalDe !== undefined
                            ? patch.canonicalDe
                            : current.canonicalDe
                    const nextCanonicalEn =
                        patch.canonicalEn !== undefined
                            ? patch.canonicalEn
                            : current.canonicalEn
                    const conflict = findAliasConflict(
                        patch.aliases,
                        id,
                        nextCanonicalDe,
                        nextCanonicalEn,
                    )
                    if (conflict) {
                        if (
                            conflict.reason === 'canonical-on-same-ingredient'
                        ) {
                            return {
                                error: `alias "${conflict.alias}" is already this ingredient's canonical name — redundant`,
                            }
                        }
                        return {
                            error: `alias "${conflict.alias}" is already used by "${conflict.ownerLabel}" (id=${conflict.ownerId})`,
                        }
                    }
                }

                if (!confirmed) {
                    return {
                        needs_confirmation: true,
                        summary: `would update "${label}": ${changes.join('; ')}`,
                    }
                }

                db.transaction(() => {
                    const updates: Record<string, unknown> = {
                        updatedAt: new Date(),
                    }
                    if (patch.canonicalDe !== undefined) {
                        updates.canonicalDe = patch.canonicalDe || null
                        updates.canonicalDeFolded = patch.canonicalDe
                            ? foldForMatch(patch.canonicalDe)
                            : null
                    }
                    if (patch.canonicalEn !== undefined) {
                        updates.canonicalEn = patch.canonicalEn || null
                        updates.canonicalEnFolded = patch.canonicalEn
                            ? foldForMatch(patch.canonicalEn)
                            : null
                    }
                    if (patch.role !== undefined) updates.role = patch.role
                    if (patch.density !== undefined)
                        updates.density = patch.density
                    if (patch.notes !== undefined)
                        updates.notes = patch.notes || null
                    db.update(ingredientsTable)
                        .set(updates)
                        .where(eq(ingredientsTable.id, id))
                        .run()
                    if (patch.aliases !== undefined) {
                        db.delete(ingredientAliases)
                            .where(eq(ingredientAliases.ingredientId, id))
                            .run()
                        if (patch.aliases.length) {
                            db.insert(ingredientAliases)
                                .values(
                                    patch.aliases.map((alias) => ({
                                        ingredientId: id,
                                        alias,
                                        aliasFolded: foldForMatch(alias),
                                    })),
                                )
                                .run()
                        }
                    }
                    if (patch.countUnits !== undefined) {
                        db.delete(ingredientCountUnits)
                            .where(eq(ingredientCountUnits.ingredientId, id))
                            .run()
                        if (patch.countUnits.length) {
                            db.insert(ingredientCountUnits)
                                .values(
                                    patch.countUnits.map((cu) => ({
                                        ingredientId: id,
                                        unit: cu.unit,
                                        gramsPerUnit: cu.gramsPerUnit,
                                    })),
                                )
                                .run()
                        }
                    }
                })
                revalidatePath('/ingredients')
                revalidatePath(`/ingredients/${id}`)
                revalidatePath('/recipes')
                return {
                    ok: true,
                    appliedTo: label,
                    changes: changes.length,
                }
            },
        }),

        delete_ingredient: tool({
            description:
                'Delete an ingredient from the central catalog. Cascades to its aliases and count units; recipes that referenced it keep the row but its `ingredient_id` becomes null. Two-step write: call with confirmed=false to see what will be deleted, including how many recipes currently reference it; then with confirmed=true on explicit user approval.',
            inputSchema: z.object({
                ingredientId: z.string().describe('Ingredient ID (UUID).'),
                confirmed: z
                    .boolean()
                    .describe(
                        'Set to true only after explicit user approval. False returns a dry-run summary.',
                    ),
            }),
            execute: async ({ ingredientId, confirmed }) => {
                const id = parseIngredientId(ingredientId)
                if (!id) return { error: 'invalid ingredient id' }
                const detail = getIngredient(id)
                if (!detail) return { error: 'ingredient not found' }
                const using = findRecipesUsingIngredient(id)
                const label =
                    detail.canonicalEn ??
                    detail.canonicalDe ??
                    '(unnamed ingredient)'
                if (!confirmed) {
                    return {
                        needs_confirmation: true,
                        summary:
                            using.length === 0
                                ? `would delete ingredient "${label}" (used in 0 recipes)`
                                : `would delete ingredient "${label}" (currently used in ${using.length} recipe${using.length === 1 ? '' : 's'}; those rows will lose their catalog link but keep the free-text name)`,
                        usedInRecipeCount: using.length,
                    }
                }
                db.delete(ingredientsTable)
                    .where(eq(ingredientsTable.id, id))
                    .run()
                revalidatePath('/ingredients')
                revalidatePath(`/ingredients/${id}`)
                revalidatePath('/recipes')
                return {
                    ok: true,
                    appliedTo: label,
                    usedInRecipeCount: using.length,
                }
            },
        }),
    }
}

function wouldCreateCycle(parentId: RecipeId, childId: RecipeId): boolean {
    if (parentId === childId) return true
    const visited = new Set<RecipeId>()
    let frontier: RecipeId[] = [childId]
    while (frontier.length > 0) {
        const nextFrontier: RecipeId[] = []
        for (const id of frontier) {
            if (visited.has(id)) continue
            visited.add(id)
            if (id === parentId) return true
            nextFrontier.push(id)
        }
        frontier = findDirectChildrenForMany(nextFrontier)
    }
    return false
}

export type ChatTools = ReturnType<typeof buildChatTools>

const recipePatchSchema = z
    .object({
        titleDe: z
            .string()
            .optional()
            .describe('German title. Omit to keep current.'),
        titleEn: z
            .string()
            .optional()
            .describe('English title. Omit to keep current.'),
        notesDe: z
            .string()
            .nullable()
            .optional()
            .describe('German notes. Null to clear, omit to keep current.'),
        notesEn: z.string().nullable().optional().describe('English notes.'),
        cuisineKey: z
            .string()
            .optional()
            .describe(
                'Cuisine key from controlled vocabulary. Use list_cuisines to discover.',
            ),
        activeTimeMinutes: z.number().int().nonnegative().optional(),
        waitTimeMinutes: z.number().int().nonnegative().optional(),
        isCompleteMeal: z.boolean().optional(),
        ingredients: z
            .array(
                z.object({
                    amount: z
                        .number()
                        .positive()
                        .nullable()
                        .describe(
                            "Amount sized for the form's current 'amounts for N servings'. Use null for 'to taste'.",
                        ),
                    unit: z
                        .string()
                        .nullable()
                        .describe('Canonical unit, or null for unit-less.'),
                    name: z.string(),
                }),
            )
            .optional()
            .describe(
                'Full replacement list of ingredients. Include all rows, even unchanged ones.',
            ),
        steps: z
            .array(
                z.object({
                    textDe: z.string().nullable(),
                    textEn: z.string().nullable(),
                }),
            )
            .optional()
            .describe(
                'Full replacement list of steps. Include all steps, even unchanged ones.',
            ),
    })
    .describe(
        'Sparse patch to the open recipe form. Omit fields you do not change; supply complete arrays for ingredients/steps.',
    )

const ingredientPatchSchema = z
    .object({
        canonicalDe: z.string().optional(),
        canonicalEn: z.string().optional(),
        role: z.enum(['starch', 'vegetable', 'protein', 'none']).optional(),
        density: z
            .number()
            .positive()
            .nullable()
            .optional()
            .describe('Grams per millilitre. Null to clear.'),
        notes: z.string().nullable().optional(),
        aliases: z
            .array(z.string())
            .optional()
            .describe(
                'Full replacement list of aliases. Include existing aliases plus new ones.',
            ),
        countUnits: z
            .array(
                z.object({
                    unit: z.string(),
                    gramsPerUnit: z.number().positive(),
                }),
            )
            .optional()
            .describe('Full replacement list of count units.'),
    })
    .describe(
        'Sparse patch to the open ingredient form. Omit fields you do not change; supply complete arrays for aliases/countUnits.',
    )

/**
 * Tools the client must execute. The server-side `tool()` definitions declare
 * the input schema so the model can call them; the client supplies the
 * `execute` via `useChat`'s `onToolCall` hook.
 */
export const DETAIL_PAGE_CLIENT_TOOL_DEFS = {
    patch_recipe_form: tool({
        description:
            'Apply a sparse patch to the OPEN recipe form on the current page. Only callable when the user is on a recipe detail page. Patches are highlighted in yellow for the user to review; nothing persists until the user clicks Save.',
        inputSchema: z.object({ patch: recipePatchSchema }),
    }),
    patch_ingredient_form: tool({
        description:
            'Apply a sparse patch to the OPEN ingredient form on the current page. Only callable when the user is on an ingredient detail page. Patches are highlighted in yellow for the user to review; nothing persists until the user clicks Save.',
        inputSchema: z.object({ patch: ingredientPatchSchema }),
    }),
} as const

export const newRecipeDraftSchema = z.object({
    titleDe: z.string().describe('German title. Required.'),
    titleEn: z.string().describe('English title. Required.'),
    notesDe: z.string().nullable(),
    notesEn: z.string().nullable(),
    cuisineKey: z
        .string()
        .describe(
            'Cuisine key from the controlled vocabulary (call list_cuisines to discover valid keys). Use "other" if nothing fits.',
        ),
    activeTimeMinutes: z.number().int().nonnegative(),
    waitTimeMinutes: z.number().int().nonnegative(),
    isCompleteMeal: z.boolean(),
    intendedServings: z
        .number()
        .int()
        .positive()
        .describe('Servings the ingredient amounts below are sized for.'),
    ingredients: z.array(
        z.object({
            name: z.string(),
            amount: z.number().positive().nullable(),
            unit: z.string().nullable(),
        }),
    ),
    steps: z.array(
        z.object({
            textDe: z.string().nullable(),
            textEn: z.string().nullable(),
        }),
    ),
})

export type NewRecipeDraft = z.infer<typeof newRecipeDraftSchema>

export const ALWAYS_CLIENT_TOOL_DEFS = {
    open_new_recipe_form: tool({
        description:
            'Open the "new recipe" form pre-filled with the proposed recipe. The user reviews and saves manually — nothing is written to the database by this tool. Call this when the conversation has converged on a recipe the user wants to add to the catalog. Provide BOTH German and English titles + step texts. Amounts are at `intendedServings` scale (the form divides on save).',
        inputSchema: z.object({ recipe: newRecipeDraftSchema }),
    }),
} as const

export type ClientToolDefs = typeof DETAIL_PAGE_CLIENT_TOOL_DEFS &
    typeof ALWAYS_CLIENT_TOOL_DEFS
