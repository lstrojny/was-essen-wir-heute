import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { mealPlanEntries, mealPlanSettings } from '@/db/schema'
import { resetDb } from '@/test/db'
import {
    makeMealPlanEntry,
    makeRecipe,
    makeUser,
    setMealPlanWindow,
} from '@/test/fixtures'
import { createCookieStore, type CookieStoreStub } from '@/test/next-stubs'

const cookieStore = vi.hoisted(
    () => ({ current: null as null | unknown }) as { current: null | unknown },
)
const revalidatePathMock = vi.hoisted(() => vi.fn())

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => cookieStore.current),
}))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('next-intl/server', () => ({
    getTranslations: vi.fn(async () => (k: string) => k),
}))

const {
    adjustWindowAction,
    clearSlotAction,
    generatePlanAction,
    pinSlotAction,
    replaceSlotAction,
    restoreSlotAction,
    scorePickerCandidatesAction,
    unpinOrUneditSlotAction,
} = await import('./actions')
const { createSession, setSessionCookie } = await import('@/auth/session')
const { asIsoDate } = await import('./dates')
const { writeRecipeTranslationUnit } = await import('@/recipes/translation-writes')

let store: CookieStoreStub

beforeEach(() => {
    resetDb()
    store = createCookieStore()
    cookieStore.current = store
    revalidatePathMock.mockClear()
    setMealPlanWindow(asIsoDate('2026-05-22'), asIsoDate('2026-05-24'))
})

afterEach(() => {
    vi.useRealTimers()
})

async function login() {
    const userId = makeUser()
    const token = await createSession(userId, null)
    await setSessionCookie(token)
    return userId
}

const formOf = (fields: Record<string, string>) => {
    const fd = new FormData()
    for (const [k, v] of Object.entries(fields)) fd.set(k, v)
    return fd
}

describe('generatePlanAction', () => {
    it('runs the generator and revalidates /plan', async () => {
        await login()
        const r = makeRecipe({ isCompleteMeal: true })
        writeRecipeTranslationUnit(r, 'title', { de: 'X' })
        const out = await generatePlanAction()
        expect(out).toEqual({})
        expect(revalidatePathMock).toHaveBeenCalledWith('/plan')
    })
})

describe('replaceSlotAction', () => {
    it('inserts a new edited row when the slot is empty', async () => {
        await login()
        const r = makeRecipe()
        const out = await replaceSlotAction(
            {},
            formOf({ date: '2026-05-22', recipeId: r }),
        )
        expect(out).toEqual({})
        const row = db.select().from(mealPlanEntries).get()!
        expect(row.recipeId).toBe(r)
        expect(row.state).toBe('edited')
    })

    it('updates an existing row to state=edited', async () => {
        await login()
        const original = makeRecipe()
        const next = makeRecipe()
        makeMealPlanEntry({
            date: asIsoDate('2026-05-22'),
            recipeId: original,
            state: 'pinned',
        })
        await replaceSlotAction(
            {},
            formOf({ date: '2026-05-22', recipeId: next }),
        )
        const row = db.select().from(mealPlanEntries).get()!
        expect(row.recipeId).toBe(next)
        expect(row.state).toBe('edited')
    })

    it('returns invalidInput for a malformed date', async () => {
        await login()
        const r = makeRecipe()
        const out = await replaceSlotAction(
            {},
            formOf({ date: 'nope', recipeId: r }),
        )
        expect(out.error).toBe('invalidInput')
    })

    it('returns invalidRecipe for a malformed recipe id', async () => {
        await login()
        const out = await replaceSlotAction(
            {},
            formOf({ date: '2026-05-22', recipeId: 'not-a-uuid' }),
        )
        expect(out.error).toBe('invalidRecipe')
    })
})

describe('pinSlotAction', () => {
    it('moves a suggested slot to pinned', async () => {
        await login()
        const r = makeRecipe()
        const entryId = makeMealPlanEntry({
            date: asIsoDate('2026-05-22'),
            recipeId: r,
            state: 'suggested',
        })
        await pinSlotAction({}, formOf({ entryId }))
        const row = db
            .select()
            .from(mealPlanEntries)
            .where(eq(mealPlanEntries.id, entryId))
            .get()!
        expect(row.state).toBe('pinned')
    })

    it('does nothing when the slot is not currently suggested', async () => {
        await login()
        const r = makeRecipe()
        const entryId = makeMealPlanEntry({
            date: asIsoDate('2026-05-22'),
            recipeId: r,
            state: 'edited',
        })
        await pinSlotAction({}, formOf({ entryId }))
        const row = db
            .select()
            .from(mealPlanEntries)
            .where(eq(mealPlanEntries.id, entryId))
            .get()!
        expect(row.state).toBe('edited')
    })
})

