import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import {
    ingredientLookupFolded,
    ingredientsAliases,
    ingredientsTranslated,
} from '@/db/schema'
import { readGroup } from '@/i18n/translations'
import { resetDb } from '@/test/db'
import { makeIngredient } from '@/test/fixtures'
import type { IngredientId } from '@/db/ids'
import { foldForMatch } from './name-match'
import {
    deleteAllIngredientTranslations,
    deleteIngredientAliasById,
    findFoldedNameOwner,
    rebuildIngredientLookupFolded,
    writeIngredientAliasGroup,
    writeIngredientCanonical,
} from './translation-writes'

beforeEach(() => {
    resetDb()
})

function canonicalLink(ingredientId: IngredientId) {
    return db
        .select()
        .from(ingredientsTranslated)
        .where(eq(ingredientsTranslated.ingredientId, ingredientId))
        .get()
}

function lookupRowsFor(ingredientId: IngredientId) {
    return db
        .select()
        .from(ingredientLookupFolded)
        .where(eq(ingredientLookupFolded.ingredientId, ingredientId))
        .all()
}

describe('writeIngredientCanonical — create', () => {
    it('inserts a join row + translated_strings group for the canonical', () => {
        const ingId = makeIngredient()
        writeIngredientCanonical(ingId, { de: 'Apfel', en: 'Apple' })
        const link = canonicalLink(ingId)
        expect(link).toBeDefined()
        expect(readGroup(link!.translatedStringId, 'de')?.text).toBe('Apfel')
    })

    it('seeds ingredient_lookup_folded with one row per canonical locale', () => {
        const ingId = makeIngredient()
        writeIngredientCanonical(ingId, { de: 'Apfel', en: 'Apple' })
        const rows = lookupRowsFor(ingId)
        expect(rows).toHaveLength(2)
        expect(rows.every((r) => r.kind === 'canonical')).toBe(true)
        expect(rows.map((r) => r.stringFolded).sort()).toEqual(
            ['apfel', 'apple'].sort(),
        )
    })

    it('writes a single shadow row when both locales fold to the same value', () => {
        // German spelling and English spelling fold identically: "Pasta"/"Pasta"
        const ingId = makeIngredient()
        writeIngredientCanonical(ingId, { de: 'Pasta', en: 'Pasta' })
        const rows = lookupRowsFor(ingId)
        // INSERT OR IGNORE collapses duplicate folded values across locales.
        expect(rows).toHaveLength(1)
    })
})

describe('writeIngredientCanonical — update', () => {
    it('replaces the locale rows and rebuilds the lookup shadow', () => {
        const ingId = makeIngredient()
        writeIngredientCanonical(ingId, { de: 'Apfel', en: 'Apple' })

        // Rename to a different value entirely
        writeIngredientCanonical(ingId, { de: 'Birne', en: 'Pear' })

        const link = canonicalLink(ingId)
        expect(readGroup(link!.translatedStringId, 'de')?.text).toBe('Birne')
        const rows = lookupRowsFor(ingId)
        expect(rows.map((r) => r.stringFolded).sort()).toEqual(
            ['birne', 'pear'].sort(),
        )
    })

    it('keeps the same group id across an edit', () => {
        const ingId = makeIngredient()
        writeIngredientCanonical(ingId, { de: 'Apfel' })
        const first = canonicalLink(ingId)!.translatedStringId
        writeIngredientCanonical(ingId, { de: 'Apfel', en: 'Apple' })
        const second = canonicalLink(ingId)!.translatedStringId
        expect(second).toBe(first)
    })
})

describe('writeIngredientCanonical — delete', () => {
    it('removes the join row, the group, and all lookup-folded rows', () => {
        const ingId = makeIngredient()
        writeIngredientCanonical(ingId, { de: 'Apfel', en: 'Apple' })
        const groupId = canonicalLink(ingId)!.translatedStringId

        writeIngredientCanonical(ingId, {})
        expect(canonicalLink(ingId)).toBeUndefined()
        expect(readGroup(groupId, 'de')).toBeNull()
        expect(lookupRowsFor(ingId)).toHaveLength(0)
    })
})

describe('writeIngredientAliasGroup — create', () => {
    it('creates a new alias row + group when existingId is null', () => {
        const ingId = makeIngredient()
        writeIngredientCanonical(ingId, { de: 'Apfel' })
        const aliasId = writeIngredientAliasGroup(ingId, null, {
            de: 'Boskoop',
            en: 'Boskoop',
        })
        expect(aliasId).not.toBeNull()
        const row = db
            .select()
            .from(ingredientsAliases)
            .where(eq(ingredientsAliases.id, aliasId!))
            .get()
        expect(row?.ingredientId).toBe(ingId)
        expect(readGroup(row!.translatedStringId, 'de')?.text).toBe('Boskoop')
    })

    it('adds alias-kind rows to the lookup shadow alongside the canonical', () => {
        const ingId = makeIngredient()
        writeIngredientCanonical(ingId, { de: 'Apfel' })
        writeIngredientAliasGroup(ingId, null, { de: 'Boskoop' })
        const rows = lookupRowsFor(ingId)
        const kinds = rows.map((r) => r.kind).sort()
        expect(kinds).toEqual(['alias', 'canonical'])
    })

    it('returns null and is a no-op for an empty text map with no existingId', () => {
        const ingId = makeIngredient()
        const result = writeIngredientAliasGroup(ingId, null, {})
        expect(result).toBeNull()
        expect(lookupRowsFor(ingId)).toHaveLength(0)
    })
})

