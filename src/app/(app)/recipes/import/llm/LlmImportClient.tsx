'use client'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import type {
    CentralIngredientOption,
    CuisineRow,
    RecipePickerRow,
} from '@/recipes/queries'
import { RecipeForm, type RecipeFormInitial } from '../../RecipeForm'
import { synthesizedToFormInitial } from '../../recipe-form-conversion'
import { useLlmCall } from '../../use-llm-call'

export function LlmImportClient({
    cuisines,
    centralIngredients,
    componentCandidates,
    activeLanguage,
}: {
    cuisines: CuisineRow[]
    centralIngredients: CentralIngredientOption[]
    componentCandidates: RecipePickerRow[]
    activeLanguage: 'de' | 'en'
}) {
    const t = useTranslations()
    const { state, start, cancel } = useLlmCall()
    const [prompt, setPrompt] = useState('')
    const [recipe, setRecipe] = useState<RecipeFormInitial | null>(null)

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault()
        const value = prompt.trim()
        if (!value) return
        const result = await start(value)
        if (result) {
            setRecipe(synthesizedToFormInitial(result))
        }
    }

    return (
        <Stack spacing={3}>
            <Paper sx={{ p: 3 }} variant="outlined">
                <Stack spacing={2} component="form" onSubmit={onSubmit}>
                    <Typography variant="h6">
                        {t('recipes.import.llm.promptTitle')}
                    </Typography>
                    {state.error ? (
                        <Alert severity="error">
                            {t('errors.llmSynthesisFailed', {
                                detail: state.error,
                            })}
                        </Alert>
                    ) : null}
                    <TextField
                        placeholder={t('recipes.import.llm.promptPlaceholder')}
                        multiline
                        minRows={3}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        required
                    />
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={state.pending}
                        >
                            {state.pending
                                ? t('recipes.import.llm.generating')
                                : t('recipes.import.llm.generate')}
                        </Button>
                        {state.pending ? (
                            <Button
                                onClick={cancel}
                                variant="outlined"
                                color="warning"
                            >
                                {t('recipes.import.llm.cancel')}
                            </Button>
                        ) : null}
                    </Box>
                </Stack>
            </Paper>

            {recipe ? (
                <Stack spacing={2}>
                    <Typography variant="h6">
                        {t('recipes.import.llm.previewTitle')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {t('recipes.import.llm.previewIntro')}
                    </Typography>
                    <RecipeForm
                        initialValues={recipe}
                        cuisines={cuisines}
                        centralIngredients={centralIngredients}
                        componentCandidates={componentCandidates}
                        activeLanguage={activeLanguage}
                        rolledUp={null}
                        source="llm-chat"
                    />
                </Stack>
            ) : null}
        </Stack>
    )
}
