import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { ingredientCountUnits, ingredients } from '@/db/schema'
import { resetDb } from '@/test/db'
import { makeIngredient, makeUser } from '@/test/fixtures'
import {
    createCookieStore,
    type CookieStoreStub,
    RedirectError,
} from '@/test/next-stubs'

const cookieStore = vi.hoisted(
    () => ({ current: null as null | unknown }) as { current: null | unknown },
)
const redirectMock = vi.hoisted(() =>
    vi.fn((to: string) => {
        throw new RedirectError(to)
    }),
)

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => cookieStore.current),
}))
vi.mock('next/navigation', () => ({ redirect: redirectMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next-intl/server', () => ({
    getTranslations: vi.fn(async () => (k: string) => k),
}))
// resolveLocale reads cookies/session; stub it to always return 'de'.
vi.mock('@/i18n/resolve-locale', () => ({
    resolveLocale: vi.fn(async () => 'de'),
}))

const {
    checkAliasAvailableAction,
    createIngredientAction,
    deleteIngredientAction,
    updateIngredientAction,
} = await import('./actions')
const { createSession, setSessionCookie } = await import('@/auth/session')
const { writeIngredientAliasGroup, writeIngredientCanonical } = await import(
    './translation-writes'
)

let store: CookieStoreStub

beforeEach(() => {
    resetDb()
    store = createCookieStore()
    cookieStore.current = store
    redirectMock.mockClear()
})

afterEach(() => {
    vi.useRealTimers()
})

const formOf = (entries: [string, string][]): FormData => {
    const fd = new FormData()
    for (const [k, v] of entries) fd.append(k, v)
    return fd
}

async function login() {
    const userId = makeUser({ language: 'de' })
    const token = await createSession(userId, null)
    await setSessionCookie(token)
    return userId
}

describe('createIngredientAction', () => {
    it('redirects to the new ingredient detail page on success', async () => {
        await login()
        await expect(
            createIngredientAction(
                {},
                formOf([
                    ['canonical', 'Apfel'],
                    ['role', 'vegetable'],
                ]),
            ),
        ).rejects.toMatchObject({ name: 'RedirectError' })
        const created = db
            .select()
            .from(ingredients)
            .where(eq(ingredients.role, 'vegetable'))
            .get()
        expect(created).toBeDefined()
    })

    it('returns canonicalRequired when the canonical is empty', async () => {
        await login()
        const out = await createIngredientAction(
            {},
            formOf([['role', 'vegetable']]),
        )
        expect(out.error).toBe('canonicalRequired')
    })

    it('returns pickRole when no role is selected', async () => {
        await login()
        const out = await createIngredientAction(
            {},
            formOf([['canonical', 'Apfel']]),
        )
        expect(out.error).toBe('pickRole')
    })

    it('returns densityInvalid for a non-numeric density', async () => {
        await login()
        const out = await createIngredientAction(
            {},
            formOf([
                ['canonical', 'Apfel'],
                ['role', 'vegetable'],
                ['density', 'not a number'],
            ]),
        )
        expect(out.error).toBe('densityInvalid')
    })

    it('rejects an alias that duplicates the canonical', async () => {
        await login()
        const out = await createIngredientAction(
            {},
            formOf([
                ['canonical', 'Apfel'],
                ['role', 'vegetable'],
                ['alias', 'Apfel'],
                ['aliasId', ''],
            ]),
        )
        expect(out.error).toBe('aliasEqualsCanonical')
    })

    it('rejects an alias that collides with another ingredient', async () => {
        await login()
        const existing = makeIngredient()
        writeIngredientCanonical(existing, { de: 'Apfel' })
        const out = await createIngredientAction(
            {},
            formOf([
                ['canonical', 'Birne'],
                ['role', 'vegetable'],
                ['alias', 'Apfel'],
                ['aliasId', ''],
            ]),
        )
        expect(out.error).toBe('aliasDuplicate')
    })

    it('persists density and count units', async () => {
        await login()
        await expect(
            createIngredientAction(
                {},
                formOf([
                    ['canonical', 'Mehl'],
                    ['role', 'starch'],
                    ['density', '0.55'],
                    ['countUnitName', 'cup'],
                    ['countUnitGrams', '120'],
                ]),
            ),
        ).rejects.toMatchObject({ name: 'RedirectError' })
        const created = db
            .select()
            .from(ingredients)
            .where(eq(ingredients.role, 'starch'))
            .get()
        expect(created?.density).toBe(0.55)
        const units = db
            .select()
            .from(ingredientCountUnits)
            .where(eq(ingredientCountUnits.ingredientId, created!.id))
            .all()
        expect(units).toHaveLength(1)
        expect(units[0]).toMatchObject({ unit: 'cup', gramsPerUnit: 120 })
    })

    it('returns countUnitsInvalid for a partial count-unit row', async () => {
        await login()
        const out = await createIngredientAction(
            {},
            formOf([
                ['canonical', 'X'],
                ['role', 'vegetable'],
                ['countUnitName', 'cup'],
                ['countUnitGrams', ''],
            ]),
        )
        expect(out.error).toBe('countUnitsInvalid')
    })
})