describe('writeIngredientAliasGroup — update', () => {
    it('replaces the locale rows of an existing alias in place', () => {
        const ingId = makeIngredient()
        const aliasId = writeIngredientAliasGroup(ingId, null, { de: 'Boskoop' })
        const after = writeIngredientAliasGroup(ingId, aliasId, {
            de: 'Boskop',
            en: 'Boskop',
        })
        expect(after).toBe(aliasId)
        const row = db
            .select()
            .from(ingredientsAliases)
            .where(eq(ingredientsAliases.id, aliasId!))
            .get()
        expect(readGroup(row!.translatedStringId, 'de')?.text).toBe('Boskop')
        expect(readGroup(row!.translatedStringId, 'en')?.text).toBe('Boskop')
    })

    it('deletes the alias when the new text map is empty', () => {
        const ingId = makeIngredient()
        const aliasId = writeIngredientAliasGroup(ingId, null, { de: 'Boskoop' })
        const after = writeIngredientAliasGroup(ingId, aliasId, {})
        expect(after).toBeNull()
        const row = db
            .select()
            .from(ingredientsAliases)
            .where(eq(ingredientsAliases.id, aliasId!))
            .get()
        expect(row).toBeUndefined()
    })
})

describe('deleteIngredientAliasById', () => {
    it('deletes the alias row + group and returns the owning ingredient id', () => {
        const ingId = makeIngredient()
        const aliasId = writeIngredientAliasGroup(ingId, null, { de: 'Boskoop' })
        const returned = deleteIngredientAliasById(aliasId!)
        expect(returned).toBe(ingId)
        const row = db
            .select()
            .from(ingredientsAliases)
            .where(eq(ingredientsAliases.id, aliasId!))
            .get()
        expect(row).toBeUndefined()
    })

    it('returns null when the alias id does not exist', () => {
        const ingId = makeIngredient()
        // Borrow a fresh-but-unused id from the alias factory by creating
        // and immediately deleting one.
        const aliasId = writeIngredientAliasGroup(ingId, null, { de: 'Tmp' })!
        deleteIngredientAliasById(aliasId)
        expect(deleteIngredientAliasById(aliasId)).toBeNull()
    })
})

describe('deleteAllIngredientTranslations', () => {
    it('removes every canonical and alias translation group for the ingredient', () => {
        const ingId = makeIngredient()
        writeIngredientCanonical(ingId, { de: 'Apfel' })
        const aliasId = writeIngredientAliasGroup(ingId, null, { de: 'Boskoop' })
        const canonGroup = canonicalLink(ingId)!.translatedStringId
        const aliasGroup = db
            .select()
            .from(ingredientsAliases)
            .where(eq(ingredientsAliases.id, aliasId!))
            .get()!.translatedStringId

        deleteAllIngredientTranslations(ingId)
        expect(readGroup(canonGroup, 'de')).toBeNull()
        expect(readGroup(aliasGroup, 'de')).toBeNull()
    })
})

describe('rebuildIngredientLookupFolded', () => {
    it('is idempotent — running twice yields the same rows', () => {
        const ingId = makeIngredient()
        writeIngredientCanonical(ingId, { de: 'Apfel', en: 'Apple' })
        writeIngredientAliasGroup(ingId, null, { de: 'Boskoop' })
        const before = lookupRowsFor(ingId)
            .map((r) => `${r.kind}:${r.stringFolded}`)
            .sort()

        rebuildIngredientLookupFolded(ingId)
        const after = lookupRowsFor(ingId)
            .map((r) => `${r.kind}:${r.stringFolded}`)
            .sort()
        expect(after).toEqual(before)
    })
})

describe('findFoldedNameOwner', () => {
    it('returns null when the folded value has no owner', () => {
        expect(findFoldedNameOwner('nonexistent', null)).toBeNull()
    })

    it('returns the canonical owner when a canonical row matches', () => {
        const ingId = makeIngredient()
        writeIngredientCanonical(ingId, { de: 'Apfel' })
        const hit = findFoldedNameOwner(foldForMatch('Apfel'), null)
        expect(hit).toEqual({ ingredientId: ingId, kind: 'canonical' })
    })

    it('returns the alias owner when an alias matches', () => {
        const ingId = makeIngredient()
        writeIngredientCanonical(ingId, { de: 'Apfel' })
        writeIngredientAliasGroup(ingId, null, { de: 'Boskoop' })
        const hit = findFoldedNameOwner(foldForMatch('Boskoop'), null)
        expect(hit).toEqual({ ingredientId: ingId, kind: 'alias' })
    })

    it('ignores rows owned by the excluded ingredient', () => {
        const ingId = makeIngredient()
        writeIngredientCanonical(ingId, { de: 'Apfel' })
        expect(findFoldedNameOwner(foldForMatch('Apfel'), ingId)).toBeNull()
    })

    it('still reports a hit on a different ingredient even when one is excluded', () => {
        const ingA = makeIngredient()
        const ingB = makeIngredient()
        writeIngredientCanonical(ingA, { de: 'Apfel' })
        writeIngredientCanonical(ingB, { de: 'Birne' })
        expect(findFoldedNameOwner(foldForMatch('Apfel'), ingB)).toEqual({
            ingredientId: ingA,
            kind: 'canonical',
        })
    })
})
