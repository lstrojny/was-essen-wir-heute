import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { getTranslations } from 'next-intl/server'
import { requireSetupOrSession } from '@/auth/guards'
import { SpoonacularImportClient } from './SpoonacularImportClient'

export default async function SpoonacularImportPage() {
    await requireSetupOrSession()
    const t = await getTranslations()
    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Stack spacing={3}>
                <Typography variant="h4">
                    {t('recipes.import.spoonacular.title')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    {t('recipes.import.spoonacular.intro')}
                </Typography>
                <SpoonacularImportClient />
            </Stack>
        </Container>
    )
}
