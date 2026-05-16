import { convertToModelMessages, type UIMessage } from 'ai'
import { NextResponse } from 'next/server'
import { getAuthenticatedSession } from '@/auth/session'
import { resolveLocale } from '@/i18n/locale'
import {
    type SynthesizedRecipe,
    synthesizeRecipe,
    synthesizeRecipeFromMessages,
} from '@/llm/recipe-synthesis'
import { listCuisines } from '@/recipes/queries'

type RequestBody = {
    prompt?: unknown
    currentRecipe?: unknown
    messages?: unknown
}

function isSynthesizedRecipe(value: unknown): value is SynthesizedRecipe {
    return typeof value === 'object' && value !== null && 'titleDe' in value
}

function isUIMessageArray(value: unknown): value is UIMessage[] {
    return (
        Array.isArray(value) &&
        value.every(
            (m) =>
                typeof m === 'object' &&
                m !== null &&
                'role' in m &&
                'parts' in m,
        )
    )
}

export async function POST(request: Request) {
    const session = await getAuthenticatedSession()
    if (!session) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    let body: RequestBody
    try {
        body = (await request.json()) as RequestBody
    } catch {
        return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
    }
    const cuisines = listCuisines()
    const activeLanguage = await resolveLocale()
    try {
        if (isUIMessageArray(body.messages) && body.messages.length > 0) {
            const recipe = await synthesizeRecipeFromMessages({
                messages: await convertToModelMessages(body.messages),
                activeLanguage,
                cuisineKeys: cuisines.map((c) => c.key),
                abortSignal: request.signal,
            })
            return NextResponse.json({ recipe })
        }
        const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
        if (!prompt) {
            return NextResponse.json({ error: 'empty_prompt' }, { status: 400 })
        }
        const currentRecipe = isSynthesizedRecipe(body.currentRecipe)
            ? body.currentRecipe
            : undefined
        const recipe = await synthesizeRecipe({
            prompt,
            activeLanguage,
            cuisineKeys: cuisines.map((c) => c.key),
            currentRecipe,
            abortSignal: request.signal,
        })
        return NextResponse.json({ recipe })
    } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
            return NextResponse.json({ error: 'aborted' }, { status: 499 })
        }
        const message = err instanceof Error ? err.message : String(err)
        return NextResponse.json({ error: message }, { status: 502 })
    }
}
