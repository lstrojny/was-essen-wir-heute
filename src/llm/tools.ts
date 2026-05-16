import { tool } from 'ai'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { SessionUser } from '@/auth/session'
import { db } from '@/db'
import {
    type CuisineKey,
    parseCuisineKey,
    parseIngredientId,
    parseRecipeId,
} from '@/db/ids'
import { recipeRatings, recipes } from '@/db/schema'
import { getIngredient, listIngredients } from '@/ingredients/queries'
import {
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
                        centralIngredientId: ing.centralIngredientId,
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
                "List or search the user's central ingredient catalog. Returns canonical names (DE/EN), role (starch/vegetable/protein/none), density, alias and count-unit counts. Use to answer 'what ingredients do I have?', 'do I have ginger?', 'show me my proteins'. Omit query (or pass null) to list everything; pass a substring to match canonical names and aliases.",
            inputSchema: z.object({
                query: z
                    .string()
                    .nullable()
                    .describe(
                        'Free-text substring to match against canonical names (DE/EN) and aliases. Null or empty lists every ingredient.',
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
                "Set or update the CURRENT USER's rating for a recipe. Score must be an integer 1-5. Confirm with the user before calling.",
            inputSchema: z.object({
                recipeId: z.string().describe('Recipe ID (UUID).'),
                score: z
                    .number()
                    .int()
                    .min(1)
                    .max(5)
                    .describe('Integer 1 (worst) to 5 (best).'),
            }),
            execute: async ({ recipeId, score }) => {
                const id = parseRecipeId(recipeId)
                if (!id) return { error: 'invalid recipe id' }
                const exists = db
                    .select({ id: recipes.id })
                    .from(recipes)
                    .where(eq(recipes.id, id))
                    .get()
                if (!exists) return { error: 'recipe not found' }
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
                return {
                    ok: true,
                    score,
                    aggregateAverage: aggregate.average,
                    aggregateCount: aggregate.count,
                }
            },
        }),

        clear_my_rating: tool({
            description: "Remove the CURRENT USER's rating for a recipe.",
            inputSchema: z.object({
                recipeId: z.string().describe('Recipe ID (UUID).'),
            }),
            execute: async ({ recipeId }) => {
                const id = parseRecipeId(recipeId)
                if (!id) return { error: 'invalid recipe id' }
                db.delete(recipeRatings)
                    .where(
                        and(
                            eq(recipeRatings.recipeId, id),
                            eq(recipeRatings.userId, user.id),
                        ),
                    )
                    .run()
                const aggregate = getRatingAggregateForRecipe(id)
                return {
                    ok: true,
                    aggregateAverage: aggregate.average,
                    aggregateCount: aggregate.count,
                }
            },
        }),
    }
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

export const CLIENT_TOOL_DEFS = {
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

export type ClientToolDefs = typeof CLIENT_TOOL_DEFS
