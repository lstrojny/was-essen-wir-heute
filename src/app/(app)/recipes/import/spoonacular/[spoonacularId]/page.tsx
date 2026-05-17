import Alert from '@mui/material/Alert'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { synthesizedToFormInitial } from '@/app/(app)/recipes/recipe-form-conversion'
import { requireSetupOrSession } from '@/auth/guards'
import { enrichSpoonacularImport } from '@/llm/recipe-synthesis'
import {
    listCuisines,
    listIngredientsForPicker,
    listRecipesForComponentPicker,
} from '@/recipes/queries'
import { spoonacularToFormInitial } from '@/recipes/spoonacular-import'
import { getRecipeById } from '@/spoonacular/client'
import {
    MalformedResponseError,
    NotFoundError,
    QuotaExceededError,
    TransientError,
} from '@/spoonacular/types'
import { RecipeForm } from '../../../RecipeForm'

export default async function SpoonacularPreviewPage({
    params,
}: {
    params: Promise<{ spoonacularId: string }>
}) {
    const session = await requireSetupOrSession()
    const t = await getTranslations()
    const { spoonacularId } = await params
    const idNum = Number(spoonacularId)
    if (!Number.isInteger(idNum) || idNum <= 0) {
        notFound()
    }

    let detail: Awaited<ReturnType<typeof getRecipeById>> | undefined
    let errorKey: string | null = null
    try {
        detail = await getRecipeById(idNum)
    } catch (err) {
        if (err instanceof QuotaExceededError) {
            errorKey = 'spoonacularQuotaExceeded'
        } else if (err instanceof NotFoundError) {
            errorKey = 'spoonacularNotFound'
        } else if (err instanceof TransientError) {
            errorKey = 'spoonacularTransient'
        } else if (err instanceof MalformedResponseError) {
            errorKey = 'spoonacularMalformed'
        } else if (
            err instanceof Error &&
            err.message.includes('SPOONACULAR_API_KEY')
        ) {
            errorKey = 'spoonacularNoKey'
        } else {
            throw err
        }
    }

    if (!detail) {
        return (
            <Container maxWidth="md" sx={{ py: 4 }}>
                <Stack spacing={3}>
                    <Typography variant="h4">
                        {t('recipes.import.spoonacular.previewTitle')}
                    </Typography>
                    {errorKey ? (
                        <Alert severity="error">
                            {t(`errors.${errorKey}`)}
                        </Alert>
                    ) : null}
                </Stack>
            </Container>
        )
    }

    const cuisines = listCuisines(session.user.language)
    const ingredients = listIngredientsForPicker()
    const componentCandidates = listRecipesForComponentPicker(null)

    let initialValues = spoonacularToFormInitial(detail)
    let enriched = false
    try {
        const synth = await enrichSpoonacularImport({
            detail,
            cuisineKeys: cuisines.map((c) => c.key),
            activeLanguage: session.user.language,
        })
        initialValues = synthesizedToFormInitial(synth)
        enriched = true
    } catch {
        // Enrichment is best-effort per spec — fall back to un-enriched mapping.
    }

    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Stack spacing={3}>
                <Typography variant="h4">{detail.title}</Typography>
                <Typography variant="body2" color="text.secondary">
                    {enriched
                        ? t('recipes.import.spoonacular.previewIntroEnriched')
                        : t('recipes.import.spoonacular.previewIntro')}
                </Typography>
                <RecipeForm
                    initialValues={initialValues}
                    cuisines={cuisines}
                    ingredientOptions={ingredients}
                    componentCandidates={componentCandidates}
                    activeLanguage={session.user.language}
                    rolledUp={null}
                    source="spoonacular"
                    sourceIdentifier={String(detail.id)}
                />
            </Stack>
        </Container>
    )
}
