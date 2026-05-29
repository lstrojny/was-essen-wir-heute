import { describe, expect, it } from 'vitest'
import type {
    CuisineKey,
    IngredientId,
    RecipeId,
} from '@/db/ids'
import { asIsoDate, type IsoDate } from './dates'
import type { CandidateMeta, Role } from './queries'
import {
    compareTieBreak,
    type Placement,
    scoreCandidate,
    scoreCandidates,
    type Scored,
} from './scoring'

const rid = (s: string) => s as RecipeId
const iid = (s: string) => s as IngredientId
const ck = (s: string) => s as CuisineKey

function makeCandidate(overrides: Partial<CandidateMeta> = {}): CandidateMeta {
    return {
        id: rid('r-a'),
        title: { de: 'Pasta', en: 'Pasta' },
        cuisineKey: ck('italian'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        ratingAverage: null,
        ratingCount: 0,
        rolesByIngredient: new Map<IngredientId, Role>(),
        ...overrides,
    }
}

function makePlacement(overrides: Partial<Placement> = {}): Placement {
    return {
        date: asIsoDate('2026-05-22'),
        recipeId: rid('r-other'),
        cuisineKey: ck('thai'),
        rolesByIngredient: new Map<IngredientId, Role>(),
        ...overrides,
    }
}

const slot = asIsoDate('2026-05-23')
const windowStart = asIsoDate('2026-05-22')

describe('scoreCandidate — rating signal', () => {
    it('awards a mild positive nudge to unrated recipes', () => {
        const c = makeCandidate({ ratingCount: 0, ratingAverage: null })
        expect(scoreCandidate(c, slot, [], null, windowStart, 4)).toBe(2)
    })

    it('awards a strong positive for averages at or above 4.0', () => {
        const c = makeCandidate({ ratingCount: 3, ratingAverage: 4.0 })
        expect(scoreCandidate(c, slot, [], null, windowStart, 4)).toBe(6)
    })

    it('awards a strong negative for averages below 3.0', () => {
        const c = makeCandidate({ ratingCount: 3, ratingAverage: 2.9 })
        expect(scoreCandidate(c, slot, [], null, windowStart, 4)).toBe(-8)
    })

    it('is neutral for averages in [3.0, 4.0)', () => {
        const c = makeCandidate({ ratingCount: 3, ratingAverage: 3.5 })
        expect(scoreCandidate(c, slot, [], null, windowStart, 4)).toBe(0)
        const edge = makeCandidate({ ratingCount: 3, ratingAverage: 3.0 })
        expect(scoreCandidate(edge, slot, [], null, windowStart, 4)).toBe(0)
    })
})

describe('scoreCandidate — variety penalty', () => {
    const tomato = iid('ing-tomato')
    const beef = iid('ing-beef')

    it('penalises role overlap on adjacent days more than non-adjacent', () => {
        const candidate = makeCandidate({
            ratingCount: 3,
            ratingAverage: 3.5, // neutral, isolate variety
            rolesByIngredient: new Map<IngredientId, Role>([
                [tomato, 'vegetable'],
            ]),
        })
        const adjacent = makePlacement({
            date: asIsoDate('2026-05-22'),
            rolesByIngredient: new Map<IngredientId, Role>([
                [tomato, 'vegetable'],
            ]),
        })
        const nonAdjacent = makePlacement({
            date: asIsoDate('2026-05-20'),
            rolesByIngredient: new Map<IngredientId, Role>([
                [tomato, 'vegetable'],
            ]),
        })
        expect(
            scoreCandidate(candidate, slot, [adjacent], null, windowStart, 4),
        ).toBe(-4)
        expect(
            scoreCandidate(candidate, slot, [nonAdjacent], null, windowStart, 4),
        ).toBe(-1.5)
    })

    it('scales the penalty by the number of overlapping roles', () => {
        const candidate = makeCandidate({
            ratingCount: 3,
            ratingAverage: 3.5,
            rolesByIngredient: new Map<IngredientId, Role>([
                [tomato, 'vegetable'],
                [beef, 'protein'],
            ]),
        })
        const adjacent = makePlacement({
            date: asIsoDate('2026-05-22'),
            rolesByIngredient: new Map<IngredientId, Role>([
                [tomato, 'vegetable'],
                [beef, 'protein'],
            ]),
        })
        expect(
            scoreCandidate(candidate, slot, [adjacent], null, windowStart, 4),
        ).toBe(-8)
    })

    it('does not penalise when the same ingredient sits in a different role', () => {
        const candidate = makeCandidate({
            ratingCount: 3,
            ratingAverage: 3.5,
            rolesByIngredient: new Map<IngredientId, Role>([
                [tomato, 'vegetable'],
            ]),
        })
        const adjacent = makePlacement({
            date: asIsoDate('2026-05-22'),
            rolesByIngredient: new Map<IngredientId, Role>([
                [tomato, 'starch'],
            ]),
        })
        expect(
            scoreCandidate(candidate, slot, [adjacent], null, windowStart, 4),
        ).toBe(0)
    })
})

describe('scoreCandidate — cuisine adjacency', () => {
    it('penalises adjacent days that share a cuisine', () => {
        const candidate = makeCandidate({
            ratingCount: 3,
            ratingAverage: 3.5,
            cuisineKey: ck('italian'),
        })
        const adjacent = makePlacement({
            date: asIsoDate('2026-05-22'),
            cuisineKey: ck('italian'),
        })
        expect(
            scoreCandidate(candidate, slot, [adjacent], null, windowStart, 4),
        ).toBe(-1.5)
    })

    it('does not penalise non-adjacent days with the same cuisine', () => {
        const candidate = makeCandidate({
            ratingCount: 3,
            ratingAverage: 3.5,
            cuisineKey: ck('italian'),
        })
        const farAway = makePlacement({
            date: asIsoDate('2026-05-20'),
            cuisineKey: ck('italian'),
        })
        expect(
            scoreCandidate(candidate, slot, [farAway], null, windowStart, 4),
        ).toBe(0)
    })
})

describe('scoreCandidate — repetition penalty', () => {
    it('peaks at the full penalty when lastEaten coincides with the window start', () => {
        const candidate = makeCandidate({ ratingCount: 3, ratingAverage: 3.5 })
        // daysSince = 0 → freshness = 1 → full -3 penalty.
        expect(
            scoreCandidate(candidate, slot, [], windowStart, windowStart, 4),
        ).toBeCloseTo(-3, 5)
    })

    it('decays linearly across the look-back window', () => {
        const candidate = makeCandidate({ ratingCount: 3, ratingAverage: 3.5 })
        // 7 days before a 28-day look-back → freshness 0.75 → -2.25
        expect(
            scoreCandidate(
                candidate,
                slot,
                [],
                asIsoDate('2026-05-15'),
                windowStart,
                4,
            ),
        ).toBeCloseTo(-2.25, 5)
        // 14 days before → freshness 0.5 → -1.5
        expect(
            scoreCandidate(
                candidate,
                slot,
                [],
                asIsoDate('2026-05-08'),
                windowStart,
                4,
            ),
        ).toBeCloseTo(-1.5, 5)
    })

    it('applies no penalty when lastEaten is outside the look-back window', () => {
        const candidate = makeCandidate({ ratingCount: 3, ratingAverage: 3.5 })
        // 29 days before window start; look-back of 4 wks = 28 days
        const lastEaten = asIsoDate('2026-04-23')
        expect(
            scoreCandidate(candidate, slot, [], lastEaten, windowStart, 4),
        ).toBe(0)
    })
})

describe('scoreCandidate — same recipe already placed', () => {
    it('applies a very strong negative penalty', () => {
        const candidate = makeCandidate({
            id: rid('r-self'),
            ratingCount: 3,
            ratingAverage: 3.5,
        })
        const samePlacement = makePlacement({
            recipeId: rid('r-self'),
            date: asIsoDate('2026-05-20'),
        })
        expect(
            scoreCandidate(
                candidate,
                slot,
                [samePlacement],
                null,
                windowStart,
                4,
            ),
        ).toBeLessThanOrEqual(-1000)
    })
})

describe('compareTieBreak', () => {
    const baseCandidate = makeCandidate({ ratingCount: 3, ratingAverage: 4.5 })
    const make = (overrides: Partial<Scored> = {}): Scored => ({
        candidate: baseCandidate,
        score: 5,
        lastEaten: null,
        ...overrides,
    })

    it('prefers the recipe with the older last-eaten date', () => {
        const older = make({ lastEaten: asIsoDate('2026-04-01') })
        const newer = make({ lastEaten: asIsoDate('2026-05-01') })
        expect(compareTieBreak(older, newer)).toBeLessThan(0)
        expect(compareTieBreak(newer, older)).toBeGreaterThan(0)
    })

    it('lets a never-eaten recipe outrank one with any last-eaten date', () => {
        const neverEaten = make({ lastEaten: null })
        const eaten = make({ lastEaten: asIsoDate('2026-04-01') })
        expect(compareTieBreak(neverEaten, eaten)).toBeLessThan(0)
        expect(compareTieBreak(eaten, neverEaten)).toBeGreaterThan(0)
    })

    it('falls back to older createdAt when both are unrated and uneaten', () => {
        const older = make({
            candidate: makeCandidate({
                ratingCount: 0,
                createdAt: new Date('2026-01-01T00:00:00Z'),
            }),
        })
        const newer = make({
            candidate: makeCandidate({
                ratingCount: 0,
                createdAt: new Date('2026-03-01T00:00:00Z'),
            }),
        })
        expect(compareTieBreak(older, newer)).toBeLessThan(0)
    })
})

describe('scoreCandidates', () => {
    it('sorts by score descending, applying tie-break on equal scores', () => {
        const c1 = makeCandidate({
            id: rid('r-1'),
            ratingCount: 3,
            ratingAverage: 4.5,
        }) // +6
        const c2 = makeCandidate({
            id: rid('r-2'),
            ratingCount: 3,
            ratingAverage: 3.5,
        }) // 0
        const c3 = makeCandidate({
            id: rid('r-3'),
            ratingCount: 3,
            ratingAverage: 2.5,
        }) // -8
        const sorted = scoreCandidates(
            [c2, c3, c1],
            slot,
            [],
            new Map(),
            windowStart,
            4,
        )
        expect(sorted.map((s) => s.candidate.id)).toEqual([
            'r-1',
            'r-2',
            'r-3',
        ])
    })

    it('uses lastEatenMap to drive the repetition signal', () => {
        const c1 = makeCandidate({
            id: rid('r-1'),
            ratingCount: 3,
            ratingAverage: 3.5,
        })
        const c2 = makeCandidate({
            id: rid('r-2'),
            ratingCount: 3,
            ratingAverage: 3.5,
        })
        const lastEatenMap = new Map<RecipeId, IsoDate>([
            [rid('r-1'), asIsoDate('2026-05-21')], // -3
        ])
        const sorted = scoreCandidates(
            [c1, c2],
            slot,
            [],
            lastEatenMap,
            windowStart,
            4,
        )
        expect(sorted[0].candidate.id).toBe('r-2')
        expect(sorted[1].candidate.id).toBe('r-1')
    })
})
