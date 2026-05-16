'use client'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { type AuthFormState, setupAction } from '@/auth/actions'

const initial: AuthFormState = {}

export function SetupForm() {
    const t = useTranslations()
    const [state, formAction, pending] = useActionState(setupAction, initial)
    return (
        <Paper sx={{ p: 4, maxWidth: 480, width: '100%' }} elevation={3}>
            <Stack spacing={2} component="form" action={formAction}>
                <Typography variant="h5">{t('setup.title')}</Typography>
                <Typography variant="body2" color="text.secondary">
                    {t('setup.intro')}
                </Typography>
                {state.error ? (
                    <Alert severity="error">{state.error}</Alert>
                ) : null}
                <TextField
                    name="email"
                    type="email"
                    label={t('setup.email')}
                    autoComplete="email"
                    required
                />
                <TextField
                    name="displayName"
                    label={t('setup.displayName')}
                    required
                />
                <TextField
                    name="password"
                    type="password"
                    label={t('setup.password')}
                    autoComplete="new-password"
                    required
                />
                <TextField
                    name="language"
                    label={t('setup.language')}
                    select
                    defaultValue="de"
                    required
                >
                    <MenuItem value="de">{t('languages.de')}</MenuItem>
                    <MenuItem value="en">{t('languages.en')}</MenuItem>
                </TextField>
                <Box>
                    <Button
                        type="submit"
                        variant="contained"
                        disabled={pending}
                        fullWidth
                    >
                        {pending ? t('setup.submitting') : t('setup.submit')}
                    </Button>
                </Box>
            </Stack>
        </Paper>
    )
}
