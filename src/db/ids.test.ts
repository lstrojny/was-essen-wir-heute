import { describe, expect, it } from 'vitest'
import {
    asCuisineKey,
    asSessionId,
    newIngredientCountUnitId,
    newIngredientId,
    newIngredientsAliasId,
    newMealPlanEntryId,
    newRecipeComponentId,
    newRecipeId,
    newRecipeIngredientId,
    newRecipeRatingId,
    newRecipeStepId,
    newTranslatedStringGroupId,
    newUserId,
    parseCuisineKey,
    parseIngredientId,
    parseMealPlanEntryId,
    parseRecipeId,
    parseRecipeStepId,
    parseSessionId,
    parseUserId,
} from './ids'

const UUID_V7_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('UUID factories', () => {
    const factories = [
        ['newUserId', newUserId],
        ['newIngredientId', newIngredientId],
        ['newIngredientsAliasId', newIngredientsAliasId],
        ['newIngredientCountUnitId', newIngredientCountUnitId],
        ['newRecipeId', newRecipeId],
        ['newRecipeStepId', newRecipeStepId],
        ['newRecipeIngredientId', newRecipeIngredientId],
        ['newRecipeComponentId', newRecipeComponentId],
        ['newRecipeRatingId', newRecipeRatingId],
        ['newTranslatedStringGroupId', newTranslatedStringGroupId],
        ['newMealPlanEntryId', newMealPlanEntryId],
    ] as const

    for (const [name, factory] of factories) {
        it(`${name} returns a UUIDv7`, () => {
            expect(factory()).toMatch(UUID_V7_RE)
        })
    }

    it('produces distinct IDs on consecutive calls', () => {
        const ids = new Set<string>()
        for (let i = 0; i < 50; i += 1) ids.add(newRecipeId())
        expect(ids.size).toBe(50)
    })

    it('emits IDs that sort time-forward (UUIDv7 property)', () => {
        const a = newRecipeId()
        // small busy-wait isn't needed — uuidv7 advances its internal counter
        const b = newRecipeId()
        const c = newRecipeId()
        const sorted = [a, b, c].slice().sort()
        expect(sorted).toEqual([a, b, c])
    })
})

describe('UUID parsers', () => {
    const parsers = [
        parseUserId,
        parseIngredientId,
        parseRecipeId,
        parseRecipeStepId,
        parseMealPlanEntryId,
    ]
    const valid = '0190f7d8-2c1a-7e5b-8b4f-3a6d4d8c2f0e'

    for (const p of parsers) {
        it(`${p.name} accepts a syntactically valid UUID`, () => {
            expect(p(valid)).toBe(valid)
        })
        it(`${p.name} rejects non-UUID strings`, () => {
            expect(p('')).toBeNull()
            expect(p('not-a-uuid')).toBeNull()
            expect(p('1234')).toBeNull()
        })
    }
})

describe('parseCuisineKey', () => {
    it('accepts lowercase ASCII keys with optional digits and hyphens', () => {
        expect(parseCuisineKey('italian')).toBe('italian')
        expect(parseCuisineKey('middle-east')).toBe('middle-east')
        expect(parseCuisineKey('test123')).toBe('test123')
    })

    it('requires a letter to start', () => {
        expect(parseCuisineKey('1italian')).toBeNull()
        expect(parseCuisineKey('-italian')).toBeNull()
    })

    it('rejects uppercase and unsupported characters', () => {
        expect(parseCuisineKey('Italian')).toBeNull()
        expect(parseCuisineKey('italian!')).toBeNull()
        expect(parseCuisineKey('italian cuisine')).toBeNull()
    })

    it('rejects single-character keys (minimum length 2)', () => {
        expect(parseCuisineKey('a')).toBeNull()
        expect(parseCuisineKey('ab')).toBe('ab')
    })

    it('caps key length at 31 characters', () => {
        const ok = `a${'b'.repeat(30)}` // 31 chars
        const tooLong = `a${'b'.repeat(31)}` // 32 chars
        expect(parseCuisineKey(ok)).toBe(ok)
        expect(parseCuisineKey(tooLong)).toBeNull()
    })

    it('rejects empty input', () => {
        expect(parseCuisineKey('')).toBeNull()
    })
})

describe('asCuisineKey', () => {
    it('passes through any string without validation', () => {
        // Trust-the-source escape hatch; tests pin that it does no parsing.
        expect(asCuisineKey('whatever-shape')).toBe('whatever-shape')
        expect(asCuisineKey('UPPERCASE')).toBe('UPPERCASE')
    })
})

describe('parseSessionId', () => {
    const validHash = 'a'.repeat(64)

    it('accepts 64-character lowercase hex strings', () => {
        expect(parseSessionId(validHash)).toBe(validHash)
        expect(parseSessionId('0123456789abcdef'.repeat(4))).toBeTruthy()
    })

    it('rejects strings of the wrong length', () => {
        expect(parseSessionId('a'.repeat(63))).toBeNull()
        expect(parseSessionId('a'.repeat(65))).toBeNull()
    })

    it('rejects uppercase and non-hex characters', () => {
        expect(parseSessionId('A'.repeat(64))).toBeNull()
        expect(parseSessionId(`${'a'.repeat(63)}!`)).toBeNull()
        expect(parseSessionId(`${'a'.repeat(63)}g`)).toBeNull()
    })
})

describe('asSessionId', () => {
    it('passes through any string without validation', () => {
        expect(asSessionId('not-a-hash')).toBe('not-a-hash')
    })
})
