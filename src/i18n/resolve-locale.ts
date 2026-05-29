import 'server-only'

import { headers } from 'next/headers'
import { getAuthenticatedSession } from '@/auth/session'
import { parseAcceptLanguage } from './accept-language'
import type { Locale } from './locale'

export async function resolveLocale(): Promise<Locale> {
    const session = await getAuthenticatedSession()
    if (session) {
        return session.user.language
    }
    const h = await headers()
    return parseAcceptLanguage(h.get('accept-language'))
}
