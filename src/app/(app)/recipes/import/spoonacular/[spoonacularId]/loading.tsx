import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { getTranslations } from 'next-intl/server'

export default async function Loading() {
    const t = await getTranslations()
    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Stack spacing={3} sx={{ alignItems: 'center', mt: 8 }}>
                <CircularProgress />
                <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h6">
                        {t('recipes.import.spoonacular.loadingTitle')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {t('recipes.import.spoonacular.loadingIntro')}
                    </Typography>
                </Box>
            </Stack>
        </Container>
    )
}
