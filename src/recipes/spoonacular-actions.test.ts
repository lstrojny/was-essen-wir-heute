import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    MalformedResponseError,
    NotFoundError,
    QuotaExceededError,
    TransientError,
} from '@/spoonacular/types'
import { RedirectError } from '@/test/next-stubs'

const searchMock = vi.hoisted(() => vi.fn())
const getByIdMock = vi.hoisted(() => vi.fn())
const extractMock = vi.hoisted(() => vi.fn())
const requireSetupOrSessionMock = vi.hoisted(() => vi.fn())
const redirectMock = vi.hoisted(() =>
    vi.fn((to: string) => {
        throw new RedirectError(to)
    }),
)

vi.mock('@/spoonacular/client', () => ({
    searchRecipes: searchMock,
    getRecipeById: getByIdMock,
    extractRecipeByUrl: extractMock,
}))
vi.mock('@/auth/guards', () => ({
    requireSetupOrSession: requireSetupOrSessionMock,
}))
vi.mock('next/navigation', () => ({ redirect: redirectMock }))
vi.mock('next-intl/server', () => ({
    getTranslations: vi.fn(async () => (k: string) => k),
}))

const { importSpoonacularAction, searchSpoonacularAction } = await import(
    './spoonacular-actions'
)

beforeEach(() => {
    searchMock.mockReset()
    getByIdMock.mockReset()
    extractMock.mockReset()
    requireSetupOrSessionMock.mockReset()
    requireSetupOrSessionMock.mockResolvedValue({})
    redirectMock.mockClear()
})

afterEach(() => {
    vi.useRealTimers()
})

const formOf = (entries: Record<string, string>) => {
    const fd = new FormData()
    for (const [k, v] of Object.entries(entries)) fd.set(k, v)
    return fd
}

describe('searchSpoonacularAction', () => {
    it('returns empty results without calling the client when query is empty', async () => {
        const out = await searchSpoonacularAction({}, formOf({ query: '   ' }))
        expect(out).toEqual({ results: [] })
        expect(searchMock).not.toHaveBeenCalled()
    })

    it('returns hits from the client on success', async () => {
        searchMock.mockResolvedValue({ results: [{ id: 1, title: 'A' }] })
        const out = await searchSpoonacularAction(
            {},
            formOf({ query: 'pasta' }),
        )
        expect(out).toEqual({
            query: 'pasta',
            results: [{ id: 1, title: 'A' }],
        })
    })

    it('maps quota errors to a friendly translation key', async () => {
        searchMock.mockRejectedValue(new QuotaExceededError())
        const out = await searchSpoonacularAction(
            {},
            formOf({ query: 'pasta' }),
        )
        expect(out.error).toBe('spoonacularQuotaExceeded')
    })

    it('maps transient errors to a translation key', async () => {
        searchMock.mockRejectedValue(new TransientError('boom'))
        const out = await searchSpoonacularAction(
            {},
            formOf({ query: 'pasta' }),
        )
        expect(out.error).toBe('spoonacularTransient')
    })

    it('maps "API key not set" environment errors to a dedicated key', async () => {
        searchMock.mockRejectedValue(new Error('SPOONACULAR_API_KEY is not set'))
        const out = await searchSpoonacularAction(
            {},
            formOf({ query: 'pasta' }),
        )
        expect(out.error).toBe('spoonacularNoKey')
    })

    it('maps malformed responses to a dedicated key', async () => {
        searchMock.mockRejectedValue(new MalformedResponseError('shape'))
        const out = await searchSpoonacularAction(
            {},
            formOf({ query: 'pasta' }),
        )
        expect(out.error).toBe('spoonacularMalformed')
    })
})

describe('importSpoonacularAction', () => {
    it('routes to the import page by id when an id is supplied', async () => {
        getByIdMock.mockResolvedValue({ id: 42, title: 'X' })
        await expect(
            importSpoonacularAction({}, formOf({ id: '42', url: '' })),
        ).rejects.toMatchObject({ to: '/recipes/import/spoonacular/42' })
        expect(getByIdMock).toHaveBeenCalledWith(42)
    })

    it('routes via URL extraction when only a url is supplied', async () => {
        extractMock.mockResolvedValue({ id: 7, title: 'Y' })
        await expect(
            importSpoonacularAction(
                {},
                formOf({ id: '', url: 'https://example.com/r' }),
            ),
        ).rejects.toMatchObject({ to: '/recipes/import/spoonacular/7' })
        expect(extractMock).toHaveBeenCalledWith('https://example.com/r')
    })

    it('returns spoonacularInvalidId for a non-integer id', async () => {
        const out = await importSpoonacularAction(
            {},
            formOf({ id: 'banana', url: '' }),
        )
        expect(out.error).toBe('spoonacularInvalidId')
    })

    it('returns spoonacularInvalidId when both id and url are blank', async () => {
        const out = await importSpoonacularAction(
            {},
            formOf({ id: '', url: '' }),
        )
        expect(out.error).toBe('spoonacularInvalidId')
    })

    it('maps client errors via the same translation helper as search', async () => {
        getByIdMock.mockRejectedValue(new NotFoundError())
        const out = await importSpoonacularAction(
            {},
            formOf({ id: '999', url: '' }),
        )
        expect(out.error).toBe('spoonacularNotFound')
    })
})
