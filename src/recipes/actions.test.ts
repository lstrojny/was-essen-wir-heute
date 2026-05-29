import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { newRecipeComponentId } from '@/db/ids'
import {
    recipeComponents,
    recipeIngredients,
    recipeSteps,
    recipes,
} from '@/db/schema'
import { resetDb } from '@/test/db'
import { makeRecipe, makeUser } from '@/test/fixtures'
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
vi.mock('@/i18n/resolve-locale', () => ({
    resolveLocale: vi.fn(async () => 'de'),
}))

const {
    copyRecipeAction,
    createRecipeAction,
    deleteRecipeAction,
    updateRecipeAction,
} = await import('./actions')
const { createSession, setSessionCookie } = await import('@/auth/session')
const { writeRecipeTranslationUnit } = await import('./translation-writes')
const { getRecipe } = await import('./queries')

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

const formOf = (
    scalars: Record<string, string>,
    repeats: [string, string][] = [],
): FormData => {
    const fd = new FormData()
    for (const [k, v] of Object.entries(scalars)) fd.set(k, v)
    for (const [k, v] of repeats) fd.append(k, v)
    return fd
}

async function login() {
    const userId = makeUser({ language: 'de' })
    const token = await createSession(userId, null)
    await setSessionCookie(token)
    return userId
}

const baseScalars = (
    overrides: Record<string, string> = {},
): Record<string, string> => ({
    title: 'Pasta',
    cuisineKey: 'italian',
    activeTimeMinutes: '20',
    waitTimeMinutes: '0',
    formServings: '4',
    ...overrides,
})

