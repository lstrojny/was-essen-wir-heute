import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { getTranslations } from 'next-intl/server'
import { requireSetupOrSession } from '@/auth/guards'
import { ChangePasswordForm } from './ChangePasswordForm'
import { ProfileForm } from './ProfileForm'

export default async function SettingsPage() {
    const session = await requireSetupOrSession()
    const t = await getTranslations()
    return (
        <Container maxWidth="sm" sx={{ py: 4 }}>
            <Stack spacing={4}>
                <Typography variant="h4">{t('settings.title')}</Typography>
                <ProfileForm
                    defaultDisplayName={session.user.displayName}
                    defaultLanguage={session.user.language}
                />
                <ChangePasswordForm />
            </Stack>
        </Container>
    )
}
