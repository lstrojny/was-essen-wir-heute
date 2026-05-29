import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { sessions, users } from '@/db/schema'
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
const headersMock = vi.hoisted(() =>
    vi.fn(() => ({ get: (_key: string) => null as string | null })),
)
const redirectMock = vi.hoisted(() =>
    vi.fn((to: string) => {
        throw new RedirectError(to)
    }),
)
const revalidatePathMock = vi.hoisted(() => vi.fn())

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => cookieStore.current),
    headers: vi.fn(async () => headersMock()),
}))
vi.mock('next/navigation', () => ({ redirect: redirectMock }))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('next-intl/server', () => ({
    getTranslations: vi.fn(async () => (key: string) => key),
}))

const {
    adminChangeRoleAction,
    adminCreateUserAction,
    adminDeleteUserAction,
    adminResetPasswordAction,
    changeOwnPasswordAction,
    loginAction,
    logoutAction,
    setupAction,
    updateOwnProfileAction,
} = await import('./actions')
const { hashPassword } = await import('./password')
const { SESSION_COOKIE_NAME, createSession, setSessionCookie } = await import(
    './session'
)

let store: CookieStoreStub

beforeEach(() => {
    resetDb()
    store = createCookieStore()
    cookieStore.current = store
    headersMock.mockReturnValue({ get: () => null })
    redirectMock.mockClear()
    revalidatePathMock.mockClear()
})

afterEach(() => {
    vi.useRealTimers()
})

const formOf = (fields: Record<string, string>): FormData => {
    const fd = new FormData()
    for (const [k, v] of Object.entries(fields)) fd.set(k, v)
    return fd
}

async function loginAs(role: 'admin' | 'user' = 'admin') {
    const userId = makeUser({ role })
    const token = await createSession(userId, null)
    await setSessionCookie(token)
    return userId
}

describe(
    'setupAction',
    { timeout: 30_000 },
    () => {
        it('creates the first admin user, sets a session cookie, and redirects', async () => {
            await expect(
                setupAction(
                    {},
                    formOf({
                        email: 'admin@example.test',
                        displayName: 'Admin',
                        password: 'correct horse battery',
                        language: 'de',
                    }),
                ),
            ).rejects.toMatchObject({ to: '/' })

            const created = db
                .select()
                .from(users)
                .where(eq(users.email, 'admin@example.test'))
                .get()
            expect(created?.role).toBe('admin')
            expect(store.map.has(SESSION_COOKIE_NAME)).toBe(true)
        })

        it('redirects to /login when a user already exists', async () => {
            makeUser()
            await expect(
                setupAction(
                    {},
                    formOf({
                        email: 'second@example.test',
                        displayName: 'Second',
                        password: 'correct horse battery',
                        language: 'de',
                    }),
                ),
            ).rejects.toMatchObject({ to: '/login' })
        })

        it('returns an error for an invalid email', async () => {
            const out = await setupAction(
                {},
                formOf({
                    email: 'not-an-email',
                    displayName: 'X',
                    password: 'correct horse battery',
                    language: 'de',
                }),
            )
            expect(out.error).toBe('invalidEmail')
        })

        it('returns an error for a short password', async () => {
            const out = await setupAction(
                {},
                formOf({
                    email: 'a@b.cd',
                    displayName: 'X',
                    password: 'short',
                    language: 'de',
                }),
            )
            expect(out.error).toBe('weakPassword')
        })
    },
)

describe(
    'loginAction',
    { timeout: 30_000 },
    () => {
        it('logs in and redirects when credentials match', async () => {
            const passwordHash = await hashPassword('correct horse battery')
            db.insert(users)
                .values({
                    email: 'loginuser@example.test',
                    displayName: 'L',
                    passwordHash,
                    role: 'user',
                    language: 'de',
                })
                .run()
            await expect(
                loginAction(
                    {},
                    formOf({
                        email: 'LoginUser@Example.Test',
                        password: 'correct horse battery',
                    }),
                ),
            ).rejects.toMatchObject({ to: '/' })
            expect(store.map.has(SESSION_COOKIE_NAME)).toBe(true)
        })

        it('returns invalidLogin for a wrong password', async () => {
            const passwordHash = await hashPassword('correct horse battery')
            const email = `pw-${Math.random()}@example.test`
            db.insert(users)
                .values({
                    email,
                    displayName: 'L',
                    passwordHash,
                    role: 'user',
                    language: 'de',
                })
                .run()
            const out = await loginAction(
                {},
                formOf({ email, password: 'wrong horse battery' }),
            )
            expect(out.error).toBe('invalidLogin')
        })

        it('returns invalidLogin for a non-existent email', async () => {
            const out = await loginAction(
                {},
                formOf({
                    email: `ghost-${Math.random()}@example.test`,
                    password: 'anything10x',
                }),
            )
            expect(out.error).toBe('invalidLogin')
        })

        it('returns the invalidLogin error for empty fields', async () => {
            const out = await loginAction({}, formOf({ email: '', password: '' }))
            expect(out.error).toBe('invalidLogin')
        })
    },
)

