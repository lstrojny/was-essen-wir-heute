/**
 * Calendar-date helpers for the meal plan. Dates are stored and passed
 * around as ISO `YYYY-MM-DD` strings (wall-clock days, not points in time).
 */

export type IsoDate = string & { readonly __isoDate: unique symbol }

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function parseIsoDate(value: string): IsoDate | null {
    if (!ISO_DATE_RE.test(value)) return null
    const [y, m, d] = value.split('-').map(Number)
    const date = new Date(Date.UTC(y, m - 1, d))
    if (
        date.getUTCFullYear() !== y ||
        date.getUTCMonth() !== m - 1 ||
        date.getUTCDate() !== d
    ) {
        return null
    }
    return value as IsoDate
}

export function asIsoDate(value: string): IsoDate {
    const parsed = parseIsoDate(value)
    if (!parsed) throw new Error(`invalid iso date: ${value}`)
    return parsed
}

export function todayIso(): IsoDate {
    const now = new Date()
    return formatIso(
        now.getFullYear(),
        now.getMonth() + 1,
        now.getDate(),
    )
}

export function addDaysIso(date: IsoDate, days: number): IsoDate {
    const [y, m, d] = date.split('-').map(Number)
    const utc = new Date(Date.UTC(y, m - 1, d + days))
    return formatIso(
        utc.getUTCFullYear(),
        utc.getUTCMonth() + 1,
        utc.getUTCDate(),
    )
}

export function rangeIso(start: IsoDate, end: IsoDate): IsoDate[] {
    if (end < start) return []
    const out: IsoDate[] = []
    let cur = start
    while (cur <= end) {
        out.push(cur)
        cur = addDaysIso(cur, 1)
    }
    return out
}

export function diffDays(a: IsoDate, b: IsoDate): number {
    const toUtc = (s: IsoDate) => {
        const [y, m, d] = s.split('-').map(Number)
        return Date.UTC(y, m - 1, d)
    }
    return Math.round((toUtc(a) - toUtc(b)) / 86_400_000)
}

function formatIso(year: number, month: number, day: number): IsoDate {
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${year}-${pad(month)}-${pad(day)}` as IsoDate
}
