import { describe, expect, it } from 'vitest'
import {
    assertPasswordPolicy,
    hashPassword,
    MIN_PASSWORD_LENGTH,
    verifyPassword,
    WeakPasswordError,
} from './password'

describe('assertPasswordPolicy', () => {
    it('throws WeakPasswordError when shorter than the minimum length', () => {
        const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1)
        expect(() => assertPasswordPolicy(short)).toThrow(WeakPasswordError)
    })

    it('passes for a password exactly at the minimum length', () => {
        const exact = 'a'.repeat(MIN_PASSWORD_LENGTH)
        expect(() => assertPasswordPolicy(exact)).not.toThrow()
    })

    it('passes for longer passwords', () => {
        expect(() => assertPasswordPolicy('a'.repeat(64))).not.toThrow()
    })

    it('rejects empty input', () => {
        expect(() => assertPasswordPolicy('')).toThrow(WeakPasswordError)
    })
})

describe('hashPassword', { timeout: 30_000 }, () => {
    it('refuses to hash a password that fails the policy', async () => {
        await expect(hashPassword('short')).rejects.toBeInstanceOf(
            WeakPasswordError,
        )
    })

    it('returns an argon2 PHC string', async () => {
        const hash = await hashPassword('correct horse battery')
        expect(hash.startsWith('$argon2')).toBe(true)
    })

    it('produces different hashes for the same input (per-hash salt)', async () => {
        const a = await hashPassword('correct horse battery')
        const b = await hashPassword('correct horse battery')
        expect(a).not.toBe(b)
    })
})

describe('verifyPassword', { timeout: 30_000 }, () => {
    it('returns true for the original password', async () => {
        const hash = await hashPassword('correct horse battery')
        expect(await verifyPassword(hash, 'correct horse battery')).toBe(true)
    })

    it('returns false for a wrong password', async () => {
        const hash = await hashPassword('correct horse battery')
        expect(await verifyPassword(hash, 'wrong horse battery')).toBe(false)
    })

    it('returns false (not throws) for a malformed stored hash', async () => {
        expect(await verifyPassword('not-a-hash', 'anything')).toBe(false)
    })

    it('returns false for an empty stored hash', async () => {
        expect(await verifyPassword('', 'anything')).toBe(false)
    })
})
