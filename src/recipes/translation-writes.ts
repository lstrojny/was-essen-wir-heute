import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import type { RecipeId, RecipeStepId, TranslatedStringGroupId } from '@/db/ids'
import {
    recipeSteps,
    recipeStepsTranslated,
    recipesTranslated,
} from '@/db/schema'
import type { LocaleMap } from '@/i18n/locale'
import { deleteGroup, newGroup, writeGroup } from '@/i18n/translations'

export function writeRecipeTranslationUnit(
    recipeId: RecipeId,
    unitCode: 'title' | 'notes',
    text: LocaleMap,
) {
    const hasAny = Object.keys(text).length > 0
    const existing = db
        .select({ groupId: recipesTranslated.translatedStringId })
        .from(recipesTranslated)
        .where(
            and(
                eq(recipesTranslated.recipeId, recipeId),
                eq(recipesTranslated.unitCode, unitCode),
            ),
        )
        .get()
    if (!hasAny) {
        if (existing) {
            db.delete(recipesTranslated)
                .where(
                    and(
                        eq(recipesTranslated.recipeId, recipeId),
                        eq(recipesTranslated.unitCode, unitCode),
                    ),
                )
                .run()
            deleteGroup(existing.groupId)
        }
        return
    }
    let groupId: TranslatedStringGroupId
    if (existing) {
        groupId = existing.groupId
        deleteGroup(groupId)
    } else {
        groupId = newGroup()
        db.insert(recipesTranslated)
            .values({
                recipeId,
                unitCode,
                translatedStringId: groupId,
            })
            .run()
    }
    writeGroup(groupId, text)
}

export function deleteRecipeTranslationGroups(recipeId: RecipeId) {
    const recipeLinks = db
        .select({ groupId: recipesTranslated.translatedStringId })
        .from(recipesTranslated)
        .where(eq(recipesTranslated.recipeId, recipeId))
        .all()
    for (const l of recipeLinks) {
        deleteGroup(l.groupId)
    }
    deleteStepTranslationGroupsForRecipe(recipeId)
}

export function deleteStepTranslationGroupsForRecipe(recipeId: RecipeId) {
    const stepLinks = db
        .select({ groupId: recipeStepsTranslated.translatedStringId })
        .from(recipeStepsTranslated)
        .innerJoin(
            recipeSteps,
            eq(recipeSteps.id, recipeStepsTranslated.recipeStepId),
        )
        .where(eq(recipeSteps.recipeId, recipeId))
        .all()
    for (const l of stepLinks) {
        deleteGroup(l.groupId)
    }
}

export function writeRecipeStepTranslation(
    stepId: RecipeStepId,
    text: LocaleMap,
) {
    if (Object.keys(text).length === 0) return
    const groupId = newGroup()
    db.insert(recipeStepsTranslated)
        .values({
            recipeStepId: stepId,
            unitCode: 'text',
            translatedStringId: groupId,
        })
        .run()
    writeGroup(groupId, text)
}
