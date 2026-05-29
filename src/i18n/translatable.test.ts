import { describe, expect, it } from 'vitest'
import type { LocaleMap } from './locale'
import {
    mergeLocaleMap,
    optionalLocaleMapSchema,
    requiredLocaleMapSchema,
    resolveText,
} from './translatable'

describe('resolveText', () => {
    it('returns the preferred locale verbatim when present', () => {
        const map: LocaleMap = { de: 'Pasta', en: 'Pasta' }
        expect(resolveText(map, 'de')).toEqual({
            text: 'Pasta',
            locale: 'de',
            isFallback: false,
        })
    })

    it('falls back to another supported locale and marks it as a fallback', () => {
        const map: LocaleMap = { en: 'Carbonara' }
        expect(resolveText(map, 'de')).toEqual({
            text: 'Carbonara',
            locale: 'en',
            isFallback: true,
        })
    })

    it('treats an empty string as a present value (not absent)', () => {
        // Spec: "Absence of a row means no translation". Empty string is a
        // real (if pathological) translation, distinct from missing.
        expect(resolveText({ de: '' }, 'de')).toEqual({
            text: '',
            locale: 'de',
            isFallback: false,
        })
    })

    it('returns null when no locale has a value', () => {
        expect(resolveText({}, 'de')).toBeNull()
    })

    it('does not invent a fallback to the preferred locale itself', () => {
        const map: LocaleMap = { de: 'Nudeln' }
        const r = resolveText(map, 'de')
        expect(r?.isFallback).toBe(false)
    })
})

describe('mergeLocaleMap', () => {
    it('overlays patched locales onto the base', () => {
        const base: LocaleMap = { de: 'alt', en: 'old' }
        const patch: LocaleMap = { en: 'new' }
        expect(mergeLocaleMap(base, patch)).toEqual({ de: 'alt', en: 'new' })
    })

    it('adds locales not present in the base', () => {
        expect(mergeLocaleMap({ de: 'da' }, { en: 'en' })).toEqual({
            de: 'da',
            en: 'en',
        })
    })

    it('treats undefined patch values as "do not touch"', () => {
        const base: LocaleMap = { de: 'keep', en: 'keep too' }
        const patch: LocaleMap = { en: undefined }
        expect(mergeLocaleMap(base, patch)).toEqual({
            de: 'keep',
            en: 'keep too',
        })
    })

    it('returns a new object (no mutation of base)', () => {
        const base: LocaleMap = { de: 'a' }
        const out = mergeLocaleMap(base, { en: 'b' })
        expect(out).not.toBe(base)
        expect(base).toEqual({ de: 'a' })
    })

    it('preserves an empty-string patch value', () => {
        expect(mergeLocaleMap({ de: 'old' }, { de: '' })).toEqual({ de: '' })
    })
})

describe('requiredLocaleMapSchema', () => {
    const schema = requiredLocaleMapSchema()

    it('accepts an object with every supported locale present', () => {
        expect(schema.safeParse({ de: 'a', en: 'b' }).success).toBe(true)
    })

    it('rejects an object missing any supported locale', () => {
        expect(schema.safeParse({ de: 'a' }).success).toBe(false)
        expect(schema.safeParse({ en: 'b' }).success).toBe(false)
        expect(schema.safeParse({}).success).toBe(false)
    })

    it('rejects non-string values', () => {
        expect(schema.safeParse({ de: 1, en: 'b' }).success).toBe(false)
    })
})

describe('optionalLocaleMapSchema', () => {
    const schema = optionalLocaleMapSchema()

    it('accepts every subset of supported locales', () => {
        expect(schema.safeParse({}).success).toBe(true)
        expect(schema.safeParse({ de: 'a' }).success).toBe(true)
        expect(schema.safeParse({ en: 'b' }).success).toBe(true)
        expect(schema.safeParse({ de: 'a', en: 'b' }).success).toBe(true)
    })

    it('rejects non-string values', () => {
        expect(schema.safeParse({ de: null }).success).toBe(false)
    })
})
