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
    ingredientCountUnits,
    ingredients as ingredientsTable,
    recipeComponents,
    recipeIngredients,
    recipeRatings,
    recipeSteps,
    recipes,
} from '@/db/schema'
import { SUPPORTED_LOCALES } from '@/i18n/locale'
import {
    mergeLocaleMap,
    optionalLocaleMapSchema,
    requiredLocaleMapSchema,
    resolveText,
} from '@/i18n/translatable'
import { foldForMatch } from '@/ingredients/name-match'
import {
    findAliasConflict,
    findIngredientByName,
    getIngredient,
    listIngredients,
} from '@/ingredients/queries'
import {
    deleteAllIngredientTranslations,
    writeIngredientAliasGroup,
    writeIngredientCanonical,
} from '@/ingredients/translation-writes'
import {
    findDirectChildrenForMany,
    findRecipesUsingIngredient,
    getMyRatingForRecipe,
    getRatingAggregateForRecipe,
    getRecipe,
    getRolledUpRecipe,
    listCuisinesAllLocales,
    listRatingsForRecipe,
    listRecipes,
    type RecipeListRow,
} from '@/recipes/queries'
import {
    deleteStepTranslationGroupsForRecipe,
    writeRecipeStepTranslation,
    writeRecipeTranslationUnit,
} from '@/recipes/translation-writes'

