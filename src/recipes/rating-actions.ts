'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireSetupOrSession } from '@/auth/guards'
import { db } from '@/db'
import { parseRecipeId, type RecipeId } from '@/db/ids'
import { recipeRatings, recipes } from '@/db/schema'

export type RatingActionState = { error?: string }

function paths(recipeId: RecipeId): string[] {
    return ['/recipes', `/recipes/${recipeId}`]
}

export async function setRatingAction(
    _prev: RatingActionState,
    data: FormData,
): Promise<RatingActionState> {
    const session = await requireSetupOrSession()
    const tErr = await getTranslations('errors')
    const id = parseRecipeId(String(data.get('recipeId') ?? ''))
    if (!id) return { error: tErr('invalidRecipe') }
    const scoreRaw = Number(data.get('score'))
    if (!Number.isInteger(scoreRaw) || scoreRaw < 1 || scoreRaw > 5) {
        return { error: tErr('ratingScoreInvalid') }
    }
    const exists = db
        .select({ id: recipes.id })
        .from(recipes)
        .where(eq(recipes.id, id))
        .get()
    if (!exists) return { error: tErr('recipeNotFound') }
    const existing = db
        .select({ id: recipeRatings.id })
        .from(recipeRatings)
        .where(
            and(
                eq(recipeRatings.recipeId, id),
                eq(recipeRatings.userId, session.user.id),
            ),
        )
        .get()
    if (existing) {
        db.update(recipeRatings)
            .set({ score: scoreRaw, updatedAt: new Date() })
            .where(eq(recipeRatings.id, existing.id))
            .run()
    } else {
        db.insert(recipeRatings)
            .values({
                recipeId: id,
                userId: session.user.id,
                score: scoreRaw,
            })
            .run()
    }
    for (const p of paths(id)) revalidatePath(p)
    return {}
}

export async function clearRatingAction(
    _prev: RatingActionState,
    data: FormData,
): Promise<RatingActionState> {
    const session = await requireSetupOrSession()
    const tErr = await getTranslations('errors')
    const id = parseRecipeId(String(data.get('recipeId') ?? ''))
    if (!id) return { error: tErr('invalidRecipe') }
    db.delete(recipeRatings)
        .where(
            and(
                eq(recipeRatings.recipeId, id),
                eq(recipeRatings.userId, session.user.id),
            ),
        )
        .run()
    for (const p of paths(id)) revalidatePath(p)
    return {}
}