describe('createRecipeAction', () => {
    it('inserts a recipe + translation and redirects to its detail page', async () => {
        await login()
        await expect(
            createRecipeAction({}, formOf(baseScalars())),
        ).rejects.toMatchObject({ name: 'RedirectError' })
        const created = db.select().from(recipes).get()
        expect(created).toBeDefined()
        expect(created?.cuisineKey).toBe('italian')
    })

    it('returns titleRequired when no title is supplied', async () => {
        await login()
        const out = await createRecipeAction(
            {},
            formOf(baseScalars({ title: '' })),
        )
        expect(out.error).toBe('titleRequired')
    })

    it('returns pickCuisine for an invalid cuisine key', async () => {
        await login()
        const out = await createRecipeAction(
            {},
            formOf(baseScalars({ cuisineKey: 'NotAValidKey!' })),
        )
        expect(out.error).toBe('pickCuisine')
    })

    it('returns activeTimeInvalid for a non-integer active time', async () => {
        await login()
        const out = await createRecipeAction(
            {},
            formOf(baseScalars({ activeTimeMinutes: '5.5' })),
        )
        expect(out.error).toBe('activeTimeInvalid')
    })

    it('returns formServingsInvalid when servings is missing or zero', async () => {
        await login()
        const out = await createRecipeAction(
            {},
            formOf(baseScalars({ formServings: '0' })),
        )
        expect(out.error).toBe('formServingsInvalid')
    })

    it('returns ingredientNameRequired when an ingredient row has amount but no name', async () => {
        await login()
        const out = await createRecipeAction(
            {},
            formOf(baseScalars(), [
                ['ingredientName', ''],
                ['ingredientAmount', '200'],
                ['ingredientUnit', 'g'],
                ['ingredientCentralId', ''],
            ]),
        )
        expect(out.error).toBe('ingredientNameRequired')
    })

    it('normalises amounts by formServings before persisting', async () => {
        await login()
        await expect(
            createRecipeAction(
                {},
                formOf(baseScalars(), [
                    ['ingredientName', 'Pasta'],
                    ['ingredientAmount', '400'],
                    ['ingredientUnit', 'g'],
                    ['ingredientCentralId', ''],
                ]),
            ),
        ).rejects.toMatchObject({ name: 'RedirectError' })
        const created = db.select().from(recipes).get()!
        const row = db
            .select()
            .from(recipeIngredients)
            .where(eq(recipeIngredients.recipeId, created.id))
            .get()
        // 400 g for 4 servings → 100 g per serving
        expect(row?.amount).toBe(100)
    })

    it('persists steps in order', async () => {
        await login()
        await expect(
            createRecipeAction(
                {},
                formOf(baseScalars(), [
                    ['step', 'first'],
                    ['stepId', ''],
                    ['step', 'second'],
                    ['stepId', ''],
                ]),
            ),
        ).rejects.toMatchObject({ name: 'RedirectError' })
        const created = db.select().from(recipes).get()!
        const steps = db
            .select()
            .from(recipeSteps)
            .where(eq(recipeSteps.recipeId, created.id))
            .all()
        expect(steps).toHaveLength(2)
        expect(steps.map((s) => s.position).sort()).toEqual([0, 1])
    })

    it('auto-resolves an ingredient name to an existing catalog entry', async () => {
        await login()
        const { makeIngredient } = await import('@/test/fixtures')
        const { writeIngredientCanonical } = await import(
            './../ingredients/translation-writes'
        )
        const ingId = makeIngredient({ role: 'starch' })
        writeIngredientCanonical(ingId, { de: 'Pasta' })

        await expect(
            createRecipeAction(
                {},
                formOf(baseScalars(), [
                    ['ingredientName', 'Pasta'],
                    ['ingredientAmount', '400'],
                    ['ingredientUnit', 'g'],
                    ['ingredientCentralId', ''],
                ]),
            ),
        ).rejects.toMatchObject({ name: 'RedirectError' })
        const created = db.select().from(recipes).get()!
        const row = db
            .select()
            .from(recipeIngredients)
            .where(eq(recipeIngredients.recipeId, created.id))
            .get()
        expect(row?.ingredientId).toBe(ingId)
    })

    it('creates a fresh catalog ingredient for an unknown name', async () => {
        await login()
        await expect(
            createRecipeAction(
                {},
                formOf(baseScalars(), [
                    ['ingredientName', 'BrandNewIngredient'],
                    ['ingredientAmount', '100'],
                    ['ingredientUnit', 'g'],
                    ['ingredientCentralId', ''],
                ]),
            ),
        ).rejects.toMatchObject({ name: 'RedirectError' })
        const created = db.select().from(recipes).get()!
        const ri = db
            .select()
            .from(recipeIngredients)
            .where(eq(recipeIngredients.recipeId, created.id))
            .get()
        expect(ri?.ingredientId).not.toBeNull()
    })
})

describe('updateRecipeAction', () => {
    it('returns invalidRecipe for a missing id', async () => {
        await login()
        const out = await updateRecipeAction(
            {},
            formOf(baseScalars({ id: '' })),
        )
        expect(out.error).toBe('invalidRecipe')
    })

    it('returns recipeNotFound when id does not match any row', async () => {
        await login()
        const out = await updateRecipeAction(
            {},
            formOf(baseScalars({ id: '0190f7d8-2c1a-7e5b-8b4f-3a6d4d8c2f0e' })),
        )
        expect(out.error).toBe('recipeNotFound')
    })

    it('refuses a component that points to itself', async () => {
        await login()
        const id = makeRecipe()
        writeRecipeTranslationUnit(id, 'title', { de: 'X' })
        const out = await updateRecipeAction(
            {},
            formOf(baseScalars({ id }), [['componentChildId', id]]),
        )
        expect(out.error).toBe('componentSelfReference')
    })

    it('detects a multi-step cycle in recipe_components', async () => {
        await login()
        const a = makeRecipe()
        const b = makeRecipe()
        writeRecipeTranslationUnit(a, 'title', { de: 'A' })
        writeRecipeTranslationUnit(b, 'title', { de: 'B' })
        db.insert(recipeComponents)
            .values({
                id: newRecipeComponentId(),
                parentRecipeId: a,
                childRecipeId: b,
                position: 0,
            })
            .run()
        const out = await updateRecipeAction(
            {},
            formOf(baseScalars({ id: b }), [['componentChildId', a]]),
        )
        expect(out.error).toBe('componentCycle')
    })

    it('writes the merged title and replaces child rows on save', async () => {
        await login()
        const id = makeRecipe()
        writeRecipeTranslationUnit(id, 'title', { de: 'Pasta', en: 'Pasta' })
        const out = await updateRecipeAction(
            {},
            formOf(baseScalars({ id, title: 'Spaghetti' }), [
                ['step', 'New step'],
                ['stepId', ''],
            ]),
        )
        expect(out.success).toBeDefined()
        const updated = getRecipe(id)!
        expect(updated.title.de).toBe('Spaghetti')
        expect(updated.title.en).toBe('Pasta')
        expect(updated.steps).toHaveLength(1)
    })
})

