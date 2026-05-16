import { eq } from 'drizzle-orm'
import type { z } from 'zod'
import { db } from '@/db'
import { spoonacularCache, spoonacularQuota } from '@/db/schema'
import {
    MalformedResponseError,
    NotFoundError,
    QuotaExceededError,
    type RecipeDetail,
    recipeDetailSchema,
    type SearchResult,
    type SpoonacularQuota,
    searchResultSchema,
    TransientError,
} from './types'

const BASE_URL = 'https://api.spoonacular.com'
const TIMEOUT_MS = 15_000
const SEARCH_TTL_MS = 24 * 60 * 60 * 1000
const RECIPE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const QUOTA_SINGLETON_ID = 1

function getApiKey(): string {
    const key = process.env.SPOONACULAR_API_KEY
    if (!key) {
        throw new Error(
            'SPOONACULAR_API_KEY is not set. Set it in the environment to use Spoonacular import.',
        )
    }
    return key
}

function buildUrl(path: string, params: Record<string, string | number>): URL {
    const url = new URL(`${BASE_URL}${path}`)
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value))
    }
    return url
}

function withApiKey(url: URL): URL {
    const out = new URL(url)
    out.searchParams.set('apiKey', getApiKey())
    return out
}

function cacheKeyForUrl(url: URL): string {
    return `${url.pathname}?${url.searchParams.toString()}`
}

function readCache(cacheKey: string, ttlMs: number): unknown | null {
    const row = db
        .select()
        .from(spoonacularCache)
        .where(eq(spoonacularCache.cacheKey, cacheKey))
        .get()
    if (!row) return null
    const age = Date.now() - row.fetchedAt.getTime()
    if (age > ttlMs) {
        return null
    }
    try {
        return JSON.parse(row.responseJson) as unknown
    } catch {
        return null
    }
}

function writeCache(cacheKey: string, body: unknown): void {
    const json = JSON.stringify(body)
    const now = new Date()
    db.insert(spoonacularCache)
        .values({
            cacheKey,
            responseJson: json,
            fetchedAt: now,
        })
        .onConflictDoUpdate({
            target: spoonacularCache.cacheKey,
            set: { responseJson: json, fetchedAt: now },
        })
        .run()
}

function persistQuota(quota: SpoonacularQuota): void {
    db.insert(spoonacularQuota)
        .values({
            id: QUOTA_SINGLETON_ID,
            quotaUsed: quota.used,
            quotaLeft: quota.left,
            quotaRequest: quota.request,
            updatedAt: new Date(),
        })
        .onConflictDoUpdate({
            target: spoonacularQuota.id,
            set: {
                quotaUsed: quota.used,
                quotaLeft: quota.left,
                quotaRequest: quota.request,
                updatedAt: new Date(),
            },
        })
        .run()
}

function parseQuotaHeaders(res: Response): SpoonacularQuota {
    const num = (h: string) => {
        const v = res.headers.get(h)
        return v === null ? null : Number(v)
    }
    return {
        used: num('X-API-Quota-Used'),
        left: num('X-API-Quota-Left'),
        request: num('X-API-Quota-Request'),
    }
}

async function fetchOnce(url: URL): Promise<Response> {
    return fetch(withApiKey(url).toString(), {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
    })
}

async function fetchWithRetry(url: URL): Promise<Response> {
    try {
        const res = await fetchOnce(url)
        if (res.status >= 500 || res.status === 0) {
            await new Promise((r) =>
                setTimeout(r, 500 + Math.floor(Math.random() * 1500)),
            )
            return await fetchOnce(url)
        }
        return res
    } catch (err) {
        await new Promise((r) =>
            setTimeout(r, 500 + Math.floor(Math.random() * 1500)),
        )
        return await fetchOnce(url).catch((_e) => {
            throw new TransientError(
                err instanceof Error ? err.message : String(err),
            )
        })
    }
}

async function callSpoonacular<T>(
    url: URL,
    schema: z.ZodType<T>,
    ttlMs: number,
): Promise<T> {
    const cacheKey = cacheKeyForUrl(url)
    const cached = readCache(cacheKey, ttlMs)
    if (cached !== null) {
        const parsed = schema.safeParse(cached)
        if (parsed.success) {
            return parsed.data
        }
    }
    const res = await fetchWithRetry(url)
    const quota = parseQuotaHeaders(res)
    persistQuota(quota)
    if (res.status === 402 || res.status === 429) {
        throw new QuotaExceededError()
    }
    if (res.status === 404) {
        throw new NotFoundError()
    }
    if (!res.ok) {
        throw new TransientError(`Spoonacular HTTP ${res.status}`)
    }
    let body: unknown
    try {
        body = await res.json()
    } catch (err) {
        throw new MalformedResponseError(
            err instanceof Error ? err.message : String(err),
        )
    }
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
        throw new MalformedResponseError(parsed.error.message)
    }
    writeCache(cacheKey, body)
    return parsed.data
}

export async function searchRecipes(
    query: string,
    options: { number?: number } = {},
): Promise<SearchResult> {
    const url = buildUrl('/recipes/complexSearch', {
        query,
        number: options.number ?? 10,
    })
    return callSpoonacular(url, searchResultSchema, SEARCH_TTL_MS)
}

export async function getRecipeById(id: number): Promise<RecipeDetail> {
    const url = buildUrl(`/recipes/${id}/information`, {
        includeNutrition: 'false',
    })
    return callSpoonacular(url, recipeDetailSchema, RECIPE_TTL_MS)
}

export async function extractRecipeByUrl(
    sourceUrl: string,
): Promise<RecipeDetail> {
    const url = buildUrl('/recipes/extract', {
        url: sourceUrl,
        analyze: 'true',
    })
    return callSpoonacular(url, recipeDetailSchema, RECIPE_TTL_MS)
}

export function readPersistedQuota(): SpoonacularQuota | null {
    const row = db
        .select()
        .from(spoonacularQuota)
        .where(eq(spoonacularQuota.id, QUOTA_SINGLETON_ID))
        .get()
    if (!row) return null
    return {
        used: row.quotaUsed,
        left: row.quotaLeft,
        request: row.quotaRequest,
    }
}
