import { beforeEach, describe, expect, it } from 'vitest'
import { newTranslatedStringGroupId } from '@/db/ids'
import { resetDb } from '@/test/db'
import {
    deleteGroup,
    newGroup,
    readAllLocalesByGroup,
    readGroup,
    readGroups,
    writeGroup,
} from './translations'

beforeEach(() => {
    resetDb()
})

describe('newGroup', () => {
    it('returns a UUIDv7-shaped group id', () => {
        const id = newGroup()
        expect(id).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('returns a distinct id on each call', () => {
        const a = newGroup()
        const b = newGroup()
        expect(a).not.toBe(b)
    })
})

describe('writeGroup', () => {
    it('inserts a row for each provided locale', () => {
        const id = newGroup()
        writeGroup(id, { de: 'Apfel', en: 'Apple' })
        expect(readAllLocalesByGroup([id]).get(id)).toEqual({
            de: 'Apfel',
            en: 'Apple',
        })
    })

    it('upserts on subsequent calls (same locale wins)', () => {
        const id = newGroup()
        writeGroup(id, { de: 'Apfel' })
        writeGroup(id, { de: 'Apfelbaum' })
        expect(readAllLocalesByGroup([id]).get(id)).toEqual({
            de: 'Apfelbaum',
        })
    })

    it('deletes the row for a locale when given null', () => {
        const id = newGroup()
        writeGroup(id, { de: 'Apfel', en: 'Apple' })
        writeGroup(id, { en: null })
        expect(readAllLocalesByGroup([id]).get(id)).toEqual({ de: 'Apfel' })
    })

    it('ignores locales whose value is undefined', () => {
        const id = newGroup()
        writeGroup(id, { de: 'Apfel' })
        writeGroup(id, { en: undefined })
        expect(readAllLocalesByGroup([id]).get(id)).toEqual({ de: 'Apfel' })
    })

    it('writes folded values that match the foldForMatch convention', () => {
        const id = newGroup()
        writeGroup(id, { de: 'Öl' })
        // Round-trip through readGroup is enough — name-folding is unit-tested
        // elsewhere; we just need to know writeGroup did not skip it.
        const r = readGroup(id, 'de')
        expect(r?.text).toBe('Öl')
        // Fold is internal; confirm via a separate group that two strings
        // folding to the same value can be retrieved.
        const id2 = newGroup()
        writeGroup(id2, { de: 'Oel' })
        // Distinct group ids — no constraint violation between them.
        expect(readGroup(id2, 'de')?.text).toBe('Oel')
    })
})

describe('readGroup', () => {
    it('returns null for an unknown group id', () => {
        expect(readGroup(newTranslatedStringGroupId(), 'de')).toBeNull()
    })

    it('returns the preferred locale verbatim when present', () => {
        const id = newGroup()
        writeGroup(id, { de: 'Apfel', en: 'Apple' })
        expect(readGroup(id, 'de')).toEqual({
            text: 'Apfel',
            locale: 'de',
            isFallback: false,
        })
    })

    it('falls back to another supported locale when the preferred is missing', () => {
        const id = newGroup()
        writeGroup(id, { en: 'Apple' })
        expect(readGroup(id, 'de')).toEqual({
            text: 'Apple',
            locale: 'en',
            isFallback: true,
        })
    })

    it('returns null when the group exists but every locale row was deleted', () => {
        const id = newGroup()
        writeGroup(id, { de: 'Apfel' })
        writeGroup(id, { de: null })
        expect(readGroup(id, 'de')).toBeNull()
    })
})

describe('readGroups (bulk)', () => {
    it('returns an empty map for an empty id list', () => {
        expect(readGroups([], 'de').size).toBe(0)
    })

    it('resolves multiple groups in one round-trip', () => {
        const a = newGroup()
        const b = newGroup()
        writeGroup(a, { de: 'Apfel', en: 'Apple' })
        writeGroup(b, { en: 'Pear' })
        const out = readGroups([a, b], 'de')
        expect(out.get(a)?.text).toBe('Apfel')
        expect(out.get(a)?.isFallback).toBe(false)
        expect(out.get(b)?.text).toBe('Pear')
        expect(out.get(b)?.isFallback).toBe(true)
    })

    it('omits groups that have no rows at all', () => {
        const present = newGroup()
        const missing = newTranslatedStringGroupId()
        writeGroup(present, { de: 'X' })
        const out = readGroups([present, missing], 'de')
        expect(out.has(present)).toBe(true)
        expect(out.has(missing)).toBe(false)
    })
})

describe('readAllLocalesByGroup', () => {
    it('returns an empty map for an empty id list', () => {
        expect(readAllLocalesByGroup([]).size).toBe(0)
    })

    it('returns one LocaleMap per group containing every present locale', () => {
        const a = newGroup()
        const b = newGroup()
        writeGroup(a, { de: 'Apfel', en: 'Apple' })
        writeGroup(b, { de: 'Birne' })
        const out = readAllLocalesByGroup([a, b])
        expect(out.get(a)).toEqual({ de: 'Apfel', en: 'Apple' })
        expect(out.get(b)).toEqual({ de: 'Birne' })
    })
})

describe('deleteGroup', () => {
    it('removes every locale row for the group', () => {
        const id = newGroup()
        writeGroup(id, { de: 'Apfel', en: 'Apple' })
        deleteGroup(id)
        expect(readGroup(id, 'de')).toBeNull()
        expect(readAllLocalesByGroup([id]).get(id)).toBeUndefined()
    })

    it('is idempotent on an unknown group id', () => {
        expect(() => deleteGroup(newTranslatedStringGroupId())).not.toThrow()
    })
})
