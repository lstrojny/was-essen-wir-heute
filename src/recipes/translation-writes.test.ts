import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { newRecipeStepId, type RecipeId } from '@/db/ids'
import { recipeSteps, recipesTranslated, recipeStepsTranslated } from '@/db/schema'
import { readGroup } from '@/i18n/translations'
import { makeRecipe } from '@/test/fixtures'
import { resetDb } from '@/test/db'
import {
    deleteRecipeTranslationGroups,
    deleteStepTranslationGroupsForRecipe,
    writeRecipeStepTranslation,
    writeRecipeTranslationUnit,
} from './translation-writes'

beforeEach(() => {
    resetDb()
})

function joinRowFor(recipeId: RecipeId, unitCode: 'title' | 'notes') {
    return db
        .select()
        .from(recipesTranslated)
        .where(eq(recipesTranslated.recipeId, recipeId))
        .all()
        .find((r) => r.unitCode === unitCode)
}

describe('writeRecipeTranslationUnit — create', () => {
    it('inserts a join row and a translated_strings group for a new title', () => {
        const recipeId = makeRecipe()
        writeRecipeTranslationUnit(recipeId, 'title', {
            de: 'Spaghetti',
            en: 'Spaghetti',
        })
        const link = joinRowFor(recipeId, 'title')
        expect(link).toBeDefined()
        const resolved = readGroup(link!.translatedStringId, 'de')
        expect(resolved?.text).toBe('Spaghetti')
    })

    it('supports both title and notes unit codes on the same recipe', () => {
        const recipeId = makeRecipe()
        writeRecipeTranslationUnit(recipeId, 'title', { de: 'Pasta' })
        writeRecipeTranslationUnit(recipeId, 'notes', { de: 'Mit Liebe.' })

        const title = joinRowFor(recipeId, 'title')
        const notes = joinRowFor(recipeId, 'notes')
        expect(title).toBeDefined()
        expect(notes).toBeDefined()
        expect(title!.translatedStringId).not.toBe(notes!.translatedStringId)
    })

    it('is a no-op when called with an empty map and nothing exists', () => {
        const recipeId = makeRecipe()
        writeRecipeTranslationUnit(recipeId, 'title', {})
        expect(joinRowFor(recipeId, 'title')).toBeUndefined()
    })
})

describe('writeRecipeTranslationUnit — update', () => {
    it('replaces the locale rows when called again with new text', () => {
        const recipeId = makeRecipe()
        writeRecipeTranslationUnit(recipeId, 'title', {
            de: 'Pasta',
            en: 'Pasta',
        })
        writeRecipeTranslationUnit(recipeId, 'title', {
            de: 'Spaghetti',
            en: 'Spaghetti',
        })
        const link = joinRowFor(recipeId, 'title')
        expect(readGroup(link!.translatedStringId, 'de')?.text).toBe('Spaghetti')
        expect(readGroup(link!.translatedStringId, 'en')?.text).toBe('Spaghetti')
    })

    it('reuses the same group id across edits', () => {
        const recipeId = makeRecipe()
        writeRecipeTranslationUnit(recipeId, 'title', { de: 'Pasta' })
        const firstGroup = joinRowFor(recipeId, 'title')!.translatedStringId
        writeRecipeTranslationUnit(recipeId, 'title', {
            de: 'Pasta',
            en: 'Pasta',
        })
        const secondGroup = joinRowFor(recipeId, 'title')!.translatedStringId
        expect(secondGroup).toBe(firstGroup)
    })

    it('drops locale rows that are no longer in the new map', () => {
        const recipeId = makeRecipe()
        writeRecipeTranslationUnit(recipeId, 'title', {
            de: 'Pasta',
            en: 'Pasta',
        })
        // Re-write with only de; the 'en' row must be gone.
        writeRecipeTranslationUnit(recipeId, 'title', { de: 'Nudeln' })
        const link = joinRowFor(recipeId, 'title')
        const en = readGroup(link!.translatedStringId, 'en')
        // Reading 'en' falls back to 'de' (only remaining locale).
        expect(en).toEqual({
            text: 'Nudeln',
            locale: 'de',
            isFallback: true,
        })
    })
})