describe('unpinOrUneditSlotAction', () => {
    it('moves a pinned slot back to suggested', async () => {
        await login()
        const r = makeRecipe()
        const entryId = makeMealPlanEntry({
            date: asIsoDate('2026-05-22'),
            recipeId: r,
            state: 'pinned',
        })
        await unpinOrUneditSlotAction({}, formOf({ entryId }))
        const row = db
            .select()
            .from(mealPlanEntries)
            .where(eq(mealPlanEntries.id, entryId))
            .get()!
        expect(row.state).toBe('suggested')
    })

    it('moves an edited slot back to suggested', async () => {
        await login()
        const r = makeRecipe()
        const entryId = makeMealPlanEntry({
            date: asIsoDate('2026-05-22'),
            recipeId: r,
            state: 'edited',
        })
        await unpinOrUneditSlotAction({}, formOf({ entryId }))
        const row = db
            .select()
            .from(mealPlanEntries)
            .where(eq(mealPlanEntries.id, entryId))
            .get()!
        expect(row.state).toBe('suggested')
    })
})

describe('clearSlotAction', () => {
    it('updates an existing entry to state=cleared with no recipe', async () => {
        await login()
        const r = makeRecipe()
        const entryId = makeMealPlanEntry({
            date: asIsoDate('2026-05-22'),
            recipeId: r,
            state: 'suggested',
        })
        await clearSlotAction({}, formOf({ entryId }))
        const row = db
            .select()
            .from(mealPlanEntries)
            .where(eq(mealPlanEntries.id, entryId))
            .get()!
        expect(row.state).toBe('cleared')
        expect(row.recipeId).toBeNull()
    })

    it('inserts a fresh cleared entry by date when no entry exists', async () => {
        await login()
        await clearSlotAction({}, formOf({ date: '2026-05-22' }))
        const row = db.select().from(mealPlanEntries).get()!
        expect(row.state).toBe('cleared')
        expect(row.recipeId).toBeNull()
        expect(row.date).toBe('2026-05-22')
    })
})

describe('restoreSlotAction', () => {
    it('deletes a cleared entry so the slot returns to empty', async () => {
        await login()
        const entryId = makeMealPlanEntry({
            date: asIsoDate('2026-05-22'),
            recipeId: null,
            state: 'cleared',
        })
        await restoreSlotAction({}, formOf({ entryId }))
        expect(
            db
                .select()
                .from(mealPlanEntries)
                .where(eq(mealPlanEntries.id, entryId))
                .get(),
        ).toBeUndefined()
    })

    it('leaves non-cleared entries alone', async () => {
        await login()
        const r = makeRecipe()
        const entryId = makeMealPlanEntry({
            date: asIsoDate('2026-05-22'),
            recipeId: r,
            state: 'suggested',
        })
        await restoreSlotAction({}, formOf({ entryId }))
        expect(
            db
                .select()
                .from(mealPlanEntries)
                .where(eq(mealPlanEntries.id, entryId))
                .get(),
        ).toBeDefined()
    })
})

describe('adjustWindowAction', () => {
    it('updates the settings row and revalidates /plan', async () => {
        await login()
        await adjustWindowAction(
            {},
            formOf({
                start: '2026-06-01',
                end: '2026-06-07',
                recentWindowWeeks: '6',
            }),
        )
        const row = db
            .select()
            .from(mealPlanSettings)
            .where(eq(mealPlanSettings.id, 1))
            .get()!
        expect(row.activeWindowStart).toBe('2026-06-01')
        expect(row.activeWindowEnd).toBe('2026-06-07')
        expect(row.recentWindowWeeks).toBe(6)
        expect(revalidatePathMock).toHaveBeenCalledWith('/plan')
    })

    it('deletes future entries that fall outside the new window', async () => {
        await login()
        const r = makeRecipe()
        // Use far-future dates so they're guaranteed "future" relative to todayIso()
        makeMealPlanEntry({
            date: asIsoDate('2099-12-31'),
            recipeId: r,
            state: 'suggested',
        })
        await adjustWindowAction(
            {},
            formOf({ start: '2026-06-01', end: '2026-06-07' }),
        )
        expect(db.select().from(mealPlanEntries).all()).toHaveLength(0)
    })

    it('keeps in-window future entries', async () => {
        await login()
        const r = makeRecipe()
        makeMealPlanEntry({
            date: asIsoDate('2099-06-03'),
            recipeId: r,
            state: 'suggested',
        })
        await adjustWindowAction(
            {},
            formOf({ start: '2099-06-01', end: '2099-06-07' }),
        )
        expect(db.select().from(mealPlanEntries).all()).toHaveLength(1)
    })

    it('returns invalidInput when end is before start', async () => {
        await login()
        const out = await adjustWindowAction(
            {},
            formOf({ start: '2026-06-07', end: '2026-06-01' }),
        )
        expect(out.error).toBe('invalidInput')
    })
})

describe('scorePickerCandidatesAction', () => {
    it('returns an empty array for a malformed date', async () => {
        await login()
        expect(await scorePickerCandidatesAction('garbage')).toEqual([])
    })

    it('returns scored picks for every catalog recipe on a valid date', async () => {
        await login()
        const a = makeRecipe({ isCompleteMeal: true })
        const b = makeRecipe({ isCompleteMeal: true })
        writeRecipeTranslationUnit(a, 'title', { de: 'A' })
        writeRecipeTranslationUnit(b, 'title', { de: 'B' })
        const out = await scorePickerCandidatesAction('2026-05-23')
        expect(out.length).toBe(2)
        // Scores are rounded to two decimals.
        for (const pick of out) {
            expect(pick.score).toBe(Math.round(pick.score * 100) / 100)
        }
    })
})
