import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSetupOrSession } from '@/auth/guards'
import { parseIngredientId } from '@/db/ids'
import { resolveText } from '@/i18n/translatable'
import { getIngredient } from '@/ingredients/queries'
import { findRecipesUsingIngredient, listCuisines } from '@/recipes/queries'
import { IngredientForm, type IngredientFormInitial } from '../IngredientForm'
import { UsedInRecipes } from './UsedInRecipes'

export default async function EditIngredientPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const session = await requireSetupOrSession()
    const t = await getTranslations()
    const locale = session.user.language
    const { id: idStr } = await params
    const id = parseIngredientId(idStr)
    if (!id) {
        notFound()
    }
    const ingredient = getIngredient(id)
    if (!ingredient) {
        notFound()
    }
    const title =
        resolveText(ingredient.canonical, locale)?.text ??
        t('ingredients.unnamed')
    const initialValues: IngredientFormInitial = {
        id: ingredient.id,
        canonical: ingredient.canonical,
        role: ingredient.role,
        density: ingredient.density === null ? '' : String(ingredient.density),
        notes: ingredient.notes ?? '',
        aliases: ingredient.aliases.map((a) => ({ id: a.id, text: a.text })),
        countUnits: ingredient.countUnits.map((cu) => ({
            unit: cu.unit,
            gramsPerUnit: String(cu.gramsPerUnit),
        })),
    }
    const usedIn = findRecipesUsingIngredient(ingredient.id)
    const cuisines = listCuisines(locale)
    const cuisineLabels = Object.fromEntries(
        cuisines.map((c) => [c.key, c.label]),
    )
    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Stack spacing={3}>
                <Typography variant="h4">{title}</Typography>
                <IngredientForm
                    initialValues={initialValues}
                    activeLanguage={locale}
                />
                <UsedInRecipes
                    rows={usedIn}
                    activeLanguage={locale}
                    cuisineLabels={cuisineLabels}
                />
            </Stack>
        </Container>
    )
}
