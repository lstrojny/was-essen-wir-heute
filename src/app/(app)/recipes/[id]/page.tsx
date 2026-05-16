import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSetupOrSession } from '@/auth/guards'
import { parseRecipeId } from '@/db/ids'
import { DEFAULT_FORM_SERVINGS } from '@/recipes/constants'
import {
    getRecipe,
    getRolledUpRecipe,
    listCentralIngredientsForPicker,
    listCuisines,
    listRecipesForComponentPicker,
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
    const componentCandidates = listRecipesForComponentPicker(recipe.id)
    const candidateTotals = new Map(
        componentCandidates.map((c) => [
            c.id,
            {
                totalActiveTimeMinutes: c.totalActiveTimeMinutes,
                totalWaitTimeMinutes: c.totalWaitTimeMinutes,
            },
        ]),
    )

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
        isCompleteMeal: recipe.isCompleteMeal,
        formServings: DEFAULT_FORM_SERVINGS,
        ingredients: recipe.ingredients.map((ing) => ({
            amount:
                ing.amount === null
                    ? ''
                    : String(
                          Math.round(
                              ing.amount * DEFAULT_FORM_SERVINGS * 1000,
                          ) / 1000,
                      ),
            unit: ing.unit ?? '',
            name: ing.name,
            centralIngredientId: ing.centralIngredientId,
        })),
        steps: recipe.steps.map((step) => ({
            textDe: step.textDe ?? '',
            textEn: step.textEn ?? '',
        })),
        components: recipe.components.map((c) => {
            const totals = candidateTotals.get(c.childRecipeId) ?? {
                totalActiveTimeMinutes: 0,
                totalWaitTimeMinutes: 0,
            }
            return {
                childRecipeId: c.childRecipeId,
                titleDe: c.childTitleDe,
                titleEn: c.childTitleEn,
                ...totals,
            }
        }),
    }
    const rolledUp = getRolledUpRecipe(recipe.id)
    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Stack spacing={3}>
                <Stack
                    direction="row"
                    spacing={2}
                    sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                >
                    <Typography variant="h4">{title}</Typography>
                    {recipe.isCompleteMeal ? (
                        <Chip
                            label={t('recipes.completeMeal')}
                            color="success"
                            size="small"
                        />
                    ) : null}
                </Stack>
                <RecipeForm
                    initialValues={initialValues}
                    cuisines={cuisines}
                    centralIngredients={centralIngredients}
                    componentCandidates={componentCandidates}
                    activeLanguage={session.user.language}
                    rolledUp={rolledUp}
                />
            </Stack>
        </Container>
    )
}
