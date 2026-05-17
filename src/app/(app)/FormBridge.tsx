'use client'

import {
    createContext,
    type ReactNode,
    useContext,
    useEffect,
    useMemo,
    useRef,
} from 'react'
import type { IngredientId, RecipeId } from '@/db/ids'

export type RecipeFormSnapshot = {
    id: RecipeId | null
    titleDe: string
    titleEn: string
    notesDe: string
    notesEn: string
    cuisineKey: string
    activeTimeMinutes: string
    waitTimeMinutes: string
    isCompleteMeal: boolean
    ingredients: Array<{ amount: string; unit: string; name: string }>
    steps: Array<{ textDe: string; textEn: string }>
}

export type RecipeFormPatch = Partial<{
    titleDe: string
    titleEn: string
    notesDe: string | null
    notesEn: string | null
    cuisineKey: string
    activeTimeMinutes: number
    waitTimeMinutes: number
    isCompleteMeal: boolean
    ingredients: Array<{
        amount: number | null
        unit: string | null
        name: string
    }>
    steps: Array<{ textDe: string | null; textEn: string | null }>
}>

export type IngredientFormSnapshot = {
    id: IngredientId | null
    canonicalDe: string
    canonicalEn: string
    role: 'starch' | 'vegetable' | 'protein' | 'none'
    density: string
    notes: string
    aliases: string[]
    countUnits: Array<{ unit: string; gramsPerUnit: string }>
}

export type IngredientFormPatch = Partial<{
    canonicalDe: string
    canonicalEn: string
    role: 'starch' | 'vegetable' | 'protein' | 'none'
    density: number | null
    notes: string | null
    aliases: string[]
    countUnits: Array<{ unit: string; gramsPerUnit: number }>
}>

export type RecipeFormBridge = {
    snapshot: RecipeFormSnapshot
    applyPatch: (patch: RecipeFormPatch) => void
}

export type IngredientFormBridge = {
    snapshot: IngredientFormSnapshot
    applyPatch: (patch: IngredientFormPatch) => void
}

type FormBridgeStore = {
    recipe: RecipeFormBridge | null
    ingredient: IngredientFormBridge | null
}

type FormBridgeApi = {
    getStore: () => FormBridgeStore
    registerRecipe: (bridge: RecipeFormBridge | null) => void
    registerIngredient: (bridge: IngredientFormBridge | null) => void
}

const FormBridgeContext = createContext<FormBridgeApi | null>(null)

export function FormBridgeProvider({ children }: { children: ReactNode }) {
    const storeRef = useRef<FormBridgeStore>({
        recipe: null,
        ingredient: null,
    })

    const api = useMemo<FormBridgeApi>(
        () => ({
            getStore: () => storeRef.current,
            registerRecipe: (bridge) => {
                storeRef.current.recipe = bridge
            },
            registerIngredient: (bridge) => {
                storeRef.current.ingredient = bridge
            },
        }),
        [],
    )

    return (
        <FormBridgeContext.Provider value={api}>
            {children}
        </FormBridgeContext.Provider>
    )
}

export function useFormBridgeApi(): FormBridgeApi {
    const value = useContext(FormBridgeContext)
    if (!value) {
        throw new Error('FormBridgeProvider missing')
    }
    return value
}

export function useRegisterRecipeBridge(bridge: RecipeFormBridge) {
    const api = useFormBridgeApi()
    useEffect(() => {
        api.registerRecipe(bridge)
        return () => {
            api.registerRecipe(null)
        }
    }, [api, bridge])
}

export function useRegisterIngredientBridge(bridge: IngredientFormBridge) {
    const api = useFormBridgeApi()
    useEffect(() => {
        api.registerIngredient(bridge)
        return () => {
            api.registerIngredient(null)
        }
    }, [api, bridge])
}
