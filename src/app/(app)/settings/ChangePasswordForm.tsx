'use client'

import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useActionState } from 'react'
import { type AuthFormState, changeOwnPasswordAction } from '@/auth/actions'

const initial: AuthFormState = {}

export function ChangePasswordForm() {
    const [state, formAction, pending] = useActionState(
        changeOwnPasswordAction,
        initial,
    )
    return (
        <Paper sx={{ p: 3 }} variant="outlined">
            <Stack spacing={2} component="form" action={formAction}>
                <Typography variant="h6">Change password</Typography>
                {state.error ? (
                    <Alert severity="error">{state.error}</Alert>
                ) : null}
                {state.success ? (
                    <Alert severity="success">{state.success}</Alert>
                ) : null}
                <TextField
                    name="current"
                    type="password"
                    label="Current password"
                    autoComplete="current-password"
                    required
                />
                <TextField
                    name="next"
                    type="password"
                    label="New password (≥ 10 chars)"
                    autoComplete="new-password"
                    required
                />
                <Button type="submit" variant="contained" disabled={pending}>
                    {pending ? 'Saving…' : 'Change password'}
                </Button>
            </Stack>
        </Paper>
    )
}
