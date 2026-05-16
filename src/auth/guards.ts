import { sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { users } from '@/db/schema'
import {
    type AuthenticatedSession,
    getAuthenticatedSession,
    type SessionUser,
} from './session'

export function hasAnyUser(): boolean {
    const row = db.select({ n: sql<number>`count(*)` }).from(users).get()
    return (row?.n ?? 0) > 0
}

export async function requireSetupOrSession(): Promise<AuthenticatedSession> {
    if (!hasAnyUser()) {
        redirect('/setup')
    }
    const session = await getAuthenticatedSession()
    if (!session) {
        redirect('/login')
    }
    return session
}

export async function requireAdmin(): Promise<SessionUser> {
    const session = await requireSetupOrSession()
    if (session.user.role !== 'admin') {
        redirect('/')
    }
    return session.user
}

export async function redirectIfAuthenticated(): Promise<void> {
    if (!hasAnyUser()) {
        redirect('/setup')
    }
    const session = await getAuthenticatedSession()
    if (session) {
        redirect('/')
    }
}

export async function redirectIfNotFirstRun(): Promise<void> {
    if (hasAnyUser()) {
        redirect('/login')
    }
}
