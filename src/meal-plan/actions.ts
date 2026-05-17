'use server'

import { and, eq, gt, lt, or } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireSetupOrSession } from '@/auth/guards'
import { db } from '@/db'
import {
    type MealPlanEntryId,
    parseMealPlanEntryId,
    parseRecipeId,
} from '@/db/ids'
import { mealPlanEntries, mealPlanSettings } from '@/db/schema'
import { parseIsoDate, todayIso } from './dates'
import { findCandidatesForDate, generatePlan } from './generate'
import { findEntryByDate, lastEatenBefore, readMealPlanSettings } from './queries'

export type MealPlanActionState = { error?: string; success?: string }

const PLAN_PATH = '/plan'

export async function generatePlanAction(): Promise<MealPlanActionState> {
    await requireSetupOrSession()
    const tErr = await getTranslations('errors')
    try {
        generatePlan()
    } catch (e) {
        return { error: `${tErr('insertFailed')}: ${(e as Error).message}` }
    }
    revalidatePath(PLAN_PATH)
    return {}
}

export async function replaceSlotAction(
    _prev: MealPlanActionState,
    data: FormData,
): Promise<MealPlanActionState> {
    await requireSetupOrSession()
    const tErr = await getTranslations('errors')
    const date = parseIsoDate(String(data.get('date') ?? ''))
    if (!date) return { error: tErr('invalidInput') }
    const recipeId = parseRecipeId(String(data.get('recipeId') ?? ''))
    if (!recipeId) return { error: tErr('invalidRecipe') }
    const existing = findEntryByDate(date)
    if (existing) {
        db.update(mealPlanEntries)
            .set({ recipeId, state: 'edited', updatedAt: new Date() })
            .where(eq(mealPlanEntries.id, existing.id))
            .run()
    } else {
        db.insert(mealPlanEntries)
            .values({ date, recipeId, state: 'edited' })
            .run()
    }
    revalidatePath(PLAN_PATH)
    return {}
}

export async function pinSlotAction(
    _prev: MealPlanActionState,
    data: FormData,
): Promise<MealPlanActionState> {
    return setStateAction(data, 'pinned', ['suggested'])
}

export async function unpinOrUneditSlotAction(
    _prev: MealPlanActionState,
    data: FormData,
): Promise<MealPlanActionState> {
    return setStateAction(data, 'suggested', ['pinned', 'edited'])
}

export async function clearSlotAction(
    _prev: MealPlanActionState,
    data: FormData,
): Promise<MealPlanActionState> {
    await requireSetupOrSession()
    const tErr = await getTranslations('errors')
    const entryId = parseEntryId(data)
    if (entryId) {
        db.update(mealPlanEntries)
            .set({ recipeId: null, state: 'cleared', updatedAt: new Date() })
            .where(eq(mealPlanEntries.id, entryId))
            .run()
    } else {
        const date = parseIsoDate(String(data.get('date') ?? ''))
        if (!date) return { error: tErr('invalidInput') }
        db.insert(mealPlanEntries)
            .values({ date, recipeId: null, state: 'cleared' })
            .run()
    }
    revalidatePath(PLAN_PATH)
    return {}
}

export async function restoreSlotAction(
    _prev: MealPlanActionState,
    data: FormData,
): Promise<MealPlanActionState> {
    await requireSetupOrSession()
    const entryId = parseEntryId(data)
    if (entryId) {
        const existing = db
            .select({ state: mealPlanEntries.state })
            .from(mealPlanEntries)
            .where(eq(mealPlanEntries.id, entryId))
            .get()
        if (existing?.state === 'cleared') {
            db.delete(mealPlanEntries)
                .where(eq(mealPlanEntries.id, entryId))
                .run()
        }
    }
    revalidatePath(PLAN_PATH)
    return {}
}

export async function adjustWindowAction(
    _prev: MealPlanActionState,
    data: FormData,
): Promise<MealPlanActionState> {
    await requireSetupOrSession()
    const tErr = await getTranslations('errors')
    const start = parseIsoDate(String(data.get('start') ?? ''))
    const end = parseIsoDate(String(data.get('end') ?? ''))
    if (!start || !end || end < start) {
        return { error: tErr('invalidInput') }
    }
    const lookbackRaw = data.get('recentWindowWeeks')
    const lookbackValue =
        lookbackRaw === null || lookbackRaw === ''
            ? null
            : Number(lookbackRaw)
    if (
        lookbackValue !== null &&
        (!Number.isInteger(lookbackValue) || lookbackValue < 1)
    ) {
        return { error: tErr('invalidInput') }
    }
    const today = todayIso()
    db.transaction(() => {
        db.update(mealPlanSettings)
            .set({
                activeWindowStart: start,
                activeWindowEnd: end,
                ...(lookbackValue !== null
                    ? { recentWindowWeeks: lookbackValue }
                    : {}),
                updatedAt: new Date(),
            })
            .where(eq(mealPlanSettings.id, 1))
            .run()
        db.delete(mealPlanEntries)
            .where(
                and(
                    gt(mealPlanEntries.date, today),
                    or(
                        lt(mealPlanEntries.date, start),
                        gt(mealPlanEntries.date, end),
                    ),
                ),
            )
            .run()
    })
    revalidatePath(PLAN_PATH)
    return {}
}

async function setStateAction(
    data: FormData,
    next: 'pinned' | 'suggested',
    fromOnly: Array<'suggested' | 'pinned' | 'edited'>,
): Promise<MealPlanActionState> {
    await requireSetupOrSession()
    const tErr = await getTranslations('errors')
    const entryId = parseEntryId(data)
    if (!entryId) return { error: tErr('invalidInput') }
    const existing = db
        .select({ state: mealPlanEntries.state })
        .from(mealPlanEntries)
        .where(eq(mealPlanEntries.id, entryId))
        .get()
    if (!existing) return { error: tErr('invalidInput') }
    if (!fromOnly.includes(existing.state as 'suggested')) {
        return {}
    }
    db.update(mealPlanEntries)
        .set({ state: next, updatedAt: new Date() })
        .where(eq(mealPlanEntries.id, entryId))
        .run()
    revalidatePath(PLAN_PATH)
    return {}
}

function parseEntryId(data: FormData): MealPlanEntryId | null {
    return parseMealPlanEntryId(String(data.get('entryId') ?? ''))
}

export type ScoredPick = {
    recipeId: string
    score: number
    lastEaten: string | null
}

export async function scorePickerCandidatesAction(
    date: string,
): Promise<ScoredPick[]> {
    await requireSetupOrSession()
    const iso = parseIsoDate(date)
    if (!iso) return []
    const scored = findCandidatesForDate(iso)
    return scored.map((s) => ({
        recipeId: s.candidate.id,
        score: Math.round(s.score * 100) / 100,
        lastEaten: s.lastEaten,
    }))
}

export async function lastEatenForPickerAction(
    recipeIds: string[],
): Promise<Record<string, string>> {
    await requireSetupOrSession()
    const settings = readMealPlanSettings()
    const ids = recipeIds.filter(
        (id): id is import('@/db/ids').RecipeId => Boolean(id),
    ) as import('@/db/ids').RecipeId[]
    const map = lastEatenBefore(ids, settings.activeWindowStart)
    const out: Record<string, string> = {}
    for (const [k, v] of map) out[k] = v
    return out
}
