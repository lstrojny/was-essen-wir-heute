'use server'

import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSetupOrSession } from '@/auth/guards'
import {
    extractRecipeByUrl,
    getRecipeById,
    searchRecipes,
} from '@/spoonacular/client'
import {
    MalformedResponseError,
    NotFoundError,
    QuotaExceededError,
    type SearchHit,
    TransientError,
} from '@/spoonacular/types'

export type SpoonacularSearchState = {
    query?: string
    results?: SearchHit[]
    error?: string
}

export type SpoonacularImportState = {
    error?: string
}

async function translateError(err: unknown): Promise<string> {
    const tErr = await getTranslations('errors')
    if (err instanceof QuotaExceededError) {
        return tErr('spoonacularQuotaExceeded')
    }
    if (err instanceof NotFoundError) {
        return tErr('spoonacularNotFound')
    }
    if (err instanceof TransientError) {
        return tErr('spoonacularTransient')
    }
    if (err instanceof MalformedResponseError) {
        return tErr('spoonacularMalformed')
    }
    if (err instanceof Error && err.message.includes('SPOONACULAR_API_KEY')) {
        return tErr('spoonacularNoKey')
    }
    return err instanceof Error ? err.message : String(err)
}

function readString(data: FormData, name: string): string {
    const value = data.get(name)
    return typeof value === 'string' ? value.trim() : ''
}

export async function searchSpoonacularAction(
    _prev: SpoonacularSearchState,
    data: FormData,
): Promise<SpoonacularSearchState> {
    await requireSetupOrSession()
    const query = readString(data, 'query')
    if (!query) {
        return { results: [] }
    }
    try {
        const result = await searchRecipes(query)
        return { query, results: result.results }
    } catch (err) {
        return { query, error: await translateError(err) }
    }
}

export async function importSpoonacularAction(
    _prev: SpoonacularImportState,
    data: FormData,
): Promise<SpoonacularImportState> {
    await requireSetupOrSession()
    const id = readString(data, 'id')
    const url = readString(data, 'url')
    let spoonacularId: number
    try {
        if (id) {
            const numeric = Number(id)
            if (!Number.isInteger(numeric) || numeric <= 0) {
                const tErr = await getTranslations('errors')
                return { error: tErr('spoonacularInvalidId') }
            }
            const detail = await getRecipeById(numeric)
            spoonacularId = detail.id
        } else if (url) {
            const detail = await extractRecipeByUrl(url)
            spoonacularId = detail.id
        } else {
            const tErr = await getTranslations('errors')
            return { error: tErr('spoonacularInvalidId') }
        }
    } catch (err) {
        return { error: await translateError(err) }
    }
    redirect(`/recipes/import/spoonacular/${spoonacularId}`)
}
