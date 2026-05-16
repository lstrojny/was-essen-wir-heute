'use client'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useActionState } from 'react'
import {
    type AuthFormState,
    adminChangeRoleAction,
    adminDeleteUserAction,
    adminResetPasswordAction,
} from '@/auth/actions'
import type { UserId } from '@/db/ids'

type Row = {
    id: UserId
    email: string
    displayName: string
    role: 'admin' | 'user'
    language: 'de' | 'en'
    createdAt: Date
}

const initial: AuthFormState = {}

function RoleForm({ row, isSelf }: { row: Row; isSelf: boolean }) {
    const [state, formAction, pending] = useActionState(
        adminChangeRoleAction,
        initial,
    )
    return (
        <form action={formAction}>
            <input type="hidden" name="userId" value={row.id} />
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <TextField
                    name="role"
                    select
                    defaultValue={row.role}
                    size="small"
                    disabled={isSelf}
                >
                    <MenuItem value="admin">Admin</MenuItem>
                    <MenuItem value="user">User</MenuItem>
                </TextField>
                <Button type="submit" size="small" disabled={pending || isSelf}>
                    Save role
                </Button>
                {state.error ? (
                    <Typography variant="caption" color="error">
                        {state.error}
                    </Typography>
                ) : null}
                {state.success ? (
                    <Typography variant="caption" color="success.main">
                        {state.success}
                    </Typography>
                ) : null}
            </Stack>
        </form>
    )
}

function ResetPasswordForm({ row }: { row: Row }) {
    const [state, formAction, pending] = useActionState(
        adminResetPasswordAction,
        initial,
    )
    return (
        <form action={formAction}>
            <input type="hidden" name="userId" value={row.id} />
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <TextField
                    name="tempPassword"
                    type="password"
                    size="small"
                    label="Temp password"
                    required
                />
                <Button type="submit" size="small" disabled={pending}>
                    Reset
                </Button>
                {state.error ? (
                    <Typography variant="caption" color="error">
                        {state.error}
                    </Typography>
                ) : null}
                {state.success ? (
                    <Typography variant="caption" color="success.main">
                        {state.success}
                    </Typography>
                ) : null}
            </Stack>
        </form>
    )
}

function DeleteForm({ row, isSelf }: { row: Row; isSelf: boolean }) {
    const [state, formAction, pending] = useActionState(
        adminDeleteUserAction,
        initial,
    )
    return (
        <form action={formAction}>
            <input type="hidden" name="userId" value={row.id} />
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Button
                    type="submit"
                    size="small"
                    color="error"
                    disabled={pending || isSelf}
                >
                    Delete
                </Button>
                {state.error ? (
                    <Typography variant="caption" color="error">
                        {state.error}
                    </Typography>
                ) : null}
            </Stack>
        </form>
    )
}

export function UserList({
    rows,
    currentUserId,
}: {
    rows: Row[]
    currentUserId: UserId
}) {
    if (rows.length === 0) {
        return <Alert severity="info">No users yet.</Alert>
    }
    return (
        <Stack spacing={2}>
            {rows.map((row) => {
                const isSelf = row.id === currentUserId
                return (
                    <Paper key={row.id} sx={{ p: 2 }} variant="outlined">
                        <Stack spacing={1.5}>
                            <Stack
                                direction="row"
                                spacing={1}
                                sx={{ alignItems: 'center' }}
                            >
                                <Typography
                                    variant="subtitle1"
                                    sx={{ flexGrow: 1 }}
                                >
                                    {row.displayName}{' '}
                                    <Typography
                                        component="span"
                                        variant="body2"
                                        color="text.secondary"
                                    >
                                        — {row.email}
                                    </Typography>
                                </Typography>
                                <Chip
                                    label={row.language.toUpperCase()}
                                    size="small"
                                />
                                <Chip
                                    label={row.role}
                                    size="small"
                                    color={
                                        row.role === 'admin'
                                            ? 'primary'
                                            : 'default'
                                    }
                                />
                                {isSelf ? (
                                    <Chip
                                        label="you"
                                        size="small"
                                        variant="outlined"
                                    />
                                ) : null}
                            </Stack>
                            <Box
                                sx={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: 2,
                                }}
                            >
                                <RoleForm row={row} isSelf={isSelf} />
                                <ResetPasswordForm row={row} />
                                <DeleteForm row={row} isSelf={isSelf} />
                            </Box>
                        </Stack>
                    </Paper>
                )
            })}
        </Stack>
    )
}