describe('logoutAction', () => {
    it('destroys the session and redirects to /login', async () => {
        await loginAs('user')
        await expect(logoutAction()).rejects.toMatchObject({ to: '/login' })
        expect(store.map.has(SESSION_COOKIE_NAME)).toBe(false)
        expect(db.select().from(sessions).all()).toHaveLength(0)
    })
})

describe(
    'updateOwnProfileAction',
    { timeout: 30_000 },
    () => {
        it('updates the displayName + language and returns success', async () => {
            const userId = await loginAs('user')
            const out = await updateOwnProfileAction(
                {},
                formOf({ displayName: 'NewName', language: 'en' }),
            )
            expect(out.success).toBeDefined()
            const row = db
                .select()
                .from(users)
                .where(eq(users.id, userId))
                .get()
            expect(row?.displayName).toBe('NewName')
            expect(row?.language).toBe('en')
        })

        it('triggers revalidatePath when the language changed', async () => {
            await loginAs('user') // makeUser default language is 'de'
            await updateOwnProfileAction(
                {},
                formOf({ displayName: 'NewName', language: 'en' }),
            )
            expect(revalidatePathMock).toHaveBeenCalledWith('/', 'layout')
        })

        it('does not revalidate when the language is unchanged', async () => {
            await loginAs('user')
            await updateOwnProfileAction(
                {},
                formOf({ displayName: 'NewName', language: 'de' }),
            )
            expect(revalidatePathMock).not.toHaveBeenCalled()
        })

        it('returns an error when displayName is empty', async () => {
            await loginAs('user')
            const out = await updateOwnProfileAction(
                {},
                formOf({ displayName: '', language: 'de' }),
            )
            expect(out.error).toBe('displayNameRequired')
        })
    },
)

describe(
    'changeOwnPasswordAction',
    { timeout: 30_000 },
    () => {
        it('returns currentPasswordWrong when the current password is wrong', async () => {
            const passwordHash = await hashPassword('correct horse battery')
            db.update(users)
                .set({ passwordHash })
                .where(eq(users.id, await loginAs('user')))
                .run()
            const out = await changeOwnPasswordAction(
                {},
                formOf({
                    current: 'wrong horse battery',
                    next: 'another good password',
                }),
            )
            expect(out.error).toBe('currentPasswordWrong')
        })

        it('changes the password and revokes other sessions', async () => {
            const userId = makeUser()
            const passwordHash = await hashPassword('correct horse battery')
            db.update(users)
                .set({ passwordHash })
                .where(eq(users.id, userId))
                .run()
            const currentSessionToken = await createSession(userId, null)
            await setSessionCookie(currentSessionToken)
            const otherSessionToken = await createSession(userId, null)

            const out = await changeOwnPasswordAction(
                {},
                formOf({
                    current: 'correct horse battery',
                    next: 'another good password',
                }),
            )
            expect(out.success).toBeDefined()
            const remaining = db.select().from(sessions).all()
            // only the current session remains
            expect(remaining).toHaveLength(1)
            // The remaining session must NOT match the other token
            const { createHash } = await import('node:crypto')
            const otherHash = createHash('sha256')
                .update(otherSessionToken)
                .digest('hex')
            expect(remaining[0].id).not.toBe(otherHash)
        })

        it('returns weakPassword when the new password fails policy', async () => {
            const passwordHash = await hashPassword('correct horse battery')
            db.update(users)
                .set({ passwordHash })
                .where(eq(users.id, await loginAs('user')))
                .run()
            const out = await changeOwnPasswordAction(
                {},
                formOf({ current: 'correct horse battery', next: 'short' }),
            )
            expect(out.error).toBe('weakPassword')
        })
    },
)

