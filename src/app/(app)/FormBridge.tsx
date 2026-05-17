'use client'

import {
    createContext,
    type ReactNode,
    useContext,
    useEffect,
    useMemo,
    useRef,
} from 'react'
import type {
    IngredientId,
    IngredientsAliasId,
    RecipeId,
    RecipeStepId,
} from '@/db/ids'
import type { LocaleMap } from '@/i18n/locale'

export type RecipeFormSnapshot = {
    id: RecipeId | null
    title: LocaleMap
    notes: LocaleMap
    cuisineKey: string
    activeTimeMinutes: string
    waitTimeMinutes: string
    isCompleteMeal: boolean
    ingredients: Array<{ amount: string; unit: string; name: string }>
    steps: Array<{ id: RecipeStepId | null; text: LocaleMap }>
}

export type RecipeFormPatch = Partial<{
    title: LocaleMap
    notes: LocaleMap
    cuisineKey: string
    activeTimeMinutes: number
    waitTimeMinutes: number
    isCompleteMeal: boolean
    ingredients: Array<{
        amount: number | null
        unit: string | null
        name: string
    }>
    steps: Array<{ text: LocaleMap }>
}>

export type IngredientFormSnapshot = {
    id: IngredientId | null
    canonical: LocaleMap
    role: 'starch' | 'vegetable' | 'protein' | 'none'
    density: string
    notes: string
    aliases: Array<{ id: IngredientsAliasId | null; text: LocaleMap }>
    countUnits: Array<{ unit: string; gramsPerUnit: string }>
}

export type IngredientFormPatch = Partial<{
    canonical: LocaleMap
    role: 'starch' | 'vegetable' | 'protein' | 'none'
    density: number | null
    notes: string | null
    aliases: Array<{ text: LocaleMap }>
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