describe('writeRecipeTranslationUnit — delete', () => {
    it('removes the join row and the group when called with empty map', () => {
        const recipeId = makeRecipe()
        writeRecipeTranslationUnit(recipeId, 'title', { de: 'Pasta' })
        const groupId = joinRowFor(recipeId, 'title')!.translatedStringId

        writeRecipeTranslationUnit(recipeId, 'title', {})
        expect(joinRowFor(recipeId, 'title')).toBeUndefined()
        expect(readGroup(groupId, 'de')).toBeNull()
    })
})

describe('deleteRecipeTranslationGroups', () => {
    it('deletes both title and notes groups for the recipe', () => {
        const recipeId = makeRecipe()
        writeRecipeTranslationUnit(recipeId, 'title', { de: 'Pasta' })
        writeRecipeTranslationUnit(recipeId, 'notes', { de: 'Notiz' })
        const titleGroup = joinRowFor(recipeId, 'title')!.translatedStringId
        const notesGroup = joinRowFor(recipeId, 'notes')!.translatedStringId

        deleteRecipeTranslationGroups(recipeId)
        expect(readGroup(titleGroup, 'de')).toBeNull()
        expect(readGroup(notesGroup, 'de')).toBeNull()
    })

    it('also walks the step-translation chain', () => {
        const recipeId = makeRecipe()
        const stepId = newRecipeStepId()
        db.insert(recipeSteps)
            .values({ id: stepId, recipeId, position: 0 })
            .run()
        writeRecipeStepTranslation(stepId, { de: 'Wasser kochen.' })
        const stepLink = db
            .select()
            .from(recipeStepsTranslated)
            .where(eq(recipeStepsTranslated.recipeStepId, stepId))
            .get()
        const stepGroup = stepLink!.translatedStringId

        deleteRecipeTranslationGroups(recipeId)
        expect(readGroup(stepGroup, 'de')).toBeNull()
    })
})

describe('deleteStepTranslationGroupsForRecipe', () => {
    it('clears every step group attached to the recipe', () => {
        const recipeId = makeRecipe()
        const stepA = newRecipeStepId()
        const stepB = newRecipeStepId()
        db.insert(recipeSteps)
            .values({ id: stepA, recipeId, position: 0 })
            .run()
        db.insert(recipeSteps)
            .values({ id: stepB, recipeId, position: 1 })
            .run()
        writeRecipeStepTranslation(stepA, { de: 'Eins.' })
        writeRecipeStepTranslation(stepB, { de: 'Zwei.' })

        const groups = db
            .select({ groupId: recipeStepsTranslated.translatedStringId })
            .from(recipeStepsTranslated)
            .all()
        expect(groups).toHaveLength(2)

        deleteStepTranslationGroupsForRecipe(recipeId)
        for (const g of groups) {
            expect(readGroup(g.groupId, 'de')).toBeNull()
        }
    })
})

describe('writeRecipeStepTranslation', () => {
    it('creates a join row + group with the step text', () => {
        const recipeId = makeRecipe()
        const stepId = newRecipeStepId()
        db.insert(recipeSteps)
            .values({ id: stepId, recipeId, position: 0 })
            .run()

        writeRecipeStepTranslation(stepId, {
            de: 'Wasser kochen.',
            en: 'Boil water.',
        })

        const link = db
            .select()
            .from(recipeStepsTranslated)
            .where(eq(recipeStepsTranslated.recipeStepId, stepId))
            .get()
        expect(link).toBeDefined()
        expect(readGroup(link!.translatedStringId, 'de')?.text).toBe(
            'Wasser kochen.',
        )
        expect(readGroup(link!.translatedStringId, 'en')?.text).toBe(
            'Boil water.',
        )
    })

    it('is a no-op for an empty text map', () => {
        const recipeId = makeRecipe()
        const stepId = newRecipeStepId()
        db.insert(recipeSteps)
            .values({ id: stepId, recipeId, position: 0 })
            .run()
        writeRecipeStepTranslation(stepId, {})
        const link = db
            .select()
            .from(recipeStepsTranslated)
            .where(eq(recipeStepsTranslated.recipeStepId, stepId))
            .get()
        expect(link).toBeUndefined()
    })
})
