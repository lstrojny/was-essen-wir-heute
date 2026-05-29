import { describe, expect, it } from 'vitest'
import type { RecipeId } from '@/db/ids'
import { flattenSections, type RolledUpRecipe } from './rollup'

const rid = (s: string) => s as RecipeId

function leaf(id: string, title = id): RolledUpRecipe {
    return {
        id: rid(id),
        title: { en: title },
        ownIngredients: [],
        ownSteps: [],
        ownActiveTimeMinutes: 0,
        ownWaitTimeMinutes: 0,
        components: [],
        totalActiveTimeMinutes: 0,
        totalWaitTimeMinutes: 0,
    }
}

function compose(id: string, components: RolledUpRecipe[]): RolledUpRecipe {
    return { ...leaf(id), components }
}

describe('flattenSections', () => {
    it('returns a single-element array for a leaf', () => {
        const r = leaf('r-1')
        expect(flattenSections(r).map((n) => n.id)).toEqual(['r-1'])
    })

    it('emits children before the parent (post-order)', () => {
        const tree = compose('parent', [leaf('child-a'), leaf('child-b')])
        expect(flattenSections(tree).map((n) => n.id)).toEqual([
            'child-a',
            'child-b',
            'parent',
        ])
    })

    it('recurses depth-first through nested composites', () => {
        const inner = compose('inner', [leaf('grand-a'), leaf('grand-b')])
        const outer = compose('outer', [inner, leaf('sibling')])
        expect(flattenSections(outer).map((n) => n.id)).toEqual([
            'grand-a',
            'grand-b',
            'inner',
            'sibling',
            'outer',
        ])
    })

    it('preserves the component order at each level', () => {
        const tree = compose('p', [leaf('first'), leaf('second'), leaf('third')])
        const ids = flattenSections(tree).map((n) => String(n.id))
        expect(ids.indexOf('first')).toBeLessThan(ids.indexOf('second'))
        expect(ids.indexOf('second')).toBeLessThan(ids.indexOf('third'))
        expect(ids.at(-1)).toBe('p')
    })
})
