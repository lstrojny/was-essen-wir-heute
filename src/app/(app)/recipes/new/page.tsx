import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { getTranslations } from 'next-intl/server'
import { requireSetupOrSession } from '@/auth/guards'
import { DEFAULT_FORM_SERVINGS } from '@/recipes/constants'
import {
    listCuisines,
    listIngredientsForPicker,
    listRecipesForComponentPicker,
} from '@/recipes/queries'
import type { RecipeFormInitial } from '../RecipeForm'
import { NewRecipeFormClient } from './NewRecipeFormClient'

const EMPTY: RecipeFormInitial = {
    id: null,
    titleDe: '',
    titleEn: '',
    notesDe: '',
    notesEn: '',
    cuisineKey: '',
    activeTimeMinutes: '',
    waitTimeMinutes: '',
    isCompleteMeal: false,
    formServings: DEFAULT_FORM_SERVINGS,
    ingredients: [],
    steps: [],
    components: [],
}

export default async function NewRecipePage({
    searchParams,
}: {
    searchParams: Promise<{ draft?: string }>
}) {
    const session = await requireSetupOrSession()
    const t = await getTranslations()
    const cuisines = listCuisines()
    const ingredients = listIngredientsForPicker()
    const componentCandidates = listRecipesForComponentPicker(null)
    const params = await searchParams
    const draftId =
        typeof params.draft === 'string' && params.draft ? params.draft : null
    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Stack spacing={3}>
                <Typography variant="h4">
                    {t('recipes.form.newTitle')}
                </Typography>
                <NewRecipeFormClient
                    empty={EMPTY}
                    cuisines={cuisines}
                    ingredientOptions={ingredients}
                    componentCandidates={componentCandidates}
                    activeLanguage={session.user.language}
                    draftId={draftId}
                />
            </Stack>
        </Container>
    )
}
