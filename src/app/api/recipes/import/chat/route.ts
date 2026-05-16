import { convertToModelMessages, type UIMessage } from 'ai'
import { NextResponse } from 'next/server'
import { getAuthenticatedSession } from '@/auth/session'
import { resolveLocale } from '@/i18n/locale'
import { chatAboutRecipe } from '@/llm/recipe-synthesis'
import { buildChatTools } from '@/llm/tools'

type RequestBody = {
    messages?: UIMessage[]
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
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
        return NextResponse.json({ error: 'empty_messages' }, { status: 400 })
    }
    const activeLanguage = await resolveLocale()
    const tools = buildChatTools({ user: session.user, activeLanguage })
    const result = chatAboutRecipe({
        messages: await convertToModelMessages(body.messages),
        activeLanguage,
        abortSignal: request.signal,
        tools,
    })
    return result.toUIMessageStreamResponse()
}
