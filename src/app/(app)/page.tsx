import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { requireSetupOrSession } from '@/auth/guards'

export default async function Home() {
    const session = await requireSetupOrSession()
    return (
        <Container maxWidth="md">
            <Box sx={{ py: 8 }}>
                <Typography variant="h2" component="h1" gutterBottom>
                    Was essen wir heute
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Signed in as {session.user.displayName} (
                    {session.user.email}).
                </Typography>
            </Box>
        </Container>
    )
}
