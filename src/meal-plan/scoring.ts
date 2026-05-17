import type { CuisineKey, IngredientId, RecipeId } from '@/db/ids'
import { addDaysIso, diffDays, type IsoDate } from './dates'
import type { CandidateMeta, Role } from './queries'

/**
 * Weights are intentionally loose — the spec says scoring need only be
 * "reasonable enough that the user replaces fewer than half the
 * suggestions". Centralising them here makes them easy to tune later
 * without hunting through call-sites.
 */
const WEIGHTS = {
    ratingStrongPositive: 6,
    ratingMildPositive: 2,
    ratingNeutral: 0,
    ratingStrongNegative: -8,
    varietyOverlapAdjacent: -4,
    varietyOverlapInWeek: -1.5,
    cuisineRepeatAdjacent: -1.5,
    repetitionRecent: -3,
} as const

const RATING_STRONG_POSITIVE_AT = 4.0
const RATING_STRONG_NEGATIVE_AT = 3.0

export type Placement = {
    date: IsoDate
    recipeId: RecipeId
    cuisineKey: CuisineKey
    rolesByIngredient: Map<IngredientId, Role>
}

export type Scored = {
    candidate: CandidateMeta
    score: number
    lastEaten: IsoDate | null
}

/**
 * Score a candidate for a specific empty `slotDate` given the already-placed
 * days in the week. Pure function; the caller pre-loads everything it needs.
 *
 *  - rating signal: ≥4.0 strong positive, no ratings mild positive (so new
 *    recipes get a nudge), <3.0 strong negative, otherwise neutral
 *  - variety penalty: count overlap of role-tagged ingredients with every
 *    already-placed day, doubled when the overlapping day is adjacent
 *  - cuisine adjacency penalty: smaller hit when the same cuisine sits in a
 *    neighbouring slot
 *  - repetition penalty: linear decay over `recentWindowWeeks`; a candidate
 *    eaten right before the active window is penalised the most, one eaten
 *    near the look-back edge barely at all
 */
export function scoreCandidate(
    candidate: CandidateMeta,
    slotDate: IsoDate,
    placements: Placement[],
    lastEaten: IsoDate | null,
    activeWindowStart: IsoDate,
    recentWindowWeeks: number,
): number {
    let score = 0

    if (candidate.ratingCount === 0) {
        score += WEIGHTS.ratingMildPositive
    } else if (candidate.ratingAverage !== null) {
        if (candidate.ratingAverage >= RATING_STRONG_POSITIVE_AT) {
            score += WEIGHTS.ratingStrongPositive
        } else if (candidate.ratingAverage < RATING_STRONG_NEGATIVE_AT) {
            score += WEIGHTS.ratingStrongNegative
        } else {
            score += WEIGHTS.ratingNeutral
        }
    }

    for (const placement of placements) {
        if (placement.recipeId === candidate.id) {
            // already on the plan elsewhere this week — make it impossible to
            // pick again (the candidate pool also filters this; defensive)
            score += -1_000
            continue
        }
        const adjacent = Math.abs(diffDays(placement.date, slotDate)) === 1
        const overlapCount = countRoleOverlap(
            candidate.rolesByIngredient,
            placement.rolesByIngredient,
        )
        if (overlapCount > 0) {
            score +=
                overlapCount *
                (adjacent
                    ? WEIGHTS.varietyOverlapAdjacent
                    : WEIGHTS.varietyOverlapInWeek)
        }
        if (
            adjacent &&
            placement.cuisineKey === candidate.cuisineKey
        ) {
            score += WEIGHTS.cuisineRepeatAdjacent
        }
    }

    if (lastEaten) {
        const lookbackStart = addDaysIso(
            activeWindowStart,
            -recentWindowWeeks * 7,
        )
        if (lastEaten >= lookbackStart) {
            const daysSince = diffDays(activeWindowStart, lastEaten)
            const lookbackDays = recentWindowWeeks * 7
            const freshness = Math.max(
                0,
                Math.min(1, 1 - daysSince / lookbackDays),
            )
            score += freshness * WEIGHTS.repetitionRecent
        }
    }

    return score
}

function countRoleOverlap(
    a: Map<IngredientId, Role>,
    b: Map<IngredientId, Role>,
): number {
    let n = 0
    const [small, large] = a.size <= b.size ? [a, b] : [b, a]
    for (const [iid, role] of small) {
        const other = large.get(iid)
        if (other && other === role) n += 1
    }
    return n
}

/**
 * Tie-break between equal-score candidates. Per the spec:
 *   1. older "last eaten" date wins (so well-rested recipes float up),
 *   2. if both are unrated, older `created_at` wins (so new unrated recipes
 *      don't pile up on the same week),
 *   3. otherwise stable by `created_at`.
 */
export function compareTieBreak(
    a: Scored,
    b: Scored,
): number {
    if (a.lastEaten && b.lastEaten) {
        if (a.lastEaten !== b.lastEaten) {
            return a.lastEaten < b.lastEaten ? -1 : 1
        }
    } else if (a.lastEaten && !b.lastEaten) {
        return 1
    } else if (!a.lastEaten && b.lastEaten) {
        return -1
    }
    const aUnrated = a.candidate.ratingCount === 0
    const bUnrated = b.candidate.ratingCount === 0
    if (aUnrated && bUnrated) {
        return a.candidate.createdAt.getTime() - b.candidate.createdAt.getTime()
    }
    return a.candidate.createdAt.getTime() - b.candidate.createdAt.getTime()
}

export function scoreCandidates(
    candidates: CandidateMeta[],
    slotDate: IsoDate,
    placements: Placement[],
    lastEatenMap: Map<RecipeId, IsoDate>,
    activeWindowStart: IsoDate,
    recentWindowWeeks: number,
): Scored[] {
    return candidates
        .map<Scored>((candidate) => ({
            candidate,
            lastEaten: lastEatenMap.get(candidate.id) ?? null,
            score: scoreCandidate(
                candidate,
                slotDate,
                placements,
                lastEatenMap.get(candidate.id) ?? null,
                activeWindowStart,
                recentWindowWeeks,
            ),
        }))
        .sort((a, b) => {
            if (a.score !== b.score) return b.score - a.score
            return compareTieBreak(a, b)
        })
}
