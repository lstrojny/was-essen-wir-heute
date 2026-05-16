'use server'

import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { parseUserId } from '@/db/ids'
import { sessions, users } from '@/db/schema'
import { hasAnyUser, requireAdmin, requireSetupOrSession } from './guards'
import { hashPassword, verifyPassword, WeakPasswordError } from './password'
import {
    checkLoginAllowed,
    recordFailedLogin,
    recordSuccessfulLogin,
} from './rate-limit'
import {
    createSession,
    destroyAllSessionsExcept,
    destroyAllSessionsForUser,
    destroySession,
    getAuthenticatedSession,
    setSessionCookie,
} from './session'

const LANGUAGES = ['de', 'en'] as const
type Language = (typeof LANGUAGES)[number]

const ROLES = ['admin', 'user'] as const
type Role = (typeof ROLES)[number]

type FormState = { error?: string; success?: string }

function readString(data: FormData, name: string): string {
    const value = data.get(name)
    return typeof value === 'string' ? value.trim() : ''
}

function readLanguage(data: FormData, name: string): Language | null {
    const value = readString(data, name)
    return (LANGUAGES as readonly string[]).includes(value)
        ? (value as Language)
        : null
}

function readRole(data: FormData, name: string): Role | null {
    const value = readString(data, name)
    return (ROLES as readonly string[]).includes(value) ? (value as Role) : null
}

function isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

async function captureUserAgent(): Promise<string | null> {
    const h = await headers()
    return h.get('user-agent')
}

export async function setupAction(
    _prev: FormState,
    data: FormData,
): Promise<FormState> {
    if (hasAnyUser()) {
        redirect('/login')
    }
    const email = readString(data, 'email').toLowerCase()
    const displayName = readString(data, 'displayName')
    const password = readString(data, 'password')
    const language = readLanguage(data, 'language')
    if (!isEmail(email)) {
        return { error: 'Please enter a valid email address.' }
    }
    if (!displayName) {
        return { error: 'Display name is required.' }
    }
    if (!language) {
        return { error: 'Pick a language.' }
    }
    let passwordHash: string
    try {
        passwordHash = await hashPassword(password)
    } catch (err) {
        if (err instanceof WeakPasswordError) {
            return { error: err.message }
        }
        throw err
    }
    const inserted = db
        .insert(users)
        .values({ email, displayName, passwordHash, role: 'admin', language })
        .returning({ id: users.id })
        .get()
    const token = await createSession(inserted.id, await captureUserAgent())
    await setSessionCookie(token)
    redirect('/')
}

export async function loginAction(
    _prev: FormState,
    data: FormData,
): Promise<FormState> {
    const email = readString(data, 'email').toLowerCase()
    const password = readString(data, 'password')
    if (!email || !password) {
        return { error: 'Invalid email or password.' }
    }
    const allowed = checkLoginAllowed(email)
    if (!allowed.allowed) {
        return { error: 'Too many attempts. Try again later.' }
    }
    const user = db.select().from(users).where(eq(users.email, email)).get()
    if (!user) {
        recordFailedLogin(email)
        return { error: 'Invalid email or password.' }
    }
    const ok = await verifyPassword(user.passwordHash, password)
    if (!ok) {
        recordFailedLogin(email)
        return { error: 'Invalid email or password.' }
    }
    recordSuccessfulLogin(email)
    const token = await createSession(user.id, await captureUserAgent())
    await setSessionCookie(token)
    redirect('/')
}

export async function logoutAction(): Promise<void> {
    await destroySession()
    redirect('/login')
}

export type AuthFormState = FormState

export async function updateOwnProfileAction(
    _prev: FormState,
    data: FormData,
): Promise<FormState> {
    const session = await requireSetupOrSession()
    const displayName = readString(data, 'displayName')
    const language = readLanguage(data, 'language')
    if (!displayName) {
        return { error: 'Display name is required.' }
    }
    if (!language) {
        return { error: 'Pick a language.' }
    }
    db.update(users)
        .set({ displayName, language, updatedAt: new Date() })
        .where(eq(users.id, session.user.id))
        .run()
    return { success: 'Profile updated.' }
}

