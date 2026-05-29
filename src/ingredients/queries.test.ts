import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { newIngredientCountUnitId, newRecipeIngredientId } from '@/db/ids'
import { ingredientCountUnits, recipeIngredients } from '@/db/schema'
import { resetDb } from '@/test/db'
import { makeIngredient, makeRecipe } from '@/test/fixtures'
import {
    findAliasConflict,
    findIngredientByName,
    getIngredient,
    listIngredients,
} from './queries'
import {
    writeIngredientAliasGroup,
    writeIngredientCanonical,
} from './translation-writes'

beforeEach(() => {
    resetDb()
})

describe('listIngredients — empty state', () => {
    it('returns an empty array when the catalog is empty', () => {
        expect(listIngredients('')).toEqual([])
    })
})

describe('listIngredients — sorting and shape', () => {
    it('sorts rows alphabetically by German canonical', () => {
        const a = makeIngredient()
        const b = makeIngredient()
        const c = makeIngredient()
        writeIngredientCanonical(a, { de: 'Zwiebel' })
        writeIngredientCanonical(b, { de: 'Apfel' })
        writeIngredientCanonical(c, { de: 'Möhre' })
        const result = listIngredients('').map((r) => r.canonical.de)
        expect(result).toEqual(['Apfel', 'Möhre', 'Zwiebel'])
    })

    it('reports alias and count-unit cardinality per row', () => {
        const id = makeIngredient()
        writeIngredientCanonical(id, { de: 'Apfel' })
        writeIngredientAliasGroup(id, null, { de: 'Boskoop' })
        writeIngredientAliasGroup(id, null, { de: 'Granny Smith' })
        db.insert(ingredientCountUnits)
            .values({
                id: newIngredientCountUnitId(),
                ingredientId: id,
                unit: 'piece',
                gramsPerUnit: 150,
            })
            .run()
        const row = listIngredients('').find((r) => r.id === id)
        expect(row?.aliasCount).toBe(2)
        expect(row?.countUnitCount).toBe(1)
    })
})

describe('listIngredients — search', () => {
    it('matches canonicals across folded form (umlauts and digraphs)', () => {
        const a = makeIngredient()
        const b = makeIngredient()
        writeIngredientCanonical(a, { de: 'Öl' })
        writeIngredientCanonical(b, { de: 'Kartoffel' })
        // Searching "oel" must find "Öl" via German digraph folding.
        const hits = listIngredients('oel').map((r) => r.id)
        expect(hits).toContain(a)
        expect(hits).not.toContain(b)
    })

    it('matches aliases as well as canonicals', () => {
        const id = makeIngredient()
        writeIngredientCanonical(id, { de: 'Apfel' })
        writeIngredientAliasGroup(id, null, { de: 'Boskoop' })
        const hits = listIngredients('Boskoop').map((r) => r.id)
        expect(hits).toContain(id)
    })

    it('falls through to an empty result when nothing matches', () => {
        const id = makeIngredient()
        writeIngredientCanonical(id, { de: 'Apfel' })
        expect(listIngredients('xyz-no-match')).toEqual([])
    })

    it('treats an all-whitespace query as no filter', () => {
        const id = makeIngredient()
        writeIngredientCanonical(id, { de: 'Apfel' })
        expect(listIngredients('   ').map((r) => r.id)).toContain(id)
    })
})

describe('listIngredients — unusedOnly filter', () => {
    it('omits ingredients referenced by recipe_ingredients', () => {
        const used = makeIngredient()
        const free = makeIngredient()
        writeIngredientCanonical(used, { de: 'A' })
        writeIngredientCanonical(free, { de: 'B' })
        const recipeId = makeRecipe()
        db.insert(recipeIngredients)
            .values({
                id: newRecipeIngredientId(),
                recipeId,
                position: 0,
                name: 'A',
                ingredientId: used,
            })
            .run()
        const ids = listIngredients('', true).map((r) => r.id)
        expect(ids).toContain(free)
        expect(ids).not.toContain(used)
    })
})