describe('updateIngredientAction', () => {
    it('returns invalidIngredient for a malformed id', async () => {
        await login()
        const out = await updateIngredientAction(
            {},
            formOf([
                ['id', 'not-a-uuid'],
                ['canonical', 'X'],
                ['role', 'vegetable'],
            ]),
        )
        expect(out.error).toBe('invalidIngredient')
    })

    it('returns ingredientNotFound when the id does not exist', async () => {
        await login()
        const out = await updateIngredientAction(
            {},
            formOf([
                ['id', '0190f7d8-2c1a-7e5b-8b4f-3a6d4d8c2f0e'],
                ['canonical', 'X'],
                ['role', 'vegetable'],
            ]),
        )
        expect(out.error).toBe('ingredientNotFound')
    })

    it('updates the row and translation when the canonical changes', async () => {
        await login()
        const id = makeIngredient({ role: 'vegetable' })
        writeIngredientCanonical(id, { de: 'Alt' })
        const out = await updateIngredientAction(
            {},
            formOf([
                ['id', id],
                ['canonical', 'Neu'],
                ['role', 'starch'],
            ]),
        )
        expect(out.success).toBeDefined()
        const row = db
            .select()
            .from(ingredients)
            .where(eq(ingredients.id, id))
            .get()
        expect(row?.role).toBe('starch')
    })

    it('drops aliases that are not in the submitted form', async () => {
        await login()
        const id = makeIngredient()
        writeIngredientCanonical(id, { de: 'Apfel' })
        writeIngredientAliasGroup(id, null, { de: 'KeepMe' })
        const aliasIdRow = db
            .select()
            .from((await import('@/db/schema')).ingredientsAliases)
            .all()[0]
        // Submit only `KeepMe` — the helper-created alias above would be
        // dropped since the form references no existingId for it. Test
        // simulates this by re-submitting *no* alias slots at all.
        await updateIngredientAction(
            {},
            formOf([
                ['id', id],
                ['canonical', 'Apfel'],
                ['role', 'vegetable'],
            ]),
        )
        // The original alias row should have been logically removed (group
        // text emptied, alias row deleted via writeIngredientAliasGroup({})).
        const remainingAliases = db
            .select()
            .from((await import('@/db/schema')).ingredientsAliases)
            .all()
        expect(remainingAliases.find((a) => a.id === aliasIdRow.id)).toBeUndefined()
    })
})

describe('checkAliasAvailableAction', () => {
    it('returns ok=true for an empty proposed alias', async () => {
        await login()
        expect(await checkAliasAvailableAction('  ', null, '')).toEqual({
            ok: true,
        })
    })

    it('returns ok=false when the alias collides on another ingredient', async () => {
        await login()
        const other = makeIngredient()
        writeIngredientCanonical(other, { de: 'Apfel' })
        const result = await checkAliasAvailableAction('Apfel', null, 'Birne')
        expect(result.ok).toBe(false)
        if (!result.ok) {
            expect(result.conflict.alias).toBe('Apfel')
            expect(result.conflict.ownerId).toBe(other)
        }
    })

    it('ignores rows owned by the excluded ingredient', async () => {
        await login()
        const id = makeIngredient()
        writeIngredientCanonical(id, { de: 'Apfel' })
        writeIngredientAliasGroup(id, null, { de: 'Boskoop' })
        expect(
            await checkAliasAvailableAction('Boskoop', id, 'Apfel'),
        ).toEqual({ ok: true })
    })
})

describe('deleteIngredientAction', () => {
    it('deletes the ingredient and redirects to /ingredients', async () => {
        await login()
        const id = makeIngredient()
        writeIngredientCanonical(id, { de: 'Apfel' })
        await expect(
            deleteIngredientAction(formOf([['id', id]])),
        ).rejects.toMatchObject({ to: '/ingredients' })
        expect(
            db.select().from(ingredients).where(eq(ingredients.id, id)).get(),
        ).toBeUndefined()
    })

    it('redirects to /ingredients when the id is malformed (no deletion)', async () => {
        await login()
        const real = makeIngredient()
        await expect(
            deleteIngredientAction(formOf([['id', 'not-uuid']])),
        ).rejects.toMatchObject({ to: '/ingredients' })
        expect(
            db
                .select()
                .from(ingredients)
                .where(eq(ingredients.id, real))
                .get(),
        ).toBeDefined()
    })
})
