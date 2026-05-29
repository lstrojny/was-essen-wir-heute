import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    addDaysIso,
    asIsoDate,
    diffDays,
    type IsoDate,
    parseIsoDate,
    rangeIso,
    todayIso,
} from './dates'

const iso = (s: string) => asIsoDate(s)

describe('parseIsoDate', () => {
    it('accepts a valid date', () => {
        expect(parseIsoDate('2026-05-22')).toBe('2026-05-22')
    })

    it('rejects malformed strings', () => {
        expect(parseIsoDate('')).toBeNull()
        expect(parseIsoDate('2026-5-22')).toBeNull()
        expect(parseIsoDate('2026/05/22')).toBeNull()
        expect(parseIsoDate('22-05-2026')).toBeNull()
        expect(parseIsoDate('2026-05-22T00:00:00Z')).toBeNull()
    })

    it('rejects impossible calendar dates', () => {
        expect(parseIsoDate('2026-02-30')).toBeNull()
        expect(parseIsoDate('2026-13-01')).toBeNull()
        expect(parseIsoDate('2026-00-01')).toBeNull()
        expect(parseIsoDate('2026-04-31')).toBeNull()
    })

    it('accepts Feb 29 in leap years and rejects it otherwise', () => {
        expect(parseIsoDate('2024-02-29')).toBe('2024-02-29')
        expect(parseIsoDate('2026-02-29')).toBeNull()
    })
})

describe('asIsoDate', () => {
    it('returns the branded value when valid', () => {
        expect(asIsoDate('2026-05-22')).toBe('2026-05-22')
    })

    it('throws for invalid input', () => {
        expect(() => asIsoDate('nope')).toThrow(/invalid iso date/i)
    })
})

describe('todayIso', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('formats the local calendar date as YYYY-MM-DD', () => {
        vi.setSystemTime(new Date(2026, 4, 22, 12, 0, 0))
        expect(todayIso()).toBe('2026-05-22')
    })

    it('zero-pads single-digit months and days', () => {
        vi.setSystemTime(new Date(2026, 0, 3, 12, 0, 0))
        expect(todayIso()).toBe('2026-01-03')
    })
})

describe('addDaysIso', () => {
    it('adds positive day counts', () => {
        expect(addDaysIso(iso('2026-05-22'), 1)).toBe('2026-05-23')
        expect(addDaysIso(iso('2026-05-22'), 7)).toBe('2026-05-29')
    })

    it('subtracts when given a negative offset', () => {
        expect(addDaysIso(iso('2026-05-01'), -1)).toBe('2026-04-30')
    })

    it('rolls over month boundaries', () => {
        expect(addDaysIso(iso('2026-01-31'), 1)).toBe('2026-02-01')
    })

    it('rolls over year boundaries', () => {
        expect(addDaysIso(iso('2026-12-31'), 1)).toBe('2027-01-01')
    })

    it('handles leap-year February correctly', () => {
        expect(addDaysIso(iso('2024-02-28'), 1)).toBe('2024-02-29')
        expect(addDaysIso(iso('2024-02-29'), 1)).toBe('2024-03-01')
        expect(addDaysIso(iso('2026-02-28'), 1)).toBe('2026-03-01')
    })

    it('is the identity when adding zero', () => {
        expect(addDaysIso(iso('2026-05-22'), 0)).toBe('2026-05-22')
    })
})

describe('rangeIso', () => {
    it('is inclusive on both ends', () => {
        expect(rangeIso(iso('2026-05-22'), iso('2026-05-24'))).toEqual([
            '2026-05-22',
            '2026-05-23',
            '2026-05-24',
        ])
    })

    it('returns a single-element array for a one-day range', () => {
        expect(rangeIso(iso('2026-05-22'), iso('2026-05-22'))).toEqual([
            '2026-05-22',
        ])
    })

    it('returns empty when end is before start', () => {
        expect(rangeIso(iso('2026-05-24'), iso('2026-05-22'))).toEqual([])
    })

    it('crosses month boundaries', () => {
        expect(rangeIso(iso('2026-01-30'), iso('2026-02-02'))).toEqual([
            '2026-01-30',
            '2026-01-31',
            '2026-02-01',
            '2026-02-02',
        ])
    })
})

describe('diffDays', () => {
    it('returns the signed day difference (a - b)', () => {
        expect(diffDays(iso('2026-05-23'), iso('2026-05-22'))).toBe(1)
        expect(diffDays(iso('2026-05-22'), iso('2026-05-23'))).toBe(-1)
        expect(diffDays(iso('2026-05-22'), iso('2026-05-22'))).toBe(0)
    })

    it('counts across month and year boundaries', () => {
        expect(diffDays(iso('2026-02-01'), iso('2026-01-31'))).toBe(1)
        expect(diffDays(iso('2027-01-01'), iso('2026-12-31'))).toBe(1)
    })

    it('counts whole-week ranges as 7 days each', () => {
        expect(diffDays(iso('2026-05-29'), iso('2026-05-22'))).toBe(7)
        expect(diffDays(iso('2026-06-19'), iso('2026-05-22'))).toBe(28)
    })

    it('is unaffected by DST transitions', () => {
        // Europe/Berlin DST shift in 2026 is the night of 2026-03-29; UTC math
        // must not collapse the diff to anything but whole days.
        const a: IsoDate = asIsoDate('2026-03-30')
        const b: IsoDate = asIsoDate('2026-03-28')
        expect(diffDays(a, b)).toBe(2)
    })
})
