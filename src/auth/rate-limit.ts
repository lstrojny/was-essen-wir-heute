type Attempt = {
    count: number
    firstAt: number
    lockedUntil: number | null
}

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000

const attempts = new Map<string, Attempt>()

function key(email: string): string {
    return email.trim().toLowerCase()
}

export function checkLoginAllowed(email: string): {
    allowed: boolean
    retryAfterMs: number
} {
    const k = key(email)
    const now = Date.now()
    const entry = attempts.get(k)
    if (!entry) {
        return { allowed: true, retryAfterMs: 0 }
    }
    if (entry.lockedUntil && now < entry.lockedUntil) {
        return { allowed: false, retryAfterMs: entry.lockedUntil - now }
    }
    if (entry.lockedUntil && now >= entry.lockedUntil) {
        attempts.delete(k)
        return { allowed: true, retryAfterMs: 0 }
    }
    if (now - entry.firstAt > WINDOW_MS) {
        attempts.delete(k)
        return { allowed: true, retryAfterMs: 0 }
    }
    return { allowed: true, retryAfterMs: 0 }
}

export function recordFailedLogin(email: string): void {
    const k = key(email)
    const now = Date.now()
    const entry = attempts.get(k)
    if (!entry || now - entry.firstAt > WINDOW_MS) {
        attempts.set(k, { count: 1, firstAt: now, lockedUntil: null })
        return
    }
    entry.count += 1
    if (entry.count >= MAX_ATTEMPTS) {
        entry.lockedUntil = now + LOCKOUT_MS
    }
}

export function recordSuccessfulLogin(email: string): void {
    attempts.delete(key(email))
}