export async function changeOwnPasswordAction(
    _prev: FormState,
    data: FormData,
): Promise<FormState> {
    const session = await requireSetupOrSession()
    const current = readString(data, 'current')
    const next = readString(data, 'next')
    const user = db
        .select()
        .from(users)
        .where(eq(users.id, session.user.id))
        .get()
    if (!user) {
        redirect('/login')
    }
    const ok = await verifyPassword(user.passwordHash, current)
    if (!ok) {
        return { error: 'Current password is incorrect.' }
    }
    let passwordHash: string
    try {
        passwordHash = await hashPassword(next)
    } catch (err) {
        if (err instanceof WeakPasswordError) {
            return { error: err.message }
        }
        throw err
    }
    db.update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, user.id))
        .run()
    destroyAllSessionsExcept(user.id, session.sessionId)
    return { success: 'Password changed.' }
}

export async function adminCreateUserAction(
    _prev: FormState,
    data: FormData,
): Promise<FormState> {
    await requireAdmin()
    const email = readString(data, 'email').toLowerCase()
    const displayName = readString(data, 'displayName')
    const password = readString(data, 'password')
    const role = readRole(data, 'role')
    const language = readLanguage(data, 'language')
    if (!isEmail(email)) {
        return { error: 'Please enter a valid email address.' }
    }
    if (!displayName) {
        return { error: 'Display name is required.' }
    }
    if (!role) {
        return { error: 'Pick a role.' }
    }
    if (!language) {
        return { error: 'Pick a language.' }
    }
    const existing = db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .get()
    if (existing) {
        return { error: 'A user with that email already exists.' }
    }
    let passwordHash: string
    try {
        passwordHash = await hashPassword(password)
    } catch (err) {
        if (err instanceof WeakPasswordError) {
            return { error: err.message }
        }
        throw err
    }
    db.insert(users)
        .values({ email, displayName, passwordHash, role, language })
        .run()
    return { success: `User ${email} created.` }
}

export async function adminResetPasswordAction(
    _prev: FormState,
    data: FormData,
): Promise<FormState> {
    await requireAdmin()
    const userId = parseUserId(readString(data, 'userId'))
    const tempPassword = readString(data, 'tempPassword')
    if (!userId) {
        return { error: 'Invalid user.' }
    }
    let passwordHash: string
    try {
        passwordHash = await hashPassword(tempPassword)
    } catch (err) {
        if (err instanceof WeakPasswordError) {
            return { error: err.message }
        }
        throw err
    }
    db.update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .run()
    destroyAllSessionsForUser(userId)
    return { success: 'Password reset.' }
}

export async function adminChangeRoleAction(
    _prev: FormState,
    data: FormData,
): Promise<FormState> {
    const admin = await requireAdmin()
    const userId = parseUserId(readString(data, 'userId'))
    const role = readRole(data, 'role')
    if (!userId || !role) {
        return { error: 'Invalid input.' }
    }
    if (userId === admin.id && role !== 'admin') {
        return { error: "You can't demote yourself." }
    }
    db.update(users)
        .set({ role, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .run()
    return { success: 'Role updated.' }
}

export async function adminDeleteUserAction(
    _prev: FormState,
    data: FormData,
): Promise<FormState> {
    const admin = await requireAdmin()
    const userId = parseUserId(readString(data, 'userId'))
    if (!userId) {
        return { error: 'Invalid user.' }
    }
    if (userId === admin.id) {
        return { error: "You can't delete your own account." }
    }
    db.delete(sessions).where(eq(sessions.userId, userId)).run()
    db.delete(users).where(eq(users.id, userId)).run()
    return { success: 'User deleted.' }
}

export async function refreshSession(): Promise<void> {
    await getAuthenticatedSession()
}
