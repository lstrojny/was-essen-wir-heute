'use client'

import { useCallback, useRef, useState } from 'react'
import type { SynthesizedRecipe } from '@/llm/recipe-synthesis'

export type LlmCallState = {
    pending: boolean
    error: string | null
    recipe: SynthesizedRecipe | null
}

export function useLlmCall() {
    const [state, setState] = useState<LlmCallState>({
        pending: false,
        error: null,
        recipe: null,
    })
    const controllerRef = useRef<AbortController | null>(null)

    const start = useCallback(
        async (
            prompt: string,
            currentRecipe?: SynthesizedRecipe,
        ): Promise<SynthesizedRecipe | null> => {
            controllerRef.current?.abort()
            const controller = new AbortController()
            controllerRef.current = controller
            setState({ pending: true, error: null, recipe: null })
            try {
                const res = await fetch('/api/recipes/llm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt, currentRecipe }),
                    signal: controller.signal,
                })
                if (!res.ok) {
                    const body = (await res.json().catch(() => ({}))) as {
                        error?: string
                    }
                    const message = body.error ?? `HTTP ${res.status}`
                    setState({ pending: false, error: message, recipe: null })
                    return null
                }
                const { recipe } = (await res.json()) as {
                    recipe: SynthesizedRecipe
                }
                setState({ pending: false, error: null, recipe })
                return recipe
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') {
                    setState({ pending: false, error: null, recipe: null })
                    return null
                }
                const message = err instanceof Error ? err.message : String(err)
                setState({ pending: false, error: message, recipe: null })
                return null
            } finally {
                if (controllerRef.current === controller) {
                    controllerRef.current = null
                }
            }
        },
        [],
    )

    const cancel = useCallback(() => {
        controllerRef.current?.abort()
        controllerRef.current = null
    }, [])

    return { state, start, cancel }
}
