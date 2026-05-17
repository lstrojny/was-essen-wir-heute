'use client'

import { useEffect, useState } from 'react'
import {
    clearNewRecipeDraft,
    loadNewRecipeDraft,
} from '@/recipes/draft-storage'
import type {
    CuisineRow,
    IngredientOption,
    RecipePickerRow,
} from '@/recipes/queries'
import { RecipeForm, type RecipeFormInitial } from '../RecipeForm'
import { synthesizedToFormInitial } from '../recipe-form-conversion'

/**
 * Wrapper for `/recipes/new` that may prefill the form from a chat-stashed
 * draft (see `open_new_recipe_form` tool). On first render — both SSR and
 * initial client hydration — we use `EMPTY` (no mismatch). On mount, if
 * `?draft=<id>` is in the URL and sessionStorage has that draft, we
 * remount the form with the prefilled values via `key`, then clear the
 * stash so a reload doesn't re-apply.
 */
export function NewRecipeFormClient({
    empty,
    cuisines,
    ingredientOptions,
    componentCandidates,
    activeLanguage,
    draftId,
}: {
    empty: RecipeFormInitial
    cuisines: CuisineRow[]
    ingredientOptions: IngredientOption[]
    componentCandidates: RecipePickerRow[]
    activeLanguage: 'de' | 'en'
    draftId: string | null
}) {
    const [initialValues, setInitialValues] = useState<RecipeFormInitial>(empty)
    const [formKey, setFormKey] = useState(0)

    useEffect(() => {
        if (!draftId) return
        const draft = loadNewRecipeDraft(draftId)
        if (!draft) return
        setInitialValues(synthesizedToFormInitial(draft))
        setFormKey((k) => k + 1)
        clearNewRecipeDraft(draftId)
    }, [draftId])

    return (
        <RecipeForm
            key={formKey}
            initialValues={initialValues}
            cuisines={cuisines}
            ingredientOptions={ingredientOptions}
            componentCandidates={componentCandidates}
            activeLanguage={activeLanguage}
            rolledUp={null}
            source="llm-chat"
        />
    )
}