function projectRecipeListRow(activeLanguage: 'de' | 'en') {
    return (row: RecipeListRow) => ({
        id: row.id,
        title: resolveText(row.title, activeLanguage)?.text ?? null,
        titleByLocale: row.title,
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
                    title: detail.title,
                    notes: detail.notes,
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
                    steps: detail.steps.map((step) => ({ text: step.text })),
                    components: detail.components.map((c) => ({
                        childRecipeId: c.childRecipeId,
                        title: c.childTitle,
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
                return { cuisines: listCuisinesAllLocales() }
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
                        canonical: r.canonical,
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
                        title:
                            resolveText(r.title, activeLanguage)?.text ?? null,
                        titleByLocale: r.title,
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
                const detail = getRecipe(id)
                if (!detail) return { error: 'recipe not found' }
                const current = getMyRatingForRecipe(id, user.id)
                const title =
                    resolveText(detail.title, activeLanguage)?.text ?? '(?)'
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
                const detail = getRecipe(id)
                if (!detail) return { error: 'recipe not found' }
                const current = getMyRatingForRecipe(id, user.id)
                const title =
                    resolveText(detail.title, activeLanguage)?.text ?? '(?)'
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
                    title: optionalLocaleMapSchema()
                        .optional()
                        .describe(
                            'Title by locale. Omit locales to leave unchanged.',
                        ),
                    notes: optionalLocaleMapSchema()
                        .optional()
                        .describe('Notes by locale.'),
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
                        .array(z.object({ text: optionalLocaleMapSchema() }))
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
                if (patch.title !== undefined) {
                    for (const locale of SUPPORTED_LOCALES) {
                        const next = patch.title[locale]
                        if (next === undefined) continue
                        if (next !== detail.title[locale]) {
                            changes.push(
                                `title.${locale}: "${
                                    detail.title[locale] ?? ''
                                }" → "${next}"`,
                            )
                        }
                    }
                }
                if (patch.notes !== undefined) {
                    for (const locale of SUPPORTED_LOCALES) {
                        const next = patch.notes[locale]
                        if (next === undefined) continue
                        if (next !== detail.notes[locale]) {
                            changes.push(`notes.${locale} changed`)
                        }
                    }
                }
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
                    resolveText(detail.title, activeLanguage)?.text ??
                    '(unnamed recipe)'
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
                            const inserted = db
                                .insert(ingredientsTable)
                                .values({
                                    role: 'none',
                                    density: null,
                                    notes: null,
                                })
                                .returning({ id: ingredientsTable.id })
                                .get()
                            writeIngredientCanonical(inserted.id, {
                                [activeLanguage]: trimmedName,
                            })
                            return { ...ing, ingredientId: inserted.id }
                        })
                    }

                    const updates: Record<string, unknown> = {
                        updatedAt: new Date(),
                    }
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
                    if (patch.title !== undefined) {
                        writeRecipeTranslationUnit(
                            id,
                            'title',
                            mergeLocaleMap(detail.title, patch.title),
                        )
                    }
                    if (patch.notes !== undefined) {
                        writeRecipeTranslationUnit(
                            id,
                            'notes',
                            mergeLocaleMap(detail.notes, patch.notes),
                        )
                    }

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
                        deleteStepTranslationGroupsForRecipe(id)
                        db.delete(recipeSteps)
                            .where(eq(recipeSteps.recipeId, id))
                            .run()
                        if (patch.steps.length) {
                            const inserted = db
                                .insert(recipeSteps)
                                .values(
                                    patch.steps.map((_s, position) => ({
                                        recipeId: id,
                                        position,
                                    })),
                                )
                                .returning({
                                    id: recipeSteps.id,
                                    position: recipeSteps.position,
                                })
                                .all()
                            inserted.sort((a, b) => a.position - b.position)
                            for (const [i, row] of inserted.entries()) {
                                writeRecipeStepTranslation(
                                    row.id,
                                    patch.steps[i].text,
                                )
                            }
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
                    canonical: optionalLocaleMapSchema()
                        .optional()
                        .describe(
                            'Canonical name per locale. Omit locales to keep current.',
                        ),
                    role: z
                        .enum(['starch', 'vegetable', 'protein', 'none'])
                        .optional(),
                    density: z.number().positive().nullable().optional(),
                    notes: z.string().nullable().optional(),
                    aliases: z
                        .array(z.object({ text: optionalLocaleMapSchema() }))
                        .optional()
                        .describe(
                            'Full replacement list of alias groups. Each group has per-locale variants; include existing groups plus new ones.',
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
                if (patch.canonical !== undefined) {
                    for (const locale of SUPPORTED_LOCALES) {
                        const next = patch.canonical[locale]
                        if (next === undefined) continue
                        if (next !== current.canonical[locale]) {
                            changes.push(
                                `canonical.${locale}: "${
                                    current.canonical[locale] ?? ''
                                }" → "${next}"`,
                            )
                        }
                    }
                }
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
                    changes.push(
                        `aliases: ${current.aliases.length} → ${patch.aliases.length} groups`,
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
                    resolveText(current.canonical, activeLanguage)?.text ??
                    '(unnamed ingredient)'

                const mergedCanonical = patch.canonical
                    ? mergeLocaleMap(current.canonical, patch.canonical)
                    : current.canonical
                if (patch.aliases !== undefined) {
                    const proposed: string[] = []
                    for (const a of patch.aliases) {
                        for (const value of Object.values(a.text)) {
                            if (value) proposed.push(value)
                        }
                    }
                    const conflict = findAliasConflict(
                        proposed,
                        id,
                        mergedCanonical,
                        activeLanguage,
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
                    if (patch.role !== undefined) updates.role = patch.role
                    if (patch.density !== undefined)
                        updates.density = patch.density
                    if (patch.notes !== undefined)
                        updates.notes = patch.notes || null
                    db.update(ingredientsTable)
                        .set(updates)
                        .where(eq(ingredientsTable.id, id))
                        .run()
                    if (patch.canonical !== undefined) {
                        writeIngredientCanonical(id, mergedCanonical)
                    }
                    if (patch.aliases !== undefined) {
                        for (const existingAlias of current.aliases) {
                            writeIngredientAliasGroup(id, existingAlias.id, {})
                        }
                        for (const alias of patch.aliases) {
                            writeIngredientAliasGroup(id, null, alias.text)
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
                    resolveText(detail.canonical, activeLanguage)?.text ??
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
                db.transaction(() => {
                    deleteAllIngredientTranslations(id)
                    db.delete(ingredientsTable)
                        .where(eq(ingredientsTable.id, id))
                        .run()
                })
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
        title: optionalLocaleMapSchema()
            .optional()
            .describe(
                'Title per locale. Omit locales to keep current; provide a string to set.',
            ),
        notes: optionalLocaleMapSchema()
            .optional()
            .describe('Notes per locale.'),
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
            .array(z.object({ text: optionalLocaleMapSchema() }))
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
        canonical: optionalLocaleMapSchema()
            .optional()
            .describe(
                'Canonical name per locale. Omit locales to keep current.',
            ),
        role: z.enum(['starch', 'vegetable', 'protein', 'none']).optional(),
        density: z
            .number()
            .positive()
            .nullable()
            .optional()
            .describe('Grams per millilitre. Null to clear.'),
        notes: z.string().nullable().optional(),
        aliases: z
            .array(z.object({ text: optionalLocaleMapSchema() }))
            .optional()
            .describe(
                'Full replacement list of alias groups. Each group has per-locale variants.',
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
    title: requiredLocaleMapSchema().describe(
        'Title per locale; all supported locales required.',
    ),
    notes: optionalLocaleMapSchema().describe(
        'Notes per locale; omit a locale if empty.',
    ),
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
    steps: z.array(z.object({ text: requiredLocaleMapSchema() })),
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
