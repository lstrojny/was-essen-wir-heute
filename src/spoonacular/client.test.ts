import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest'
import { resetDb } from '@/test/db'
import {
    extractRecipeByUrl,
    getRecipeById,
    readPersistedQuota,
    searchRecipes,
} from './client'
import {
    MalformedResponseError,
    NotFoundError,
    QuotaExceededError,
    TransientError,
} from './types'

function jsonResponse(
    body: unknown,
    init: { status?: number; headers?: Record<string, string> } = {},
): Response {
    return new Response(JSON.stringify(body), {
        status: init.status ?? 200,
        headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    })
}

function textResponse(
    text: string,
    init: { status?: number; headers?: Record<string, string> } = {},
): Response {
    return new Response(text, {
        status: init.status ?? 200,
        headers: { 'content-type': 'text/plain', ...(init.headers ?? {}) },
    })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
    resetDb()
    vi.stubEnv('SPOONACULAR_API_KEY', 'test-key')
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.useRealTimers()
})

describe('searchRecipes — URL construction', () => {
    it('builds /recipes/complexSearch with query and number params', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ results: [] }))
        await searchRecipes('pasta')
        const url = new URL(fetchMock.mock.calls[0][0] as string)
        expect(url.pathname).toBe('/recipes/complexSearch')
        expect(url.searchParams.get('query')).toBe('pasta')
        expect(url.searchParams.get('number')).toBe('10')
        expect(url.searchParams.get('apiKey')).toBe('test-key')
    })

    it('honours a custom result count', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ results: [] }))
        await searchRecipes('soup', { number: 25 })
        const url = new URL(fetchMock.mock.calls[0][0] as string)
        expect(url.searchParams.get('number')).toBe('25')
    })
})

describe('getRecipeById — URL construction', () => {
    it('builds /recipes/{id}/information with includeNutrition=false', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({ id: 42, title: 'X' }),
        )
        await getRecipeById(42)
        const url = new URL(fetchMock.mock.calls[0][0] as string)
        expect(url.pathname).toBe('/recipes/42/information')
        expect(url.searchParams.get('includeNutrition')).toBe('false')
    })
})

describe('extractRecipeByUrl — URL construction', () => {
    it('builds /recipes/extract with url and analyze=true', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({ id: 7, title: 'Y' }),
        )
        await extractRecipeByUrl('https://example.com/r')
        const url = new URL(fetchMock.mock.calls[0][0] as string)
        expect(url.pathname).toBe('/recipes/extract')
        expect(url.searchParams.get('url')).toBe('https://example.com/r')
        expect(url.searchParams.get('analyze')).toBe('true')
    })
})

describe('error mapping', () => {
    it('throws NotFoundError on 404', async () => {
        fetchMock.mockResolvedValueOnce(textResponse('nope', { status: 404 }))
        await expect(getRecipeById(1)).rejects.toBeInstanceOf(NotFoundError)
    })

    it('throws QuotaExceededError on 402', async () => {
        fetchMock.mockResolvedValueOnce(textResponse('quota', { status: 402 }))
        await expect(getRecipeById(1)).rejects.toBeInstanceOf(QuotaExceededError)
    })

    it('throws QuotaExceededError on 429', async () => {
        fetchMock.mockResolvedValueOnce(textResponse('rate', { status: 429 }))
        await expect(getRecipeById(1)).rejects.toBeInstanceOf(QuotaExceededError)
    })

    it('throws MalformedResponseError when body is not JSON', async () => {
        fetchMock.mockResolvedValueOnce(textResponse('not json'))
        await expect(getRecipeById(1)).rejects.toBeInstanceOf(
            MalformedResponseError,
        )
    })

    it('throws MalformedResponseError when JSON does not match the schema', async () => {
        // missing required `id` and `title`
        fetchMock.mockResolvedValueOnce(jsonResponse({ wrong: 'shape' }))
        await expect(getRecipeById(1)).rejects.toBeInstanceOf(
            MalformedResponseError,
        )
    })

    it('treats other non-2xx (e.g. 403) as TransientError', async () => {
        fetchMock.mockResolvedValueOnce(textResponse('forbidden', { status: 403 }))
        await expect(getRecipeById(1)).rejects.toBeInstanceOf(TransientError)
    })
})

describe('retry on 5xx', () => {
    // The retry path sleeps 500–2000ms; let the real timer run so the
    // catch chains settle without vitest's unhandled-rejection guard
    // flagging the intermediate state.
    it('retries once when the first response is 5xx', async () => {
        fetchMock
            .mockResolvedValueOnce(textResponse('boom', { status: 500 }))
            .mockResolvedValueOnce(jsonResponse({ id: 1, title: 'OK' }))
        await expect(getRecipeById(1)).resolves.toMatchObject({
            id: 1,
            title: 'OK',
        })
        expect(fetchMock).toHaveBeenCalledTimes(2)
    }, 10_000)

    it('throws TransientError when fetch itself rejects twice', async () => {
        fetchMock
            .mockRejectedValueOnce(new Error('network down'))
            .mockRejectedValueOnce(new Error('still down'))
        await expect(getRecipeById(1)).rejects.toBeInstanceOf(TransientError)
    }, 10_000)
})

describe('cache behaviour', () => {
    it('returns the cached body on a second call without re-fetching', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({ id: 1, title: 'OnceFromNet' }),
        )
        const first = await getRecipeById(1)
        const second = await getRecipeById(1)
        expect(second).toEqual(first)
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('persists the response in the cache table for distinct call sites', async () => {
        fetchMock
            .mockResolvedValueOnce(
                jsonResponse({ results: [{ id: 1, title: 'A' }] }),
            )
            .mockResolvedValueOnce(jsonResponse({ id: 1, title: 'B' }))
        await searchRecipes('pasta')
        await getRecipeById(1)
        // Different cacheKeys → both go to the network
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })
})

describe('quota persistence', () => {
    it('writes quota headers to the spoonacular_quota singleton', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse(
                { id: 1, title: 'X' },
                {
                    headers: {
                        'X-API-Quota-Used': '17',
                        'X-API-Quota-Left': '983',
                        'X-API-Quota-Request': '1',
                    },
                },
            ),
        )
        await getRecipeById(1)
        expect(readPersistedQuota()).toEqual({
            used: 17,
            left: 983,
            request: 1,
        })
    })

    it('stores nulls when the headers are absent', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({ id: 1, title: 'X' }),
        )
        await getRecipeById(1)
        expect(readPersistedQuota()).toEqual({
            used: null,
            left: null,
            request: null,
        })
    })
})

describe('environment configuration', () => {
    it('throws a clear error when the API key is not set', async () => {
        vi.stubEnv('SPOONACULAR_API_KEY', '')
        await expect(getRecipeById(1)).rejects.toThrow(
            /SPOONACULAR_API_KEY is not set/,
        )
    })
})

describe('readPersistedQuota', () => {
    it('returns null when nothing has been persisted yet', () => {
        expect(readPersistedQuota()).toBeNull()
    })
})
