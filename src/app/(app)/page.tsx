import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { getTranslations } from 'next-intl/server'
import { requireSetupOrSession } from '@/auth/guards'

export default async function Home() {
    const session = await requireSetupOrSession()
    const t = await getTranslations()
    return (
        <Container maxWidth="md">
            <Box sx={{ py: 8 }}>
                <Typography variant="h2" component="h1" gutterBottom>
                    {t('app.title')}
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    {t('home.signedInAs', {
                        name: session.user.displayName,
                        email: session.user.email,
                    })}
                </Typography>
            </Box>
        </Container>
    )
}