describe('getIngredient', () => {
    it('returns null for an unknown id', () => {
        expect(getIngredient(makeIngredient())).toEqual({
            id: expect.any(String),
            canonical: {},
            role: 'vegetable',
            density: null,
            notes: null,
            aliases: [],
            countUnits: [],
        })
        // The fresh ingredient has no translations yet — the row is found,
        // but canonical/aliases/countUnits are empty.
    })

    it('returns a full detail row with canonical, aliases, and count units', () => {
        const id = makeIngredient({ role: 'starch', density: 0.65 })
        writeIngredientCanonical(id, { de: 'Apfel', en: 'Apple' })
        writeIngredientAliasGroup(id, null, { de: 'Boskoop' })
        db.insert(ingredientCountUnits)
            .values({
                id: newIngredientCountUnitId(),
                ingredientId: id,
                unit: 'piece',
                gramsPerUnit: 150,
            })
            .run()
        const detail = getIngredient(id)
        expect(detail).toMatchObject({
            id,
            canonical: { de: 'Apfel', en: 'Apple' },
            role: 'starch',
            density: 0.65,
            countUnits: [{ unit: 'piece', gramsPerUnit: 150 }],
        })
        expect(detail?.aliases).toHaveLength(1)
        expect(detail?.aliases[0].text).toEqual({ de: 'Boskoop' })
    })

    it('sorts the count units by unit name', () => {
        const id = makeIngredient()
        for (const unit of ['piece', 'clove', 'leaf']) {
            db.insert(ingredientCountUnits)
                .values({
                    id: newIngredientCountUnitId(),
                    ingredientId: id,
                        unit,
                    gramsPerUnit: 1,
                })
                .run()
        }
        const detail = getIngredient(id)
        expect(detail?.countUnits.map((u) => u.unit)).toEqual([
            'clove',
            'leaf',
            'piece',
        ])
    })
})

describe('findAliasConflict', () => {
    it('returns null for an empty proposed list', () => {
        expect(findAliasConflict([], null, { de: 'X' }, 'de')).toBeNull()
    })

    it('flags an alias that equals the same ingredient’s canonical', () => {
        const conflict = findAliasConflict(
            ['Apfel'],
            null,
            { de: 'Apfel' },
            'de',
        )
        expect(conflict?.reason).toBe('canonical-on-same-ingredient')
        expect(conflict?.alias).toBe('Apfel')
    })

    it('flags collision against another ingredient’s canonical', () => {
        const other = makeIngredient()
        writeIngredientCanonical(other, { de: 'Apfel' })
        const conflict = findAliasConflict(['Apfel'], null, {}, 'de')
        expect(conflict?.reason).toBe('canonical-on-other-ingredient')
        expect(conflict?.ownerId).toBe(other)
        expect(conflict?.ownerLabel).toBe('Apfel')
    })

    it('flags collision against another ingredient’s alias', () => {
        const other = makeIngredient()
        writeIngredientCanonical(other, { de: 'Apfel' })
        writeIngredientAliasGroup(other, null, { de: 'Boskoop' })
        const conflict = findAliasConflict(['Boskoop'], null, {}, 'de')
        expect(conflict?.reason).toBe('alias-on-other-ingredient')
        expect(conflict?.ownerId).toBe(other)
    })

    it('ignores conflicts owned by the excluded ingredient', () => {
        const self = makeIngredient()
        writeIngredientCanonical(self, { de: 'Apfel' })
        writeIngredientAliasGroup(self, null, { de: 'Boskoop' })
        // Re-saving an existing alias against its own owner is not a conflict.
        expect(
            findAliasConflict(['Boskoop'], self, { de: 'Apfel' }, 'de'),
        ).toBeNull()
    })

    it('returns the first conflict and stops scanning', () => {
        const other = makeIngredient()
        writeIngredientCanonical(other, { de: 'Apfel' })
        const conflict = findAliasConflict(
            ['Birne', 'Apfel'], // first slot is free; second collides
            null,
            {},
            'de',
        )
        expect(conflict?.alias).toBe('Apfel')
    })

    it('deduplicates the proposed list internally so a repeated entry is checked once', () => {
        const other = makeIngredient()
        writeIngredientCanonical(other, { de: 'Apfel' })
        // Same fold appears twice — the second occurrence shouldn't double-fire.
        const conflict = findAliasConflict(
            ['Apfel', 'Apfel'],
            null,
            {},
            'de',
        )
        expect(conflict?.alias).toBe('Apfel')
    })
})

describe('findIngredientByName', () => {
    it('returns null when no canonical or alias matches the folded name', () => {
        expect(findIngredientByName('Pasta')).toBeNull()
    })

    it('returns the owning ingredient for a canonical hit', () => {
        const id = makeIngredient()
        writeIngredientCanonical(id, { de: 'Apfel' })
        expect(findIngredientByName('apfel')).toBe(id)
    })

    it('returns the owning ingredient for an alias hit', () => {
        const id = makeIngredient()
        writeIngredientCanonical(id, { de: 'Apfel' })
        writeIngredientAliasGroup(id, null, { de: 'Boskoop' })
        expect(findIngredientByName('Boskoop')).toBe(id)
    })

    it('folds the input before lookup (umlaut/digraph)', () => {
        const id = makeIngredient()
        writeIngredientCanonical(id, { de: 'Öl' })
        expect(findIngredientByName('Oel')).toBe(id)
    })

    it('returns null for empty or whitespace input', () => {
        expect(findIngredientByName('')).toBeNull()
        expect(findIngredientByName('   ')).toBeNull()
    })
})
