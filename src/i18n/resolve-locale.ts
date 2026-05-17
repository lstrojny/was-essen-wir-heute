import 'server-only'

import { headers } from 'next/headers'
import { getAuthenticatedSession } from '@/auth/session'
import {
    DEFAULT_LOCALE,
    isSupportedLocale,
    type Locale,
} from './locale'

function parseAcceptLanguage(header: string | null): Locale {
    if (!header) {
        return DEFAULT_LOCALE
    }
    const entries = header
        .split(',')
        .map((part) => {
            const [tag, ...rest] = part.trim().split(';')
            const qPart = rest.find((s) => s.trim().startsWith('q='))
            const q = qPart ? Number(qPart.trim().slice(2)) : 1
            return { tag: tag.toLowerCase(), q: Number.isFinite(q) ? q : 0 }
        })
        .sort((a, b) => b.q - a.q)
    for (const { tag } of entries) {
        const primary = tag.split('-')[0]
        if (isSupportedLocale(primary)) {
            return primary
        }
    }
    return DEFAULT_LOCALE
}

export async function resolveLocale(): Promise<Locale> {
    const session = await getAuthenticatedSession()
    if (session) {
        return session.user.language
    }
    const h = await headers()
    return parseAcceptLanguage(h.get('accept-language'))
}
