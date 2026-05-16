'use client'

import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { type AuthFormState, changeOwnPasswordAction } from '@/auth/actions'

const initial: AuthFormState = {}

export function ChangePasswordForm() {
    const t = useTranslations()
    const [state, formAction, pending] = useActionState(
        changeOwnPasswordAction,
        initial,
    )
    return (
        <Paper sx={{ p: 3 }} variant="outlined">
            <Stack spacing={2} component="form" action={formAction}>
                <Typography variant="h6">
                    {t('settings.password.title')}
                </Typography>
                {state.error ? (
                    <Alert severity="error">{state.error}</Alert>
                ) : null}
                {state.success ? (
                    <Alert severity="success">{state.success}</Alert>
                ) : null}
                <TextField
                    name="current"
                    type="password"
                    label={t('settings.password.current')}
                    autoComplete="current-password"
                    required
                />
                <TextField
                    name="next"
                    type="password"
                    label={t('settings.password.next')}
                    autoComplete="new-password"
                    required
                />
                <Button type="submit" variant="contained" disabled={pending}>
                    {pending
                        ? t('settings.password.submitting')
                        : t('settings.password.submit')}
                </Button>
            </Stack>
        </Paper>
    )
}
