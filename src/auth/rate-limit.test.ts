import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    checkLoginAllowed,
    recordFailedLogin,
    recordSuccessfulLogin,
} from './rate-limit'

// Module-level state is shared across tests. We isolate by using a unique
// email per test (a UUID-ish counter would also work) and by leaning on
// fake timers when behaviour under elapsed time is what we are pinning.

let counter = 0
const freshEmail = () => `user-${++counter}@example.test`

describe('checkLoginAllowed', () => {
    it('allows a brand-new email with zero retry delay', () => {
        expect(checkLoginAllowed(freshEmail())).toEqual({
            allowed: true,
            retryAfterMs: 0,
        })
    })

    it('still allows login after a single failure', () => {
        const email = freshEmail()
        recordFailedLogin(email)
        expect(checkLoginAllowed(email).allowed).toBe(true)
    })

    it('still allows login up to (but not including) the lockout threshold', () => {
        const email = freshEmail()
        for (let i = 0; i < 4; i += 1) recordFailedLogin(email)
        expect(checkLoginAllowed(email).allowed).toBe(true)
    })

    it('locks the account once the failure threshold is reached', () => {
        const email = freshEmail()
        for (let i = 0; i < 5; i += 1) recordFailedLogin(email)
        const result = checkLoginAllowed(email)
        expect(result.allowed).toBe(false)
        expect(result.retryAfterMs).toBeGreaterThan(0)
    })
})

describe('lockout expiry', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-05-22T12:00:00Z'))
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('clears the lockout after 15 minutes', () => {
        const email = freshEmail()
        for (let i = 0; i < 5; i += 1) recordFailedLogin(email)
        expect(checkLoginAllowed(email).allowed).toBe(false)

        vi.advanceTimersByTime(15 * 60 * 1000)
        const after = checkLoginAllowed(email)
        expect(after.allowed).toBe(true)
        expect(after.retryAfterMs).toBe(0)
    })

    it('resets the attempt window after 15 idle minutes', () => {
        const email = freshEmail()
        // 4 failures — one short of lockout
        for (let i = 0; i < 4; i += 1) recordFailedLogin(email)
        expect(checkLoginAllowed(email).allowed).toBe(true)

        // 15+ minutes pass without further activity, then 4 fresh failures.
        // If the counter had carried over, this would lock; with the reset
        // it should still be under the threshold in the new window.
        vi.advanceTimersByTime(16 * 60 * 1000)
        for (let i = 0; i < 4; i += 1) recordFailedLogin(email)
        expect(checkLoginAllowed(email).allowed).toBe(true)
    })
})

describe('recordSuccessfulLogin', () => {
    it('clears any previous failure record so the next failure starts fresh', () => {
        const email = freshEmail()
        for (let i = 0; i < 4; i += 1) recordFailedLogin(email)
        recordSuccessfulLogin(email)
        // 4 failures wiped — 4 new failures should not lock yet
        for (let i = 0; i < 4; i += 1) recordFailedLogin(email)
        expect(checkLoginAllowed(email).allowed).toBe(true)
    })
})

describe('email keying', () => {
    it('treats addresses case-insensitively', () => {
        const email = freshEmail()
        for (let i = 0; i < 5; i += 1) recordFailedLogin(email.toUpperCase())
        expect(checkLoginAllowed(email.toLowerCase()).allowed).toBe(false)
    })

    it('trims surrounding whitespace before keying', () => {
        const email = freshEmail()
        for (let i = 0; i < 5; i += 1) recordFailedLogin(`  ${email}  `)
        expect(checkLoginAllowed(email).allowed).toBe(false)
    })
})
