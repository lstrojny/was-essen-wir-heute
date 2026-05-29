import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { NewRecipeDraft } from '@/llm/tools'
import {
    clearNewRecipeDraft,
    loadNewRecipeDraft,
    NEW_RECIPE_DRAFT_STORAGE_PREFIX,
    newRecipeDraftStorageKey,
    storeNewRecipeDraft,
} from './draft-storage'

function fakeSessionStorage(): Storage {
    const store = new Map<string, string>()
    return {
        get length() {
            return store.size
        },
        clear() {
            store.clear()
        },
        getItem(key) {
            return store.has(key) ? (store.get(key) as string) : null
        },
        key(i) {
            return [...store.keys()][i] ?? null
        },
        removeItem(key) {
            store.delete(key)
        },
        setItem(key, value) {
            store.set(key, value)
        },
    }
}

const realWindow = (globalThis as { window?: unknown }).window
let storage: Storage

beforeEach(() => {
    storage = fakeSessionStorage()
    ;(globalThis as { window: { sessionStorage: Storage } }).window = {
        sessionStorage: storage,
    }
})

afterEach(() => {
    if (realWindow === undefined) {
        delete (globalThis as { window?: unknown }).window
    } else {
        ;(globalThis as { window?: unknown }).window = realWindow
    }
})

const sampleDraft: NewRecipeDraft = {
    title: { de: 'Spaghetti', en: 'Spaghetti' },
    cuisineKey: 'italian',
    activeTimeMinutes: 20,
    waitTimeMinutes: 0,
    isCompleteMeal: true,
    ingredients: [],
    steps: [],
    notes: {},
} as unknown as NewRecipeDraft

describe('newRecipeDraftStorageKey', () => {
    it('namespaces the id under the storage prefix', () => {
        expect(newRecipeDraftStorageKey('abc')).toBe(
            `${NEW_RECIPE_DRAFT_STORAGE_PREFIX}abc`,
        )
    })
})

describe('storeNewRecipeDraft / loadNewRecipeDraft', () => {
    it('returns an id that can be round-tripped', () => {
        const id = storeNewRecipeDraft(sampleDraft)
        expect(id).toMatch(/.+/)
        expect(loadNewRecipeDraft(id)).toEqual(sampleDraft)
    })

    it('uses a fresh id every time so concurrent drafts do not collide', () => {
        const a = storeNewRecipeDraft(sampleDraft)
        const b = storeNewRecipeDraft(sampleDraft)
        expect(a).not.toBe(b)
        expect(loadNewRecipeDraft(a)).toEqual(sampleDraft)
        expect(loadNewRecipeDraft(b)).toEqual(sampleDraft)
    })

    it('writes under the namespaced storage key', () => {
        const id = storeNewRecipeDraft(sampleDraft)
        expect(storage.getItem(newRecipeDraftStorageKey(id))).not.toBeNull()
    })

    it('returns null for an unknown id', () => {
        expect(loadNewRecipeDraft('does-not-exist')).toBeNull()
    })

    it('returns null when the stored value is corrupt JSON', () => {
        storage.setItem(newRecipeDraftStorageKey('broken'), '{not-json')
        expect(loadNewRecipeDraft('broken')).toBeNull()
    })
})

describe('clearNewRecipeDraft', () => {
    it('removes the stored draft', () => {
        const id = storeNewRecipeDraft(sampleDraft)
        clearNewRecipeDraft(id)
        expect(loadNewRecipeDraft(id)).toBeNull()
    })

    it('is idempotent on an unknown id', () => {
        expect(() => clearNewRecipeDraft('unknown')).not.toThrow()
    })
})
