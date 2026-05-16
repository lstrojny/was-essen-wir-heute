import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { notFound } from 'next/navigation'
import { requireSetupOrSession } from '@/auth/guards'
import { parseIngredientId } from '@/db/ids'
import { getIngredient } from '@/ingredients/queries'
import { IngredientForm, type IngredientFormInitial } from '../IngredientForm'

export default async function EditIngredientPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    await requireSetupOrSession()
    const { id: idStr } = await params
    const id = parseIngredientId(idStr)
    if (!id) {
        notFound()
    }
    const ingredient = getIngredient(id)
    if (!ingredient) {
        notFound()
    }
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
    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Stack spacing={3}>
                <Typography variant="h4">
                    {ingredient.canonicalEn ??
                        ingredient.canonicalDe ??
                        '(unnamed)'}
                </Typography>
                <IngredientForm initialValues={initialValues} />
            </Stack>
        </Container>
    )
}
