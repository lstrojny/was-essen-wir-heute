import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSetupOrSession } from '@/auth/guards'
import { parseRecipeId } from '@/db/ids'
import { resolveText } from '@/i18n/translatable'
import { DEFAULT_FORM_SERVINGS } from '@/recipes/constants'
import {
    getMyRatingForRecipe,
    getRatingAggregateForRecipe,
    getRecipe,
    getRolledUpRecipe,
    listCuisines,
    listIngredientsForPicker,
    listRatingsForRecipe,
    listRecipesForComponentPicker,
} from '@/recipes/queries'
import { AggregateRating, RatingControl } from '../Rating'
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
    const title =
        resolveText(recipe.title, session.user.language)?.text ??
        t('recipes.unnamed')

    const cuisines = listCuisines(session.user.language)
    const ingredients = listIngredientsForPicker()
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
        title: recipe.title,
        notes: recipe.notes,
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
            ingredientId: ing.ingredientId,
        })),
        steps: recipe.steps.map((step) => ({ id: step.id, text: step.text })),
        components: recipe.components.map((c) => {
            const totals = candidateTotals.get(c.childRecipeId) ?? {
                totalActiveTimeMinutes: 0,
                totalWaitTimeMinutes: 0,
            }
            return {
                childRecipeId: c.childRecipeId,
                title: c.childTitle,
                ...totals,
            }
        }),
    }
    const rolledUp = getRolledUpRecipe(recipe.id)
    const aggregate = getRatingAggregateForRecipe(recipe.id)
    const myRating = getMyRatingForRecipe(recipe.id, session.user.id)
    const allRatings = listRatingsForRecipe(recipe.id)
    const othersRatings = allRatings.filter((r) => r.userId !== session.user.id)
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
                <Stack spacing={1}>
                    <Typography variant="overline" color="text.secondary">
                        {t('recipes.rating.sectionTitle')}
                    </Typography>
                    <RatingControl
                        recipeId={recipe.id}
                        initialScore={myRating}
                        aggregateAverage={aggregate.average}
                        aggregateCount={aggregate.count}
                    />
                    {othersRatings.length > 0 ? (
                        <Stack spacing={0.25}>
                            {othersRatings.map((r) => (
                                <Stack
                                    key={r.userId}
                                    direction="row"
                                    spacing={1}
                                    sx={{ alignItems: 'center' }}
                                >
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{ minWidth: 120 }}
                                    >
                                        {r.displayName}
                                    </Typography>
                                    <AggregateRating
                                        average={r.score}
                                        count={1}
                                        size="small"
                                        showCount={false}
                                    />
                                </Stack>
                            ))}
                        </Stack>
                    ) : null}
                </Stack>
                <RecipeForm
                    initialValues={initialValues}
                    cuisines={cuisines}
                    ingredientOptions={ingredients}
                    componentCandidates={componentCandidates}
                    activeLanguage={session.user.language}
                    rolledUp={rolledUp}
                />
            </Stack>
        </Container>
    )
}
