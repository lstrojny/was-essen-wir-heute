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
import { useTranslations } from 'next-intl'
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
    const t = useTranslations()
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
                    <MenuItem value="admin">{t('roles.admin')}</MenuItem>
                    <MenuItem value="user">{t('roles.user')}</MenuItem>
                </TextField>
                <Button type="submit" size="small" disabled={pending || isSelf}>
                    {t('admin.users.row.saveRole')}
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
    const t = useTranslations()
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
                    label={t('admin.users.row.tempPassword')}
                    required
                />
                <Button type="submit" size="small" disabled={pending}>
                    {t('admin.users.row.reset')}
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
    const t = useTranslations()
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
                    {t('admin.users.row.delete')}
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
    const t = useTranslations()
    if (rows.length === 0) {
        return <Alert severity="info">{t('admin.users.empty')}</Alert>
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
                                    label={t(`roles.${row.role}`)}
                                    size="small"
                                    color={
                                        row.role === 'admin'
                                            ? 'primary'
                                            : 'default'
                                    }
                                />
                                {isSelf ? (
                                    <Chip
                                        label={t('admin.users.you')}
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
