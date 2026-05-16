import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { getTranslations } from 'next-intl/server'
import { requireSetupOrSession } from '@/auth/guards'
import {
    listCentralIngredientsForPicker,
    listCuisines,
} from '@/recipes/queries'
import { RecipeForm, type RecipeFormInitial } from '../RecipeForm'

const EMPTY: RecipeFormInitial = {
    id: null,
    titleDe: '',
    titleEn: '',
    notesDe: '',
    notesEn: '',
    cuisineKey: '',
    activeTimeMinutes: '',
    waitTimeMinutes: '',
    ingredients: [],
    steps: [],
}

export default async function NewRecipePage() {
    const session = await requireSetupOrSession()
    const t = await getTranslations()
    const cuisines = listCuisines()
    const centralIngredients = listCentralIngredientsForPicker()
    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Stack spacing={3}>
                <Typography variant="h4">
                    {t('recipes.form.newTitle')}
                </Typography>
                <RecipeForm
                    initialValues={EMPTY}
                    cuisines={cuisines}
                    centralIngredients={centralIngredients}
                    activeLanguage={session.user.language}
                />
            </Stack>
        </Container>
    )
}
