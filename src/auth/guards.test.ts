import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDb } from '@/test/db'
import { makeUser } from '@/test/fixtures'
import {
    createCookieStore,
    type CookieStoreStub,
    RedirectError,
} from '@/test/next-stubs'

const cookieStore = vi.hoisted(
    () => ({ current: null as null | unknown }) as { current: null | unknown },
)

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => cookieStore.current),
}))

vi.mock('next/navigation', () => ({
    redirect: vi.fn((to: string) => {
        throw new RedirectError(to)
    }),
}))

const {
    hasAnyUser,
    redirectIfAuthenticated,
    redirectIfNotFirstRun,
    requireAdmin,
    requireSetupOrSession,
} = await import('./guards')
const { createSession, setSessionCookie } = await import('./session')

let store: CookieStoreStub

beforeEach(() => {
    resetDb()
    store = createCookieStore()
    cookieStore.current = store
})

afterEach(() => {
    vi.useRealTimers()
})

describe('hasAnyUser', () => {
    it('returns false on a fresh DB', () => {
        expect(hasAnyUser()).toBe(false)
    })

    it('returns true once any user row exists', () => {
        makeUser()
        expect(hasAnyUser()).toBe(true)
    })
})

describe('requireSetupOrSession', () => {
    it('redirects to /setup when no users exist', async () => {
        await expect(requireSetupOrSession()).rejects.toMatchObject({
            name: 'RedirectError',
            to: '/setup',
        })
    })

    it('redirects to /login when users exist but no session', async () => {
        makeUser()
        await expect(requireSetupOrSession()).rejects.toMatchObject({
            to: '/login',
        })
    })

    it('returns the session when valid', async () => {
        const userId = makeUser()
        const token = await createSession(userId, null)
        await setSessionCookie(token)
        const sess = await requireSetupOrSession()
        expect(sess.user.id).toBe(userId)
    })
})

describe('requireAdmin', () => {
    it('redirects to / for a non-admin user', async () => {
        const userId = makeUser({ role: 'user' })
        const token = await createSession(userId, null)
        await setSessionCookie(token)
        await expect(requireAdmin()).rejects.toMatchObject({ to: '/' })
    })

    it('returns the user object for an admin', async () => {
        const userId = makeUser({ role: 'admin' })
        const token = await createSession(userId, null)
        await setSessionCookie(token)
        const user = await requireAdmin()
        expect(user.role).toBe('admin')
        expect(user.id).toBe(userId)
    })

    it('redirects to /setup before /login when no users exist', async () => {
        await expect(requireAdmin()).rejects.toMatchObject({ to: '/setup' })
    })
})

describe('redirectIfAuthenticated', () => {
    it('redirects to /setup before checking session when no users exist', async () => {
        await expect(redirectIfAuthenticated()).rejects.toMatchObject({
            to: '/setup',
        })
    })

    it('redirects to / when a valid session exists', async () => {
        const userId = makeUser()
        const token = await createSession(userId, null)
        await setSessionCookie(token)
        await expect(redirectIfAuthenticated()).rejects.toMatchObject({
            to: '/',
        })
    })

    it('returns (no redirect) when users exist but viewer has no session', async () => {
        makeUser()
        await expect(redirectIfAuthenticated()).resolves.toBeUndefined()
    })
})

describe('redirectIfNotFirstRun', () => {
    it('redirects to /login when any user already exists', async () => {
        makeUser()
        await expect(redirectIfNotFirstRun()).rejects.toMatchObject({
            to: '/login',
        })
    })

    it('returns (no redirect) when the DB has no users yet', async () => {
        await expect(redirectIfNotFirstRun()).resolves.toBeUndefined()
    })
})
