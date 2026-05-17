'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { db } from '@/db'
import { parseUserId } from '@/db/ids'
import { sessions, users } from '@/db/schema'
import { hasAnyUser, requireAdmin, requireSetupOrSession } from './guards'
import {
    hashPassword,
    MIN_PASSWORD_LENGTH,
    verifyPassword,
    WeakPasswordError,
} from './password'
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
export type AuthFormState = FormState

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
    const t = await getTranslations('errors')
    const email = readString(data, 'email').toLowerCase()
    const displayName = readString(data, 'displayName')
    const password = readString(data, 'password')
    const language = readLanguage(data, 'language')
    if (!isEmail(email)) {
        return { error: t('invalidEmail') }
    }
    if (!displayName) {
        return { error: t('displayNameRequired') }
    }
    if (!language) {
        return { error: t('pickLanguage') }
    }
    let passwordHash: string
    try {
        passwordHash = await hashPassword(password)
    } catch (err) {
        if (err instanceof WeakPasswordError) {
            return { error: t('weakPassword', { min: MIN_PASSWORD_LENGTH }) }
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
    const t = await getTranslations('errors')
    const email = readString(data, 'email').toLowerCase()
    const password = readString(data, 'password')
    if (!email || !password) {
        return { error: t('invalidLogin') }
    }
    const allowed = checkLoginAllowed(email)
    if (!allowed.allowed) {
        return { error: t('tooManyAttempts') }
    }
    const user = db.select().from(users).where(eq(users.email, email)).get()
    if (!user) {
        recordFailedLogin(email)
        return { error: t('invalidLogin') }
    }
    const ok = await verifyPassword(user.passwordHash, password)
    if (!ok) {
        recordFailedLogin(email)
        return { error: t('invalidLogin') }
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

export async function updateOwnProfileAction(
    _prev: FormState,
    data: FormData,
): Promise<FormState> {
    const session = await requireSetupOrSession()
    const tErr = await getTranslations('errors')
    const tProfile = await getTranslations('settings.profile')
    const displayName = readString(data, 'displayName')
    const language = readLanguage(data, 'language')
    if (!displayName) {
        return { error: tErr('displayNameRequired') }
    }
    if (!language) {
        return { error: tErr('pickLanguage') }
    }
    db.update(users)
        .set({ displayName, language, updatedAt: new Date() })
        .where(eq(users.id, session.user.id))
        .run()
    if (language !== session.user.language) {
        revalidatePath('/', 'layout')
    }
    return { success: tProfile('saved') }
}

export async function changeOwnPasswordAction(
    _prev: FormState,
    data: FormData,
): Promise<FormState> {
    const session = await requireSetupOrSession()
    const tErr = await getTranslations('errors')
    const tPwd = await getTranslations('settings.password')
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
        return { error: tErr('currentPasswordWrong') }
    }
    let passwordHash: string
    try {
        passwordHash = await hashPassword(next)
    } catch (err) {
        if (err instanceof WeakPasswordError) {
            return { error: tErr('weakPassword', { min: MIN_PASSWORD_LENGTH }) }
        }
        throw err
    }
    db.update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, user.id))
        .run()
    destroyAllSessionsExcept(user.id, session.sessionId)
    return { success: tPwd('changed') }
}

export async function adminCreateUserAction(
    _prev: FormState,
    data: FormData,
): Promise<FormState> {
    await requireAdmin()
    const tErr = await getTranslations('errors')
    const tCreate = await getTranslations('admin.users.create')
    const email = readString(data, 'email').toLowerCase()
    const displayName = readString(data, 'displayName')
    const password = readString(data, 'password')
    const role = readRole(data, 'role')
    const language = readLanguage(data, 'language')
    if (!isEmail(email)) {
        return { error: tErr('invalidEmail') }
    }
    if (!displayName) {
        return { error: tErr('displayNameRequired') }
    }
    if (!role) {
        return { error: tErr('pickRole') }
    }
    if (!language) {
        return { error: tErr('pickLanguage') }
    }
    const existing = db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .get()
    if (existing) {
        return { error: tErr('emailExists') }
    }
    let passwordHash: string
    try {
        passwordHash = await hashPassword(password)
    } catch (err) {
        if (err instanceof WeakPasswordError) {
            return { error: tErr('weakPassword', { min: MIN_PASSWORD_LENGTH }) }
        }
        throw err
    }
    db.insert(users)
        .values({ email, displayName, passwordHash, role, language })
        .run()
    return { success: tCreate('created', { email }) }
}

export async function adminResetPasswordAction(
    _prev: FormState,
    data: FormData,
): Promise<FormState> {
    await requireAdmin()
    const tErr = await getTranslations('errors')
    const tRow = await getTranslations('admin.users.row')
    const userId = parseUserId(readString(data, 'userId'))
    const tempPassword = readString(data, 'tempPassword')
    if (!userId) {
        return { error: tErr('invalidUser') }
    }
    let passwordHash: string
    try {
        passwordHash = await hashPassword(tempPassword)
    } catch (err) {
        if (err instanceof WeakPasswordError) {
            return { error: tErr('weakPassword', { min: MIN_PASSWORD_LENGTH }) }
        }
        throw err
    }
    db.update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .run()
    destroyAllSessionsForUser(userId)
    return { success: tRow('passwordReset') }
}

export async function adminChangeRoleAction(
    _prev: FormState,
    data: FormData,
): Promise<FormState> {
    const admin = await requireAdmin()
    const tErr = await getTranslations('errors')
    const tRow = await getTranslations('admin.users.row')
    const userId = parseUserId(readString(data, 'userId'))
    const role = readRole(data, 'role')
    if (!userId || !role) {
        return { error: tErr('invalidInput') }
    }
    if (userId === admin.id && role !== 'admin') {
        return { error: tErr('cantDemoteSelf') }
    }
    db.update(users)
        .set({ role, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .run()
    return { success: tRow('roleSaved') }
}

export async function adminDeleteUserAction(
    _prev: FormState,
    data: FormData,
): Promise<FormState> {
    const admin = await requireAdmin()
    const tErr = await getTranslations('errors')
    const tRow = await getTranslations('admin.users.row')
    const userId = parseUserId(readString(data, 'userId'))
    if (!userId) {
        return { error: tErr('invalidUser') }
    }
    if (userId === admin.id) {
        return { error: tErr('cantDeleteSelf') }
    }
    db.delete(sessions).where(eq(sessions.userId, userId)).run()
    db.delete(users).where(eq(users.id, userId)).run()
    return { success: tRow('deleted') }
}

export async function refreshSession(): Promise<void> {
    await getAuthenticatedSession()
}
