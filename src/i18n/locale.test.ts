import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCALE, isSupportedLocale, SUPPORTED_LOCALES } from './locale'

describe('SUPPORTED_LOCALES', () => {
    it('lists every locale the app supports', () => {
        expect(SUPPORTED_LOCALES).toEqual(['de', 'en'])
    })

    it('includes the default locale', () => {
        expect(SUPPORTED_LOCALES).toContain(DEFAULT_LOCALE)
    })
})

describe('isSupportedLocale', () => {
    it('returns true for declared locales', () => {
        for (const locale of SUPPORTED_LOCALES) {
            expect(isSupportedLocale(locale)).toBe(true)
        }
    })

    it('returns false for unknown locales', () => {
        expect(isSupportedLocale('fr')).toBe(false)
        expect(isSupportedLocale('')).toBe(false)
        expect(isSupportedLocale('DE')).toBe(false) // case-sensitive
        expect(isSupportedLocale('de-DE')).toBe(false) // full tags rejected
    })
})
