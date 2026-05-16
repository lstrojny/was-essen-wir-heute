import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, ne } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { db } from '@/db'
import { sessions, users } from '@/db/schema'

export const SESSION_COOKIE_NAME = 'wewh_session'

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
const SESSION_HARD_CAP_MS = 90 * 24 * 60 * 60 * 1000
const SESSION_EXTEND_THROTTLE_MS = 24 * 60 * 60 * 1000

function generateToken(): string {
    return randomBytes(32).toString('base64url')
}

function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
}

export type SessionUser = {
    id: number
    email: string
    displayName: string
    role: 'admin' | 'user'
    language: 'de' | 'en'
}

export type AuthenticatedSession = {
    sessionId: string
    user: SessionUser
}

export async function createSession(
    userId: number,
    userAgent: string | null,
): Promise<string> {
    const token = generateToken()
    const id = hashToken(token)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS)
    db.insert(sessions)
        .values({
            id,
            userId,
            expiresAt,
            lastUsedAt: now,
            createdAt: now,
            userAgent,
        })
        .run()
    return token
}

export async function setSessionCookie(token: string): Promise<void> {
    const store = await cookies()
    store.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_LIFETIME_MS / 1000,
    })
}

export async function clearSessionCookie(): Promise<void> {
    const store = await cookies()
    store.delete(SESSION_COOKIE_NAME)
}

export async function readSessionToken(): Promise<string | null> {
    const store = await cookies()
    return store.get(SESSION_COOKIE_NAME)?.value ?? null
}

export async function getAuthenticatedSession(): Promise<AuthenticatedSession | null> {
    const token = await readSessionToken()
    if (!token) {
        return null
    }
    const id = hashToken(token)
    const now = new Date()
    const row = db
        .select({
            session: sessions,
            user: users,
        })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now)))
        .get()
    if (!row) {
        return null
    }
    const absoluteCap = new Date(
        row.session.createdAt.getTime() + SESSION_HARD_CAP_MS,
    )
    if (now >= absoluteCap) {
        db.delete(sessions).where(eq(sessions.id, id)).run()
        return null
    }
    const sinceLastTouch = now.getTime() - row.session.lastUsedAt.getTime()
    if (sinceLastTouch >= SESSION_EXTEND_THROTTLE_MS) {
        const proposedExpiry = new Date(now.getTime() + SESSION_LIFETIME_MS)
        const cappedExpiry =
            proposedExpiry < absoluteCap ? proposedExpiry : absoluteCap
        db.update(sessions)
            .set({ lastUsedAt: now, expiresAt: cappedExpiry })
            .where(eq(sessions.id, id))
            .run()
    }
    return {
        sessionId: id,
        user: {
            id: row.user.id,
            email: row.user.email,
            displayName: row.user.displayName,
            role: row.user.role,
            language: row.user.language,
        },
    }
}

export async function destroySession(): Promise<void> {
    const token = await readSessionToken()
    if (token) {
        const id = hashToken(token)
        db.delete(sessions).where(eq(sessions.id, id)).run()
    }
    await clearSessionCookie()
}

export function destroyAllSessionsExcept(
    userId: number,
    keepSessionId: string,
): void {
    db.delete(sessions)
        .where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)))
        .run()
}

export function destroyAllSessionsForUser(userId: number): void {
    db.delete(sessions).where(eq(sessions.userId, userId)).run()
}
