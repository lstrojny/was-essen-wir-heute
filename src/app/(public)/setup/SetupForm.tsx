'use client'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useActionState } from 'react'
import { type AuthFormState, setupAction } from '@/auth/actions'

const initial: AuthFormState = {}

export function SetupForm() {
    const [state, formAction, pending] = useActionState(setupAction, initial)
    return (
        <Paper sx={{ p: 4, maxWidth: 480, width: '100%' }} elevation={3}>
            <Stack spacing={2} component="form" action={formAction}>
                <Typography variant="h5">
                    Welcome — set up your admin account
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    This is the first run. The account you create becomes the
                    admin.
                </Typography>
                {state.error ? (
                    <Alert severity="error">{state.error}</Alert>
                ) : null}
                <TextField
                    name="email"
                    type="email"
                    label="Email"
                    autoComplete="email"
                    required
                />
                <TextField name="displayName" label="Display name" required />
                <TextField
                    name="password"
                    type="password"
                    label="Password (≥ 10 chars)"
                    autoComplete="new-password"
                    required
                />
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
                <Box>
                    <Button
                        type="submit"
                        variant="contained"
                        disabled={pending}
                        fullWidth
                    >
                        {pending ? 'Creating…' : 'Create admin'}
                    </Button>
                </Box>
            </Stack>
        </Paper>
    )
}
