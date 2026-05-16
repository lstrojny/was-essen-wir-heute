'use client'

import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
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
    const [state, formAction, pending] = useActionState(
        updateOwnProfileAction,
        initial,
    )
    return (
        <Paper sx={{ p: 3 }} variant="outlined">
            <Stack spacing={2} component="form" action={formAction}>
                <Typography variant="h6">Profile</Typography>
                {state.error ? (
                    <Alert severity="error">{state.error}</Alert>
                ) : null}
                {state.success ? (
                    <Alert severity="success">{state.success}</Alert>
                ) : null}
                <TextField
                    name="displayName"
                    label="Display name"
                    defaultValue={defaultDisplayName}
                    required
                />
                <TextField
                    name="language"
                    label="Language"
                    select
                    defaultValue={defaultLanguage}
                    required
                >
                    <MenuItem value="de">Deutsch</MenuItem>
                    <MenuItem value="en">English</MenuItem>
                </TextField>
                <Button type="submit" variant="contained" disabled={pending}>
                    {pending ? 'Saving…' : 'Save'}
                </Button>
            </Stack>
        </Paper>
    )
}
