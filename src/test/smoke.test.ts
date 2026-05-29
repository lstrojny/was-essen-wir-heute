import { describe, expect, it } from 'vitest'

describe('vitest harness', () => {
    it('runs', () => {
        expect(1 + 1).toBe(2)
    })

    it('resolves the @ alias', async () => {
        const mod = await import('@/i18n/locale')
        expect(Array.isArray(mod.SUPPORTED_LOCALES)).toBe(true)
    })
})
