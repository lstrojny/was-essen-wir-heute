import { describe, expect, it } from 'vitest'
import { foldForMatch } from './name-match'

describe('foldForMatch', () => {
    it('returns lowercase for plain ASCII input', () => {
        expect(foldForMatch('Tomato')).toBe('tomato')
        expect(foldForMatch('OLIVE OIL')).toBe('olive oil')
    })

    it('trims leading and trailing whitespace', () => {
        expect(foldForMatch('  spinach  ')).toBe('spinach')
    })

    it('collapses NFC/NFD diacritic representations to one form', () => {
        const precomposed = 'Müller' // ü as single code point
        const decomposed = 'Müller' // u + combining diaeresis
        expect(foldForMatch(precomposed)).toBe(foldForMatch(decomposed))
    })

    it('expands German umlauts to digraphs (ae, oe, ue)', () => {
        expect(foldForMatch('Öl')).toBe('oel')
        expect(foldForMatch('Müller')).toBe('mueller')
        expect(foldForMatch('Käse')).toBe('kaese')
    })

    it('expands ß to ss', () => {
        expect(foldForMatch('Straße')).toBe('strasse')
    })

    it('matches the digraph form against the spelled-out form', () => {
        expect(foldForMatch('Öl')).toBe(foldForMatch('Oel'))
        expect(foldForMatch('Müller')).toBe(foldForMatch('Mueller'))
        expect(foldForMatch('Straße')).toBe(foldForMatch('Strasse'))
    })

    it('strips non-German diacritics generically', () => {
        expect(foldForMatch('café')).toBe('cafe')
        expect(foldForMatch('jalapeño')).toBe('jalapeno')
        expect(foldForMatch('Čevapčići')).toBe('cevapcici')
        expect(foldForMatch('crème fraîche')).toBe('creme fraiche')
    })

    it('preserves the German digraph expansion when other diacritics are also stripped', () => {
        // ü becomes ue (digraph), é becomes e (generic strip).
        expect(foldForMatch('Müesli é')).toBe('mueesli e')
    })

    it('lowercases under German locale rules', () => {
        // Plain lowercasing — and the digraph step runs after, so this still
        // ends up consistent.
        expect(foldForMatch('Ä')).toBe('ae')
    })

    it('is idempotent', () => {
        const inputs = ['Müller', 'jalapeño', 'Straße', 'OLIVE OIL', '  spinach  ']
        for (const s of inputs) {
            expect(foldForMatch(foldForMatch(s))).toBe(foldForMatch(s))
        }
    })

    it('returns an empty string for empty input', () => {
        expect(foldForMatch('')).toBe('')
        expect(foldForMatch('   ')).toBe('')
    })
})
