export const SUPPORTED_LOCALES = ['de', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'de'

/**
 * A translatable content value: a (possibly partial) map from locale to its
 * rendered string. Absence of a key means "no translation in that locale" —
 * there is no null-text state. Mirrors the `translated_strings (id, locale,
 * string)` shape in the DB.
 */
export type LocaleMap = Partial<Record<Locale, string>>

const SUPPORTED_SET = new Set<string>(SUPPORTED_LOCALES)

export function isSupportedLocale(value: string): value is Locale {
    return SUPPORTED_SET.has(value)
}
