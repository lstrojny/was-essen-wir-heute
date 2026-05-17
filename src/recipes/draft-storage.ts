import type { NewRecipeDraft } from '@/llm/tools'

/**
 * sessionStorage namespace for chat-proposed "new recipe" drafts.
 * Each draft is keyed by a freshly-generated UUID so multiple chats can
 * stash drafts in parallel without clobbering each other. The
 * `/recipes/new` page receives the id via `?draft=<id>` and reads it on
 * mount.
 */
export const NEW_RECIPE_DRAFT_STORAGE_PREFIX = 'wewh.newRecipeDraft.'

export function newRecipeDraftStorageKey(id: string): string {
    return NEW_RECIPE_DRAFT_STORAGE_PREFIX + id
}

export function storeNewRecipeDraft(draft: NewRecipeDraft): string {
    const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
    window.sessionStorage.setItem(
        newRecipeDraftStorageKey(id),
        JSON.stringify(draft),
    )
    return id
}

export function loadNewRecipeDraft(id: string): NewRecipeDraft | null {
    try {
        const raw = window.sessionStorage.getItem(newRecipeDraftStorageKey(id))
        if (!raw) return null
        return JSON.parse(raw) as NewRecipeDraft
    } catch {
        return null
    }
}

export function clearNewRecipeDraft(id: string) {
    window.sessionStorage.removeItem(newRecipeDraftStorageKey(id))
}
