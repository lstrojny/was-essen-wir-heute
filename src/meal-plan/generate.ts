import { and, eq, gte, lte } from 'drizzle-orm'
import { db } from '@/db'
import type { RecipeId } from '@/db/ids'
import { mealPlanEntries } from '@/db/schema'
import { addDaysIso, type IsoDate, rangeIso } from './dates'
import {
    lastEatenBefore,
    loadCompleteMealCandidates,
    readMealPlanSettings,
    recipesEatenInWindow,
} from './queries'
import { type Placement, scoreCandidates } from './scoring'

/**
 * Fill every fillable slot in the active window with the best-scoring
 * candidate from the catalog. Fillable = no row for the date yet, or a row
 * in state `suggested`. Pinned, edited, and cleared slots are left
 * untouched. Days for which no candidate qualifies (catalog too small or
 * recent-window too aggressive) are simply left empty.
 */
export function generatePlan(): { filled: number; skipped: number } {
    const settings = readMealPlanSettings()
    const windowDates = rangeIso(
        settings.activeWindowStart,
        settings.activeWindowEnd,
    )

    const existing = db
        .select({
            id: mealPlanEntries.id,
            date: mealPlanEntries.date,
            recipeId: mealPlanEntries.recipeId,
            state: mealPlanEntries.state,
        })
        .from(mealPlanEntries)
        .where(
            and(
                gte(mealPlanEntries.date, settings.activeWindowStart),
                lte(mealPlanEntries.date, settings.activeWindowEnd),
            ),
        )
        .all()

    const byDate = new Map(existing.map((e) => [e.date, e]))
    const fillableDates: IsoDate[] = []
    const stickyPlacements: Placement[] = []
    const occupiedRecipeIds = new Set<RecipeId>()

    for (const date of windowDates) {
        const row = byDate.get(date)
        if (!row) {
            fillableDates.push(date)
            continue
        }
        if (row.state === 'suggested') {
            fillableDates.push(date)
            continue
        }
        if (row.recipeId) occupiedRecipeIds.add(row.recipeId)
    }

    const lookbackStart = addDaysIso(
        settings.activeWindowStart,
        -settings.recentWindowWeeks * 7,
    )
    const recentlyEaten = recipesEatenInWindow(
        lookbackStart,
        settings.activeWindowStart,
    )

    const allCandidates = loadCompleteMealCandidates()
    const eligible = allCandidates.filter(
        (c) => !recentlyEaten.has(c.id) && !occupiedRecipeIds.has(c.id),
    )

    // Pre-populate sticky placements (edited/pinned) so the variety scorer
    // sees them as already filling neighbouring days.
    for (const date of windowDates) {
        const row = byDate.get(date)
        if (!row?.recipeId) continue
        if (row.state === 'suggested') continue
        const meta = allCandidates.find((c) => c.id === row.recipeId)
        if (!meta) continue
        stickyPlacements.push({
            date: date,
            recipeId: row.recipeId,
            cuisineKey: meta.cuisineKey,
            rolesByIngredient: meta.rolesByIngredient,
        })
    }

    const lastEatenMap = lastEatenBefore(
        eligible.map((c) => c.id),
        settings.activeWindowStart,
    )

    let filled = 0
    let skipped = 0
    const placedThisRun = new Set<RecipeId>()
    const cumulativePlacements: Placement[] = [...stickyPlacements]
    db.transaction(() => {
        for (const slotDate of fillableDates) {
            const remaining = eligible.filter(
                (c) => !placedThisRun.has(c.id),
            )
            if (remaining.length === 0) {
                skipped += 1
                continue
            }
            const scored = scoreCandidates(
                remaining,
                slotDate,
                cumulativePlacements,
                lastEatenMap,
                settings.activeWindowStart,
                settings.recentWindowWeeks,
            )
            const pick = scored[0]
            const existingRow = byDate.get(slotDate)
            if (existingRow) {
                db.update(mealPlanEntries)
                    .set({
                        recipeId: pick.candidate.id,
                        state: 'suggested',
                        updatedAt: new Date(),
                    })
                    .where(eq(mealPlanEntries.id, existingRow.id))
                    .run()
            } else {
                db.insert(mealPlanEntries)
                    .values({
                        date: slotDate,
                        recipeId: pick.candidate.id,
                        state: 'suggested',
                    })
                    .run()
            }
            placedThisRun.add(pick.candidate.id)
            cumulativePlacements.push({
                date: slotDate,
                recipeId: pick.candidate.id,
                cuisineKey: pick.candidate.cuisineKey,
                rolesByIngredient: pick.candidate.rolesByIngredient,
            })
            filled += 1
        }
    })

    return { filled, skipped }
}

export function findCandidatesForDate(slotDate: IsoDate) {
    const settings = readMealPlanSettings()
    const allCandidates = loadCompleteMealCandidates()
    const windowEntries = db
        .select({
            date: mealPlanEntries.date,
            recipeId: mealPlanEntries.recipeId,
            state: mealPlanEntries.state,
        })
        .from(mealPlanEntries)
        .where(
            and(
                gte(mealPlanEntries.date, settings.activeWindowStart),
                lte(mealPlanEntries.date, settings.activeWindowEnd),
            ),
        )
        .all()
    const placements: Placement[] = []
    for (const row of windowEntries) {
        if (row.date === slotDate) continue
        if (!row.recipeId) continue
        const meta = allCandidates.find((c) => c.id === row.recipeId)
        if (!meta) continue
        placements.push({
            date: row.date as IsoDate,
            recipeId: row.recipeId,
            cuisineKey: meta.cuisineKey,
            rolesByIngredient: meta.rolesByIngredient,
        })
    }
    const lastEatenMap = lastEatenBefore(
        allCandidates.map((c) => c.id),
        settings.activeWindowStart,
    )
    return scoreCandidates(
        allCandidates,
        slotDate,
        placements,
        lastEatenMap,
        settings.activeWindowStart,
        settings.recentWindowWeeks,
    )
}

