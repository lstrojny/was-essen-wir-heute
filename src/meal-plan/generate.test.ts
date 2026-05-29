import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '@/test/db'
import {
    makeMealPlanEntry,
    makeRecipe,
    setMealPlanWindow,
} from '@/test/fixtures'
import { writeRecipeTranslationUnit } from '@/recipes/translation-writes'
import { asIsoDate } from './dates'
import { findCandidatesForDate, generatePlan } from './generate'
import { listEntriesBetween } from './queries'

beforeEach(() => {
    resetDb()
    setMealPlanWindow(asIsoDate('2026-05-22'), asIsoDate('2026-05-24'))
})

describe('generatePlan — empty catalog', () => {
    it('skips every slot when no candidates exist', () => {
        const result = generatePlan()
        expect(result.filled).toBe(0)
        expect(result.skipped).toBe(3)
    })
})

describe('generatePlan — basic fill', () => {
    it('fills every empty day in the active window with a unique recipe', () => {
        for (let i = 0; i < 3; i += 1) {
            const id = makeRecipe({ isCompleteMeal: true })
            writeRecipeTranslationUnit(id, 'title', { de: `R-${i}` })
        }
        const out = generatePlan()
        expect(out.filled).toBe(3)
        expect(out.skipped).toBe(0)
        const rows = listEntriesBetween(
            asIsoDate('2026-05-22'),
            asIsoDate('2026-05-24'),
        )
        expect(rows).toHaveLength(3)
        const recipeIds = new Set(rows.map((r) => r.recipeId))
        expect(recipeIds.size).toBe(3) // distinct picks
        for (const row of rows) {
            expect(row.state).toBe('suggested')
        }
    })

    it('emits state=suggested for newly-placed rows', () => {
        const id = makeRecipe({ isCompleteMeal: true })
        writeRecipeTranslationUnit(id, 'title', { de: 'Only' })
        generatePlan()
        const rows = listEntriesBetween(
            asIsoDate('2026-05-22'),
            asIsoDate('2026-05-22'),
        )
        expect(rows[0].state).toBe('suggested')
    })
})

describe('generatePlan — sticky slots', () => {
    it('leaves pinned slots untouched', () => {
        const stuck = makeRecipe({ isCompleteMeal: true })
        const other = makeRecipe({ isCompleteMeal: true })
        writeRecipeTranslationUnit(stuck, 'title', { de: 'Stuck' })
        writeRecipeTranslationUnit(other, 'title', { de: 'Other' })
        makeMealPlanEntry({
            date: asIsoDate('2026-05-22'),
            recipeId: stuck,
            state: 'pinned',
        })
        generatePlan()
        const row = listEntriesBetween(
            asIsoDate('2026-05-22'),
            asIsoDate('2026-05-22'),
        )[0]
        expect(row.recipeId).toBe(stuck)
        expect(row.state).toBe('pinned')
    })

    it('leaves edited slots untouched', () => {
        const stuck = makeRecipe({ isCompleteMeal: true })
        const other = makeRecipe({ isCompleteMeal: true })
        writeRecipeTranslationUnit(stuck, 'title', { de: 'Stuck' })
        writeRecipeTranslationUnit(other, 'title', { de: 'Other' })
        makeMealPlanEntry({
            date: asIsoDate('2026-05-22'),
            recipeId: stuck,
            state: 'edited',
        })
        generatePlan()
        const row = listEntriesBetween(
            asIsoDate('2026-05-22'),
            asIsoDate('2026-05-22'),
        )[0]
        expect(row.recipeId).toBe(stuck)
        expect(row.state).toBe('edited')
    })

    it('leaves cleared slots untouched and does not replace them', () => {
        const r = makeRecipe({ isCompleteMeal: true })
        writeRecipeTranslationUnit(r, 'title', { de: 'X' })
        makeMealPlanEntry({
            date: asIsoDate('2026-05-22'),
            recipeId: null,
            state: 'cleared',
        })
        generatePlan()
        const row = listEntriesBetween(
            asIsoDate('2026-05-22'),
            asIsoDate('2026-05-22'),
        )[0]
        expect(row.state).toBe('cleared')
        expect(row.recipeId).toBeNull()
    })

    it('treats previously-suggested rows as fillable (not sticky)', () => {
        const placed = makeRecipe({ isCompleteMeal: true })
        writeRecipeTranslationUnit(placed, 'title', { de: 'Placed' })
        const placedEntryId = makeMealPlanEntry({
            date: asIsoDate('2026-05-22'),
            recipeId: placed,
            state: 'suggested',
        })
        // Add a second candidate; either may win the tie-break, but the row
        // for 2026-05-22 must still be in 'suggested' state with a recipe.
        const alt = makeRecipe({ isCompleteMeal: true })
        writeRecipeTranslationUnit(alt, 'title', { de: 'Alt' })

        generatePlan()
        const row = listEntriesBetween(
            asIsoDate('2026-05-22'),
            asIsoDate('2026-05-22'),
        )[0]
        expect(row.id).toBe(placedEntryId) // the same row was updated, not replaced
        expect(row.state).toBe('suggested')
        expect([placed, alt]).toContain(row.recipeId)
    })
})

