import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { requireSetupOrSession } from '@/auth/guards'
import { parseIngredientId } from '@/db/ids'
import { getIngredient } from '@/ingredients/queries'
import { findRecipesUsingIngredient, listCuisines } from '@/recipes/queries'
import { IngredientForm, type IngredientFormInitial } from '../IngredientForm'
import { UsedInRecipes } from './UsedInRecipes'

export default async function EditIngredientPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    await requireSetupOrSession()
    const t = await getTranslations()
    const locale = await getLocale()
    const { id: idStr } = await params
    const id = parseIngredientId(idStr)
    if (!id) {
        notFound()
    }
    const ingredient = getIngredient(id)
    if (!ingredient) {
        notFound()
    }
    const primary =
        locale === 'de' ? ingredient.canonicalDe : ingredient.canonicalEn
    const fallback =
        locale === 'de' ? ingredient.canonicalEn : ingredient.canonicalDe
    const title = primary ?? fallback ?? t('ingredients.unnamed')
    const initialValues: IngredientFormInitial = {
        id: ingredient.id,
        canonicalDe: ingredient.canonicalDe ?? '',
        canonicalEn: ingredient.canonicalEn ?? '',
        role: ingredient.role,
        density: ingredient.density === null ? '' : String(ingredient.density),
        notes: ingredient.notes ?? '',
        aliases: ingredient.aliases,
        countUnits: ingredient.countUnits.map((cu) => ({
            unit: cu.unit,
            gramsPerUnit: String(cu.gramsPerUnit),
        })),
    }
    const usedIn = findRecipesUsingIngredient(ingredient.id)
    const cuisines = listCuisines()
    const cuisineLabels = Object.fromEntries(
        cuisines.map((c) => [c.key, locale === 'de' ? c.labelDe : c.labelEn]),
    )
    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Stack spacing={3}>
                <Typography variant="h4">{title}</Typography>
                <IngredientForm initialValues={initialValues} />
                <UsedInRecipes
                    rows={usedIn}
                    activeLanguage={locale === 'de' ? 'de' : 'en'}
                    cuisineLabels={cuisineLabels}
                />
            </Stack>
        </Container>
    )
}
