'use client'

import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { type AuthFormState, updateOwnProfileAction } from '@/auth/actions'

const initial: AuthFormState = {}

export function ProfileForm({
    defaultDisplayName,
    defaultLanguage,
}: {
    defaultDisplayName: string
    defaultLanguage: 'de' | 'en'
}) {
    const t = useTranslations()
    const [state, formAction, pending] = useActionState(
        updateOwnProfileAction,
        initial,
    )
    return (
        <Paper sx={{ p: 3 }} variant="outlined">
            <Stack spacing={2} component="form" action={formAction}>
                <Typography variant="h6">
                    {t('settings.profile.title')}
                </Typography>
                {state.error ? (
                    <Alert severity="error">{state.error}</Alert>
                ) : null}
                {state.success ? (
                    <Alert severity="success">{state.success}</Alert>
                ) : null}
                <TextField
                    name="displayName"
                    label={t('settings.profile.displayName')}
                    defaultValue={defaultDisplayName}
                    required
                />
                <TextField
                    name="language"
                    label={t('settings.profile.language')}
                    select
                    defaultValue={defaultLanguage}
                    required
                >
                    <MenuItem value="de">{t('languages.de')}</MenuItem>
                    <MenuItem value="en">{t('languages.en')}</MenuItem>
                </TextField>
                <Button type="submit" variant="contained" disabled={pending}>
                    {pending
                        ? t('settings.profile.saving')
                        : t('settings.profile.save')}
                </Button>
            </Stack>
        </Paper>
    )
}
