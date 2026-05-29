import { describe, expect, it } from 'vitest'
import { parseAcceptLanguage } from './accept-language'

describe('parseAcceptLanguage', () => {
    it('returns the default locale when the header is null or empty', () => {
        expect(parseAcceptLanguage(null)).toBe('de')
        expect(parseAcceptLanguage('')).toBe('de')
    })

    it('returns the default locale when no supported locale is offered', () => {
        expect(parseAcceptLanguage('fr,es,pt')).toBe('de')
    })

    it('picks the first supported locale in declaration order', () => {
        expect(parseAcceptLanguage('en,de')).toBe('en')
        expect(parseAcceptLanguage('de,en')).toBe('de')
    })

    it('honours q-values to choose the highest-weighted supported locale', () => {
        // de has higher q than en — pick de
        expect(parseAcceptLanguage('en;q=0.5,de;q=0.9')).toBe('de')
        // en has higher q than de — pick en
        expect(parseAcceptLanguage('en;q=0.9,de;q=0.5')).toBe('en')
    })

    it('strips region subtags before matching', () => {
        expect(parseAcceptLanguage('de-AT')).toBe('de')
        expect(parseAcceptLanguage('en-US,en-GB')).toBe('en')
    })

    it('skips unsupported entries and matches the next supported one', () => {
        expect(parseAcceptLanguage('fr;q=1.0,de;q=0.5')).toBe('de')
        expect(parseAcceptLanguage('zh,ja,en')).toBe('en')
    })

    it('is case-insensitive on tag prefixes', () => {
        expect(parseAcceptLanguage('DE')).toBe('de')
        expect(parseAcceptLanguage('EN-US')).toBe('en')
    })

    it('tolerates whitespace around entries', () => {
        expect(parseAcceptLanguage(' en , de ')).toBe('en')
    })

    it('treats a malformed q-value as zero weight', () => {
        // en;q=NaN should sort below de;q=0.5 → de wins
        expect(parseAcceptLanguage('en;q=foo,de;q=0.5')).toBe('de')
    })
})
