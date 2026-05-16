'use client'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { type AuthFormState, loginAction } from '@/auth/actions'

const initial: AuthFormState = {}

export function LoginForm() {
    const t = useTranslations()
    const [state, formAction, pending] = useActionState(loginAction, initial)
    return (
        <Paper sx={{ p: 4, maxWidth: 400, width: '100%' }} elevation={3}>
            <Stack spacing={2} component="form" action={formAction}>
                <Typography variant="h5">{t('login.title')}</Typography>
                {state.error ? (
                    <Alert severity="error">{state.error}</Alert>
                ) : null}
                <TextField
                    name="email"
                    type="email"
                    label={t('login.email')}
                    autoComplete="email"
                    required
                />
                <TextField
                    name="password"
                    type="password"
                    label={t('login.password')}
                    autoComplete="current-password"
                    required
                />
                <Box>
                    <Button
                        type="submit"
                        variant="contained"
                        disabled={pending}
                        fullWidth
                    >
                        {pending ? t('login.submitting') : t('login.submit')}
                    </Button>
                </Box>
            </Stack>
        </Paper>
    )
}
