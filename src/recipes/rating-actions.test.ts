import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { recipeRatings } from '@/db/schema'
import { resetDb } from '@/test/db'
import { makeRecipe, makeUser } from '@/test/fixtures'
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

const { clearRatingAction, setRatingAction } = await import('./rating-actions')
const { createSession, setSessionCookie } = await import('@/auth/session')

let store: CookieStoreStub

beforeEach(() => {
    resetDb()
    store = createCookieStore()
    cookieStore.current = store
    revalidatePathMock.mockClear()
})

afterEach(() => {
    vi.useRealTimers()
})

const formOf = (fields: Record<string, string>): FormData => {
    const fd = new FormData()
    for (const [k, v] of Object.entries(fields)) fd.set(k, v)
    return fd
}

async function login() {
    const userId = makeUser()
    const token = await createSession(userId, null)
    await setSessionCookie(token)
    return userId
}

describe('setRatingAction', () => {
    it('inserts a new rating row when the user has not rated the recipe', async () => {
        const userId = await login()
        const recipe = makeRecipe()
        const out = await setRatingAction(
            {},
            formOf({ recipeId: recipe, score: '5' }),
        )
        expect(out).toEqual({})
        const row = db
            .select()
            .from(recipeRatings)
            .where(
                and(
                    eq(recipeRatings.recipeId, recipe),
                    eq(recipeRatings.userId, userId),
                ),
            )
            .get()
        expect(row?.score).toBe(5)
    })

    it('updates the existing rating row on a second call', async () => {
        const userId = await login()
        const recipe = makeRecipe()
        await setRatingAction({}, formOf({ recipeId: recipe, score: '3' }))
        await setRatingAction({}, formOf({ recipeId: recipe, score: '4' }))
        const rows = db
            .select()
            .from(recipeRatings)
            .where(
                and(
                    eq(recipeRatings.recipeId, recipe),
                    eq(recipeRatings.userId, userId),
                ),
            )
            .all()
        expect(rows).toHaveLength(1)
        expect(rows[0].score).toBe(4)
    })

    it('revalidates both the list and detail paths', async () => {
        await login()
        const recipe = makeRecipe()
        await setRatingAction({}, formOf({ recipeId: recipe, score: '4' }))
        const paths = revalidatePathMock.mock.calls.map((c) => c[0])
        expect(paths).toContain('/recipes')
        expect(paths).toContain(`/recipes/${recipe}`)
    })

    it('returns invalidRecipe for a malformed id', async () => {
        await login()
        const out = await setRatingAction(
            {},
            formOf({ recipeId: 'not-uuid', score: '4' }),
        )
        expect(out.error).toBe('invalidRecipe')
    })

    it('returns recipeNotFound when the recipe does not exist', async () => {
        await login()
        // Random valid UUID that won't exist
        const out = await setRatingAction(
            {},
            formOf({
                recipeId: '0190f7d8-2c1a-7e5b-8b4f-3a6d4d8c2f0e',
                score: '4',
            }),
        )
        expect(out.error).toBe('recipeNotFound')
    })

    it('returns ratingScoreInvalid for an out-of-range score', async () => {
        await login()
        const recipe = makeRecipe()
        for (const score of ['0', '6', '3.5', '-1', 'foo']) {
            const out = await setRatingAction(
                {},
                formOf({ recipeId: recipe, score }),
            )
            expect(out.error).toBe('ratingScoreInvalid')
        }
    })
})

describe('clearRatingAction', () => {
    it('deletes the rating belonging to the active user only', async () => {
        const me = await login()
        const peer = makeUser()
        const recipe = makeRecipe()
        await setRatingAction({}, formOf({ recipeId: recipe, score: '4' }))
        // Peer rating, inserted directly
        db.insert(recipeRatings)
            .values({ recipeId: recipe, userId: peer, score: 2 })
            .run()

        const out = await clearRatingAction(
            {},
            formOf({ recipeId: recipe }),
        )
        expect(out).toEqual({})
        const remaining = db
            .select()
            .from(recipeRatings)
            .where(eq(recipeRatings.recipeId, recipe))
            .all()
        expect(remaining).toHaveLength(1)
        expect(remaining[0].userId).toBe(peer)
    })

    it('is a no-op when the user has no rating for the recipe', async () => {
        await login()
        const recipe = makeRecipe()
        await expect(
            clearRatingAction({}, formOf({ recipeId: recipe })),
        ).resolves.toEqual({})
    })

    it('returns invalidRecipe for a malformed id', async () => {
        await login()
        const out = await clearRatingAction(
            {},
            formOf({ recipeId: 'not-uuid' }),
        )
        expect(out.error).toBe('invalidRecipe')
    })
})
