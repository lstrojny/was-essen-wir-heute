import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { sessions } from '@/db/schema'
import { resetDb } from '@/test/db'
import { makeUser } from '@/test/fixtures'
import { createCookieStore, type CookieStoreStub } from '@/test/next-stubs'

const cookieStore = vi.hoisted(() => {
    // Cannot import the helper here (hoist order); reuse a shared mutable ref
    // that beforeEach swaps in for the live store.
    return { current: null as null | unknown } as { current: null | unknown }
})

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => cookieStore.current),
}))

const {
    SESSION_COOKIE_NAME,
    clearSessionCookie,
    createSession,
    destroyAllSessionsExcept,
    destroyAllSessionsForUser,
    destroySession,
    getAuthenticatedSession,
    readSessionToken,
    setSessionCookie,
} = await import('./session')

let store: CookieStoreStub

beforeEach(() => {
    resetDb()
    store = createCookieStore()
    cookieStore.current = store
})

afterEach(() => {
    vi.useRealTimers()
})

describe('createSession', () => {
    it('returns a non-empty token and writes a row to the sessions table', async () => {
        const userId = makeUser()
        const token = await createSession(userId, 'test-ua')
        expect(token.length).toBeGreaterThan(20)

        const row = db.select().from(sessions).get()
        expect(row?.userId).toBe(userId)
        expect(row?.userAgent).toBe('test-ua')
        expect(row?.expiresAt.getTime()).toBeGreaterThan(Date.now())
    })

    it('returns distinct tokens on consecutive calls', async () => {
        const userId = makeUser()
        const a = await createSession(userId, null)
        const b = await createSession(userId, null)
        expect(a).not.toBe(b)
    })
})

describe('setSessionCookie / readSessionToken / clearSessionCookie', () => {
    it('round-trips a token through the cookie store', async () => {
        await setSessionCookie('hello-token')
        expect(store.map.get(SESSION_COOKIE_NAME)?.value).toBe('hello-token')
        expect(await readSessionToken()).toBe('hello-token')

        await clearSessionCookie()
        expect(store.map.has(SESSION_COOKIE_NAME)).toBe(false)
        expect(await readSessionToken()).toBeNull()
    })

    it('marks the cookie as httpOnly with a sane maxAge', async () => {
        await setSessionCookie('hello-token')
        const recorded = store.map.get(SESSION_COOKIE_NAME)
        expect(recorded?.options?.httpOnly).toBe(true)
        expect(recorded?.options?.sameSite).toBe('lax')
        expect(recorded?.options?.path).toBe('/')
        expect(Number(recorded?.options?.maxAge)).toBeGreaterThan(0)
    })
})

describe('getAuthenticatedSession', () => {
    it('returns null when no session cookie is set', async () => {
        expect(await getAuthenticatedSession()).toBeNull()
    })

    it('returns null when the cookie does not match any session row', async () => {
        await setSessionCookie('bogus-token')
        expect(await getAuthenticatedSession()).toBeNull()
    })

    it('returns the session and user for a valid token', async () => {
        const userId = makeUser({
            displayName: 'Alice',
            email: 'alice@example.test',
            language: 'de',
            role: 'admin',
        })
        const token = await createSession(userId, null)
        await setSessionCookie(token)

        const sess = await getAuthenticatedSession()
        expect(sess?.user).toMatchObject({
            id: userId,
            displayName: 'Alice',
            email: 'alice@example.test',
            language: 'de',
            role: 'admin',
        })
    })

    it('extends a session whose lastUsedAt is older than the throttle', async () => {
        const userId = makeUser()
        const token = await createSession(userId, null)
        await setSessionCookie(token)
        // Backdate lastUsedAt to 2 days ago to trigger the extend path.
        db.update(sessions)
            .set({
                lastUsedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            })
            .where(eq(sessions.userId, userId))
            .run()

        const before = db.select().from(sessions).get()!
        await getAuthenticatedSession()
        const after = db.select().from(sessions).get()!
        expect(after.lastUsedAt.getTime()).toBeGreaterThan(
            before.lastUsedAt.getTime(),
        )
        expect(after.expiresAt.getTime()).toBeGreaterThanOrEqual(
            before.expiresAt.getTime(),
        )
    })

    it('does not extend within the throttle window', async () => {
        const userId = makeUser()
        const token = await createSession(userId, null)
        await setSessionCookie(token)
        const before = db.select().from(sessions).get()!

        await getAuthenticatedSession()
        const after = db.select().from(sessions).get()!
        // lastUsedAt was just-now; no extend should have run.
        expect(after.lastUsedAt.getTime()).toBe(before.lastUsedAt.getTime())
    })

    it('returns null and deletes the session past the hard 90-day cap', async () => {
        const userId = makeUser()
        const token = await createSession(userId, null)
        await setSessionCookie(token)
        // Backdate createdAt to 91 days ago.
        db.update(sessions)
            .set({
                createdAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
                expiresAt: new Date(Date.now() + 1000), // still within rolling expiry
            })
            .where(eq(sessions.userId, userId))
            .run()

        expect(await getAuthenticatedSession()).toBeNull()
        expect(db.select().from(sessions).get()).toBeUndefined()
    })

    it('returns null when the session is past its rolling expiry', async () => {
        const userId = makeUser()
        const token = await createSession(userId, null)
        await setSessionCookie(token)
        db.update(sessions)
            .set({ expiresAt: new Date(Date.now() - 1000) })
            .where(eq(sessions.userId, userId))
            .run()
        expect(await getAuthenticatedSession()).toBeNull()
    })
})

describe('destroySession', () => {
    it('removes the session row and clears the cookie', async () => {
        const userId = makeUser()
        const token = await createSession(userId, null)
        await setSessionCookie(token)

        await destroySession()
        expect(db.select().from(sessions).get()).toBeUndefined()
        expect(store.map.has(SESSION_COOKIE_NAME)).toBe(false)
    })

    it('is a no-op when no cookie is set (still clears any stale cookie)', async () => {
        await destroySession()
        expect(store.map.has(SESSION_COOKIE_NAME)).toBe(false)
    })
})

describe('destroyAllSessionsExcept', () => {
    it('deletes every session for the user except the one kept', async () => {
        const userId = makeUser()
        const tokenKeep = await createSession(userId, null)
        await createSession(userId, null)
        await createSession(userId, null)
        const keepId = db.select().from(sessions).get()!.id // first inserted? — re-derive
        // The sessions table has 3 rows; pick the one matching tokenKeep.
        // Hash matches tokenKeep — we know it's the row created by tokenKeep.
        const { createHash } = await import('node:crypto')
        const keepHashed = createHash('sha256')
            .update(tokenKeep)
            .digest('hex') as typeof keepId
        destroyAllSessionsExcept(userId, keepHashed)
        const remaining = db.select().from(sessions).all()
        expect(remaining).toHaveLength(1)
        expect(remaining[0].id).toBe(keepHashed)
    })
})

describe('destroyAllSessionsForUser', () => {
    it('deletes every session for the user', async () => {
        const userId = makeUser()
        await createSession(userId, null)
        await createSession(userId, null)
        destroyAllSessionsForUser(userId)
        expect(db.select().from(sessions).all()).toHaveLength(0)
    })

    it('leaves sessions belonging to other users alone', async () => {
        const me = makeUser()
        const other = makeUser()
        await createSession(me, null)
        await createSession(other, null)
        destroyAllSessionsForUser(me)
        const remaining = db.select().from(sessions).all()
        expect(remaining).toHaveLength(1)
        expect(remaining[0].userId).toBe(other)
    })
})
