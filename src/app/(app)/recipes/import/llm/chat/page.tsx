import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { getTranslations } from 'next-intl/server'
import { requireSetupOrSession } from '@/auth/guards'
import {
    listCentralIngredientsForPicker,
    listCuisines,
    listRecipesForComponentPicker,
} from '@/recipes/queries'
import { LlmChatClient } from './LlmChatClient'

export default async function LlmChatImportPage() {
    const session = await requireSetupOrSession()
    const t = await getTranslations()
    const cuisines = listCuisines()
    const centralIngredients = listCentralIngredientsForPicker()
    const componentCandidates = listRecipesForComponentPicker(null)
    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Stack spacing={3}>
                <Typography variant="h4">
                    {t('recipes.import.chat.title')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    {t('recipes.import.chat.intro')}
                </Typography>
                <LlmChatClient
                    cuisines={cuisines}
                    centralIngredients={centralIngredients}
                    componentCandidates={componentCandidates}
                    activeLanguage={session.user.language}
                />
            </Stack>
        </Container>
    )
}
