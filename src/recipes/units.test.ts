import { describe, expect, it } from 'vitest'
import {
    categoryOf,
    COUNT_UNITS_STARTER,
    isKnownUnit,
    MASS_UNITS,
    STANDARD_UNIT_OPTIONS,
    VOLUME_UNITS,
} from './units'

describe('categoryOf', () => {
    it('classifies mass units', () => {
        for (const u of MASS_UNITS) expect(categoryOf(u)).toBe('mass')
    })

    it('classifies volume units', () => {
        for (const u of VOLUME_UNITS) expect(categoryOf(u)).toBe('volume')
    })

    it('classifies starter count units', () => {
        for (const u of COUNT_UNITS_STARTER) expect(categoryOf(u)).toBe('count')
    })

    it('defaults unknown units to the count category', () => {
        expect(categoryOf('handful')).toBe('count')
        expect(categoryOf('')).toBe('count')
    })
})

describe('isKnownUnit', () => {
    it('returns true for every starter unit across all categories', () => {
        for (const u of [
            ...MASS_UNITS,
            ...VOLUME_UNITS,
            ...COUNT_UNITS_STARTER,
        ]) {
            expect(isKnownUnit(u)).toBe(true)
        }
    })

    it('returns false for unknown unit strings', () => {
        expect(isKnownUnit('handful')).toBe(false)
        expect(isKnownUnit('Grams')).toBe(false) // case-sensitive
        expect(isKnownUnit('')).toBe(false)
    })
})

describe('STANDARD_UNIT_OPTIONS', () => {
    it('contains every starter unit exactly once with its category', () => {
        const expected = [
            ...MASS_UNITS.map((value) => ({ value, category: 'mass' })),
            ...VOLUME_UNITS.map((value) => ({ value, category: 'volume' })),
            ...COUNT_UNITS_STARTER.map((value) => ({ value, category: 'count' })),
        ]
        expect(STANDARD_UNIT_OPTIONS).toEqual(expected)
    })

    it('keeps category groupings contiguous (mass → volume → count)', () => {
        const categories = STANDARD_UNIT_OPTIONS.map((o) => o.category)
        const firstVolume = categories.indexOf('volume')
        const firstCount = categories.indexOf('count')
        const lastMass = categories.lastIndexOf('mass')
        const lastVolume = categories.lastIndexOf('volume')
        expect(lastMass).toBeLessThan(firstVolume)
        expect(lastVolume).toBeLessThan(firstCount)
    })
})
