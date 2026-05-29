/**
 * Test-side helpers for stubbing Next.js's server-only runtime APIs
 * (`cookies()`, `redirect()`, `revalidatePath()`).
 *
 * Each helper returns plain objects/functions the test owns. Tests use
 * `vi.mock` to inject these via the corresponding module factory.
 */

export type RecordedCookie = {
    value: string
    options?: Record<string, unknown>
}

export type CookieStoreStub = {
    map: Map<string, RecordedCookie>
    get: (name: string) => { name: string; value: string } | undefined
    set: (name: string, value: string, options?: Record<string, unknown>) => void
    delete: (name: string) => void
}

export function createCookieStore(): CookieStoreStub {
    const map = new Map<string, RecordedCookie>()
    return {
        map,
        get(name) {
            const c = map.get(name)
            return c ? { name, value: c.value } : undefined
        },
        set(name, value, options) {
            map.set(name, { value, options })
        },
        delete(name) {
            map.delete(name)
        },
    }
}

/**
 * Builder for a `redirect` mock that throws a marker error so server-action
 * code aborts the same way it would in Next's runtime. Tests assert the
 * redirect target by reading `redirectMock.mock.calls[0][0]`, or by catching
 * `RedirectError` from the action.
 */
export class RedirectError extends Error {
    constructor(public readonly to: string) {
        super(`redirect: ${to}`)
        this.name = 'RedirectError'
    }
}
