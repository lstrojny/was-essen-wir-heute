import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the Vercel AI SDK boundary so the test never reaches LiteLLM.
const generateObjectMock = vi.hoisted(() => vi.fn())
vi.mock('ai', async () => {
    const actual = await vi.importActual<typeof import('ai')>('ai')
    return { ...actual, generateObject: generateObjectMock }
})

// Import after the mock so the module under test picks up the stubbed SDK.
const { translateText } = await import('./translate')

beforeEach(() => {
    generateObjectMock.mockReset()
})

afterEach(() => {
    vi.unstubAllEnvs()
})

describe('translateText — target filtering', () => {
    it('returns an empty map without calling the LLM when no usable targets remain', async () => {
        const out = await translateText({
            text: 'Hello',
            sourceLocale: 'en',
            targetLocales: ['en'], // same as source — filtered out
            kind: 'recipe.title',
        })
        expect(out).toEqual({})
        expect(generateObjectMock).not.toHaveBeenCalled()
    })

    it('drops unsupported target locales before calling the LLM', async () => {
        generateObjectMock.mockResolvedValue({ object: { de: 'Hallo' } })
        await translateText({
            text: 'Hello',
            sourceLocale: 'en',
            targetLocales: ['de', 'fr' as 'de'], // 'fr' is unsupported
            kind: 'recipe.title',
        })
        const callArg = generateObjectMock.mock.calls[0][0]
        // Schema built from filtered targets — should only include 'de'.
        const schemaShape = callArg.schema._zod?.def?.shape ?? callArg.schema.shape
        expect(Object.keys(schemaShape ?? {})).toEqual(['de'])
    })

    it('returns the LLM object verbatim as the LocaleMap', async () => {
        generateObjectMock.mockResolvedValue({
            object: { de: 'Apfel' },
        })
        const out = await translateText({
            text: 'Apple',
            sourceLocale: 'en',
            targetLocales: ['de'],
            kind: 'ingredient.canonical',
        })
        expect(out).toEqual({ de: 'Apfel' })
    })

    it('propagates LLM errors to the caller', async () => {
        generateObjectMock.mockRejectedValue(new Error('boom'))
        await expect(
            translateText({
                text: 'Apple',
                sourceLocale: 'en',
                targetLocales: ['de'],
                kind: 'ingredient.canonical',
            }),
        ).rejects.toThrow('boom')
    })
})
