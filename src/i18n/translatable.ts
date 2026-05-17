import { z } from 'zod'
import { type Locale, type LocaleMap, SUPPORTED_LOCALES } from './locale'

export type ResolvedString = {
    text: string
    locale: Locale
    isFallback: boolean
}

/**
 * Resolve a translatable value to a single string for display, falling back
 * across the remaining supported locales (in their declared order) when the
 * preferred locale is absent. Returns null if no locale has a value.
 *
 * Use this anywhere you'd otherwise reach for `m.de ?? m.en` style ternaries
 * — those hardcode the two-locale shape and have to be hunted down whenever
 * the supported set grows.
 */
export function resolveText(
    map: LocaleMap,
    preferred: Locale,
): ResolvedString | null {
    const preferredText = map[preferred]
    if (preferredText !== undefined) {
        return { text: preferredText, locale: preferred, isFallback: false }
    }
    for (const locale of SUPPORTED_LOCALES) {
        if (locale === preferred) continue
        const value = map[locale]
        if (value !== undefined) {
            return { text: value, locale, isFallback: true }
        }
    }
    return null
}

/**
 * Apply a sparse locale-keyed patch on top of an existing LocaleMap, returning
 * a new map where every patched locale is set and untouched locales are
 * preserved.
 */
export function mergeLocaleMap(base: LocaleMap, patch: LocaleMap): LocaleMap {
    const out: LocaleMap = { ...base }
    for (const locale of SUPPORTED_LOCALES) {
        const next = patch[locale]
        if (next !== undefined) {
            out[locale] = next
        }
    }
    return out
}

/**
 * Zod schema for a translatable value keyed by every supported locale, with
 * each locale string required. Shape is built from SUPPORTED_LOCALES so it
 * generalises automatically.
 */
export function requiredLocaleMapSchema(): z.ZodObject<
    { [K in Locale]: z.ZodString }
> {
    const shape = {} as { [K in Locale]: z.ZodString }
    for (const locale of SUPPORTED_LOCALES) {
        shape[locale] = z.string()
    }
    return z.object(shape)
}

/**
 * Zod schema for a translatable value where every supported-locale key is
 * optional. Inferred type matches `LocaleMap`.
 */
export function optionalLocaleMapSchema(): z.ZodObject<
    { [K in Locale]: z.ZodOptional<z.ZodString> }
> {
    const shape = {} as { [K in Locale]: z.ZodOptional<z.ZodString> }
    for (const locale of SUPPORTED_LOCALES) {
        shape[locale] = z.string().optional()
    }
    return z.object(shape)
}