describe(
    'adminCreateUserAction',
    { timeout: 30_000 },
    () => {
        it('returns emailExists when an account with that email is already present', async () => {
            await loginAs('admin')
            db.insert(users)
                .values({
                    email: 'taken@example.test',
                    displayName: 'X',
                    passwordHash: 'placeholder',
                    role: 'user',
                    language: 'de',
                })
                .run()
            const out = await adminCreateUserAction(
                {},
                formOf({
                    email: 'taken@example.test',
                    displayName: 'X',
                    password: 'correct horse battery',
                    role: 'user',
                    language: 'de',
                }),
            )
            expect(out.error).toBe('emailExists')
        })

        it('creates a new user and reports success', async () => {
            await loginAs('admin')
            const out = await adminCreateUserAction(
                {},
                formOf({
                    email: 'newuser@example.test',
                    displayName: 'Newbie',
                    password: 'correct horse battery',
                    role: 'user',
                    language: 'de',
                }),
            )
            expect(out.success).toBeDefined()
            const created = db
                .select()
                .from(users)
                .where(eq(users.email, 'newuser@example.test'))
                .get()
            expect(created?.role).toBe('user')
        })

        it('returns invalidEmail for a malformed email', async () => {
            await loginAs('admin')
            const out = await adminCreateUserAction(
                {},
                formOf({
                    email: 'not-an-email',
                    displayName: 'X',
                    password: 'correct horse battery',
                    role: 'user',
                    language: 'de',
                }),
            )
            expect(out.error).toBe('invalidEmail')
        })
    },
)

describe(
    'adminChangeRoleAction',
    { timeout: 30_000 },
    () => {
        it('refuses to demote the active admin', async () => {
            const adminId = await loginAs('admin')
            const out = await adminChangeRoleAction(
                {},
                formOf({ userId: adminId, role: 'user' }),
            )
            expect(out.error).toBe('cantDemoteSelf')
        })

        it('updates another user’s role', async () => {
            await loginAs('admin')
            const other = makeUser({ role: 'user' })
            const out = await adminChangeRoleAction(
                {},
                formOf({ userId: other, role: 'admin' }),
            )
            expect(out.success).toBeDefined()
            const row = db
                .select()
                .from(users)
                .where(eq(users.id, other))
                .get()
            expect(row?.role).toBe('admin')
        })
    },
)

describe(
    'adminDeleteUserAction',
    { timeout: 30_000 },
    () => {
        it('refuses to delete the active admin', async () => {
            const adminId = await loginAs('admin')
            const out = await adminDeleteUserAction(
                {},
                formOf({ userId: adminId }),
            )
            expect(out.error).toBe('cantDeleteSelf')
        })

        it('deletes the user and their sessions', async () => {
            await loginAs('admin')
            const other = makeUser()
            await createSession(other, null)
            const out = await adminDeleteUserAction(
                {},
                formOf({ userId: other }),
            )
            expect(out.success).toBeDefined()
            expect(
                db.select().from(users).where(eq(users.id, other)).get(),
            ).toBeUndefined()
            expect(
                db
                    .select()
                    .from(sessions)
                    .where(eq(sessions.userId, other))
                    .all(),
            ).toHaveLength(0)
        })
    },
)

describe(
    'adminResetPasswordAction',
    { timeout: 30_000 },
    () => {
        it('resets the password and revokes that user’s sessions', async () => {
            await loginAs('admin')
            const other = makeUser()
            await createSession(other, null)
            const out = await adminResetPasswordAction(
                {},
                formOf({ userId: other, tempPassword: 'correct horse battery' }),
            )
            expect(out.success).toBeDefined()
            expect(
                db
                    .select()
                    .from(sessions)
                    .where(eq(sessions.userId, other))
                    .all(),
            ).toHaveLength(0)
        })

        it('returns invalidUser for a malformed userId', async () => {
            await loginAs('admin')
            const out = await adminResetPasswordAction(
                {},
                formOf({ userId: 'not-a-uuid', tempPassword: 'long enough pw' }),
            )
            expect(out.error).toBe('invalidUser')
        })
    },
)
