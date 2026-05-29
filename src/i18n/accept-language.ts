import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from './locale'

/**
 * Parse an HTTP `Accept-Language` header value and return the highest-q
 * supported locale, falling back to `DEFAULT_LOCALE` when nothing in the
 * header matches.
 */
export function parseAcceptLanguage(header: string | null): Locale {
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