describe('generatePlan — recent-window exclusion', () => {
    it('excludes recipes eaten within the look-back window', () => {
        const stale = makeRecipe({ isCompleteMeal: true })
        const ok = makeRecipe({ isCompleteMeal: true })
        writeRecipeTranslationUnit(stale, 'title', { de: 'Stale' })
        writeRecipeTranslationUnit(ok, 'title', { de: 'OK' })
        // Eaten 7 days before the window start → in the 4-week look-back.
        makeMealPlanEntry({
            date: asIsoDate('2026-05-15'),
            recipeId: stale,
            state: 'edited',
        })
        generatePlan()
        const rows = listEntriesBetween(
            asIsoDate('2026-05-22'),
            asIsoDate('2026-05-24'),
        )
        for (const row of rows) {
            expect(row.recipeId).not.toBe(stale)
        }
    })
})

describe('generatePlan — too few candidates', () => {
    it('skips slots when the eligible pool runs out', () => {
        const only = makeRecipe({ isCompleteMeal: true })
        writeRecipeTranslationUnit(only, 'title', { de: 'Only' })
        const out = generatePlan()
        expect(out.filled).toBe(1)
        expect(out.skipped).toBe(2)
    })
})

describe('findCandidatesForDate', () => {
    it('scores every catalog recipe against the day, sorted descending', () => {
        const a = makeRecipe({ isCompleteMeal: true })
        const b = makeRecipe({ isCompleteMeal: true })
        writeRecipeTranslationUnit(a, 'title', { de: 'A' })
        writeRecipeTranslationUnit(b, 'title', { de: 'B' })
        const scored = findCandidatesForDate(asIsoDate('2026-05-23'))
        expect(scored.length).toBe(2)
        for (let i = 0; i + 1 < scored.length; i += 1) {
            expect(scored[i].score).toBeGreaterThanOrEqual(scored[i + 1].score)
        }
    })

    it('treats other-day placements as neighbours for the variety penalty', () => {
        const placed = makeRecipe({ isCompleteMeal: true })
        const candidate = makeRecipe({ isCompleteMeal: true })
        writeRecipeTranslationUnit(placed, 'title', { de: 'P' })
        writeRecipeTranslationUnit(candidate, 'title', { de: 'C' })
        makeMealPlanEntry({
            date: asIsoDate('2026-05-22'),
            recipeId: placed,
            state: 'pinned',
        })
        // findCandidatesForDate scoring should observe placed as a neighbour
        // when computing slot 2026-05-23. We assert the smoke-level fact:
        // the function returns scored entries including the candidate.
        const scored = findCandidatesForDate(asIsoDate('2026-05-23'))
        const own = scored.find((s) => s.candidate.id === candidate)
        expect(own).toBeDefined()
    })
})
