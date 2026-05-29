import { beforeEach, describe, expect, it, vi } from 'vitest'

const translateMock = vi.hoisted(() => vi.fn())
const requireSetupOrSessionMock = vi.hoisted(() => vi.fn())

vi.mock('./translate', () => ({
    translateText: translateMock,
}))
vi.mock('@/auth/guards', () => ({
    requireSetupOrSession: requireSetupOrSessionMock,
}))

const { translateFieldAction } = await import('./translate-action')

beforeEach(() => {
    translateMock.mockReset()
    requireSetupOrSessionMock.mockReset()
    requireSetupOrSessionMock.mockResolvedValue({})
})

describe('translateFieldAction', () => {
    it('returns ok=false when source text is empty after trimming', async () => {
        const result = await translateFieldAction({
            text: '   ',
            sourceLocale: 'de',
            targetLocales: ['en'],
            kind: 'recipe.title',
        })
        expect(result).toEqual({ ok: false, error: 'empty source text' })
        expect(translateMock).not.toHaveBeenCalled()
    })

    it('returns ok=false for an unsupported source locale', async () => {
        const result = await translateFieldAction({
            text: 'hello',
            sourceLocale: 'fr' as 'de',
            targetLocales: ['en'],
            kind: 'recipe.title',
        })
        expect(result).toEqual({ ok: false, error: 'invalid source locale' })
        expect(translateMock).not.toHaveBeenCalled()
    })

    it('returns empty translations when no usable targets remain after filtering', async () => {
        const result = await translateFieldAction({
            text: 'hello',
            sourceLocale: 'de',
            targetLocales: ['fr' as 'en'], // unsupported → filtered out
            kind: 'recipe.title',
        })
        expect(result).toEqual({ ok: true, translations: {} })
        expect(translateMock).not.toHaveBeenCalled()
    })

    it('passes the trimmed text and filtered targets to translateText', async () => {
        translateMock.mockResolvedValue({ en: 'Hello' })
        const result = await translateFieldAction({
            text: '  Hallo  ',
            sourceLocale: 'de',
            targetLocales: ['en', 'fr' as 'en'],
            kind: 'recipe.title',
        })
        expect(result).toEqual({ ok: true, translations: { en: 'Hello' } })
        expect(translateMock).toHaveBeenCalledWith({
            text: 'Hallo',
            sourceLocale: 'de',
            targetLocales: ['en'],
            kind: 'recipe.title',
        })
    })

    it('maps a thrown LLM error to ok=false with the error message', async () => {
        translateMock.mockRejectedValue(new Error('boom'))
        const result = await translateFieldAction({
            text: 'hello',
            sourceLocale: 'de',
            targetLocales: ['en'],
            kind: 'recipe.title',
        })
        expect(result).toEqual({ ok: false, error: 'boom' })
    })

    it('requires an authenticated session (or first-run setup) before doing anything', async () => {
        await translateFieldAction({
            text: 'hello',
            sourceLocale: 'de',
            targetLocales: ['en'],
            kind: 'recipe.title',
        })
        expect(requireSetupOrSessionMock).toHaveBeenCalled()
    })
})
