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
import { type AuthFormState, adminCreateUserAction } from '@/auth/actions'

const initial: AuthFormState = {}

export function CreateUserForm() {
    const t = useTranslations()
    const [state, formAction, pending] = useActionState(
        adminCreateUserAction,
        initial,
    )
    return (
        <Paper sx={{ p: 3 }} variant="outlined">
            <Stack spacing={2} component="form" action={formAction}>
                <Typography variant="h6">
                    {t('admin.users.create.title')}
                </Typography>
                {state.error ? (
                    <Alert severity="error">{state.error}</Alert>
                ) : null}
                {state.success ? (
                    <Alert severity="success">{state.success}</Alert>
                ) : null}
                <TextField
                    name="email"
                    type="email"
                    label={t('admin.users.create.email')}
                    required
                />
                <TextField
                    name="displayName"
                    label={t('admin.users.create.displayName')}
                    required
                />
                <TextField
                    name="password"
                    type="password"
                    label={t('admin.users.create.password')}
                    required
                />
                <TextField
                    name="role"
                    label={t('admin.users.create.role')}
                    select
                    defaultValue="user"
                    required
                >
                    <MenuItem value="admin">{t('roles.admin')}</MenuItem>
                    <MenuItem value="user">{t('roles.user')}</MenuItem>
                </TextField>
                <TextField
                    name="language"
                    label={t('admin.users.create.language')}
                    select
                    defaultValue="de"
                    required
                >
                    <MenuItem value="de">{t('languages.de')}</MenuItem>
                    <MenuItem value="en">{t('languages.en')}</MenuItem>
                </TextField>
                <Button type="submit" variant="contained" disabled={pending}>
                    {pending
                        ? t('admin.users.create.submitting')
                        : t('admin.users.create.submit')}
                </Button>
            </Stack>
        </Paper>
    )
}