describe('copyRecipeAction', () => {
    it('clones the recipe (translations, ingredients, steps) and redirects', async () => {
        await login()
        const original = makeRecipe({
            activeTimeMinutes: 30,
            waitTimeMinutes: 5,
        })
        writeRecipeTranslationUnit(original, 'title', { de: 'Pasta' })
        db.insert(recipeIngredients)
            .values({
                recipeId: original,
                position: 0,
                name: 'Pasta',
                amount: 200,
                unit: 'g',
                ingredientId: null,
            })
            .run()

        await expect(
            copyRecipeAction(formOf({ id: original })),
        ).rejects.toMatchObject({ name: 'RedirectError' })

        const all = db.select().from(recipes).all()
        expect(all).toHaveLength(2)
        const copy = all.find((r) => r.id !== original)!
        expect(copy.activeTimeMinutes).toBe(30)
        expect(copy.source).toBe('manual')
        const copiedIngredients = db
            .select()
            .from(recipeIngredients)
            .where(eq(recipeIngredients.recipeId, copy.id))
            .all()
        expect(copiedIngredients).toHaveLength(1)
        expect(copiedIngredients[0].name).toBe('Pasta')
    })

    it('redirects to /recipes when the source id is malformed', async () => {
        await login()
        await expect(
            copyRecipeAction(formOf({ id: 'not-uuid' })),
        ).rejects.toMatchObject({ to: '/recipes' })
    })
})

describe('deleteRecipeAction', () => {
    it('deletes the recipe and redirects', async () => {
        await login()
        const id = makeRecipe()
        writeRecipeTranslationUnit(id, 'title', { de: 'Doomed' })
        await expect(
            deleteRecipeAction({}, formOf({ id })),
        ).rejects.toMatchObject({ to: '/recipes' })
        expect(
            db.select().from(recipes).where(eq(recipes.id, id)).get(),
        ).toBeUndefined()
    })

    it('refuses to delete a recipe used as a composite component', async () => {
        await login()
        const child = makeRecipe()
        const parent = makeRecipe()
        writeRecipeTranslationUnit(child, 'title', { de: 'Sosse' })
        writeRecipeTranslationUnit(parent, 'title', { de: 'Schnitzel' })
        db.insert(recipeComponents)
            .values({
                id: newRecipeComponentId(),
                parentRecipeId: parent,
                childRecipeId: child,
                position: 0,
            })
            .run()
        const out = await deleteRecipeAction({}, formOf({ id: child }))
        expect(out.error).toBe('recipeReferencedByComposites')
        expect(
            db.select().from(recipes).where(eq(recipes.id, child)).get(),
        ).toBeDefined()
    })

    it('returns invalidRecipe for a malformed id', async () => {
        await login()
        const out = await deleteRecipeAction(
            {},
            formOf({ id: 'not-a-uuid' }),
        )
        expect(out.error).toBe('invalidRecipe')
    })
})
