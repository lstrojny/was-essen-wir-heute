import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSetupOrSession } from '@/auth/guards'
import { parseRecipeId } from '@/db/ids'
import {
    getRecipe,
    listCentralIngredientsForPicker,
    listCuisines,
} from '@/recipes/queries'
import { RecipeForm, type RecipeFormInitial } from '../RecipeForm'

export default async function EditRecipePage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const session = await requireSetupOrSession()
    const t = await getTranslations()
    const { id: idStr } = await params
    const id = parseRecipeId(idStr)
    if (!id) {
        notFound()
    }
    const recipe = getRecipe(id)
    if (!recipe) {
        notFound()
    }
    const primary =
        session.user.language === 'de' ? recipe.titleDe : recipe.titleEn
    const fallback =
        session.user.language === 'de' ? recipe.titleEn : recipe.titleDe
    const title = primary ?? fallback ?? t('recipes.unnamed')

    const cuisines = listCuisines()
    const centralIngredients = listCentralIngredientsForPicker()

    const initialValues: RecipeFormInitial = {
        id: recipe.id,
        titleDe: recipe.titleDe ?? '',
        titleEn: recipe.titleEn ?? '',
        notesDe: recipe.notesDe ?? '',
        notesEn: recipe.notesEn ?? '',
        cuisineKey: recipe.cuisineKey,
        activeTimeMinutes: String(recipe.activeTimeMinutes),
        waitTimeMinutes:
            recipe.waitTimeMinutes === 0 ? '' : String(recipe.waitTimeMinutes),
        ingredients: recipe.ingredients.map((ing) => ({
            amount: ing.amount === null ? '' : String(ing.amount),
            unit: ing.unit ?? '',
            name: ing.name,
            centralIngredientId: ing.centralIngredientId,
        })),
        steps: recipe.steps.map((step) => ({
            textDe: step.textDe ?? '',
            textEn: step.textEn ?? '',
        })),
    }
    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Stack spacing={3}>
                <Typography variant="h4">{title}</Typography>
                <RecipeForm
                    initialValues={initialValues}
                    cuisines={cuisines}
                    centralIngredients={centralIngredients}
                    activeLanguage={session.user.language}
                />
            </Stack>
        </Container>
    )
}
