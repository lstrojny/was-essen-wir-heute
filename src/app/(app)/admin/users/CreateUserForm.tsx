'use client'

import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useActionState } from 'react'
import { type AuthFormState, adminCreateUserAction } from '@/auth/actions'

const initial: AuthFormState = {}

export function CreateUserForm() {
    const [state, formAction, pending] = useActionState(
        adminCreateUserAction,
        initial,
    )
    return (
        <Paper sx={{ p: 3 }} variant="outlined">
            <Stack spacing={2} component="form" action={formAction}>
                <Typography variant="h6">Create a user</Typography>
                {state.error ? (
                    <Alert severity="error">{state.error}</Alert>
                ) : null}
                {state.success ? (
                    <Alert severity="success">{state.success}</Alert>
                ) : null}
                <TextField name="email" type="email" label="Email" required />
                <TextField name="displayName" label="Display name" required />
                <TextField
                    name="password"
                    type="password"
                    label="Initial password (≥ 10 chars)"
                    required
                />
                <TextField
                    name="role"
                    label="Role"
                    select
                    defaultValue="user"
                    required
                >
                    <MenuItem value="admin">Admin</MenuItem>
                    <MenuItem value="user">User</MenuItem>
                </TextField>
                <TextField
                    name="language"
                    label="Language"
                    select
                    defaultValue="de"
                    required
                >
                    <MenuItem value="de">Deutsch</MenuItem>
                    <MenuItem value="en">English</MenuItem>
                </TextField>
                <Button type="submit" variant="contained" disabled={pending}>
                    {pending ? 'Creating…' : 'Create user'}
                </Button>
            </Stack>
        </Paper>
    )
}
