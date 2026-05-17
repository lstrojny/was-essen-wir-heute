'use client'

import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useTranslations } from 'next-intl'
import { useActionState, useEffect, useState } from 'react'
import { type AuthFormState, updateOwnProfileAction } from '@/auth/actions'
import { type Locale, SUPPORTED_LOCALES } from '@/i18n/locale'

const initial: AuthFormState = {}

export function ProfileForm({
    defaultDisplayName,
    defaultLanguage,
}: {
    defaultDisplayName: string
    defaultLanguage: Locale
}) {
    const t = useTranslations()
    const [state, formAction, pending] = useActionState(
        updateOwnProfileAction,
        initial,
    )
    const [language, setLanguage] = useState(defaultLanguage)
    useEffect(() => {
        setLanguage(defaultLanguage)
    }, [defaultLanguage])
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
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as Locale)}
                    required
                >
                    {SUPPORTED_LOCALES.map((locale) => (
                        <MenuItem key={locale} value={locale}>
                            {t(`languages.${locale}`)}
                        </MenuItem>
                    ))}
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
