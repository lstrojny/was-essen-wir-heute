import { hash, verify } from '@node-rs/argon2'

const ARGON2_OPTIONS = {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
} as const

export const MIN_PASSWORD_LENGTH = 10

export class WeakPasswordError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'WeakPasswordError'
    }
}

export function assertPasswordPolicy(password: string): void {
    if (password.length < MIN_PASSWORD_LENGTH) {
        throw new WeakPasswordError(
            `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        )
    }
}

export async function hashPassword(password: string): Promise<string> {
    assertPasswordPolicy(password)
    return hash(password, ARGON2_OPTIONS)
}

export async function verifyPassword(
    stored: string,
    candidate: string,
): Promise<boolean> {
    try {
        return await verify(stored, candidate)
    } catch {
        return false
    }
}
