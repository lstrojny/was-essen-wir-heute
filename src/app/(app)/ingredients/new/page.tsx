import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { getTranslations } from 'next-intl/server'
import { requireSetupOrSession } from '@/auth/guards'
import { IngredientForm, type IngredientFormInitial } from '../IngredientForm'

export const dynamic = 'force-dynamic'

const EMPTY: IngredientFormInitial = {
    id: null,
    canonical: {},
    role: 'none',
    density: '',
    notes: '',
    aliases: [],
    countUnits: [],
}

export default async function NewIngredientPage() {
    const session = await requireSetupOrSession()
    const t = await getTranslations()
    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Stack spacing={3}>
                <Typography variant="h4">
                    {t('ingredients.form.newTitle')}
                </Typography>
                <IngredientForm
                    initialValues={EMPTY}
                    activeLanguage={session.user.language}
                />
            </Stack>
        </Container>
    )
}
