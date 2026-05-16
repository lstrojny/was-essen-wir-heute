'use client'

import AppBar from '@mui/material/AppBar'
import Button from '@mui/material/Button'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { logoutAction } from '@/auth/actions'

export function AppNavBar({
    displayName,
    isAdmin,
}: {
    displayName: string
    isAdmin: boolean
}) {
    return (
        <AppBar position="static" color="default" elevation={1}>
            <Toolbar sx={{ gap: 2 }}>
                <Typography
                    variant="h6"
                    component={Link}
                    href="/"
                    sx={{
                        flexGrow: 1,
                        color: 'inherit',
                        textDecoration: 'none',
                    }}
                >
                    Was essen wir heute
                </Typography>
                <Button component={Link} href="/ingredients" size="small">
                    Ingredients
                </Button>
                <Typography variant="body2" color="text.secondary">
                    {displayName}
                </Typography>
                <Button component={Link} href="/settings" size="small">
                    Settings
                </Button>
                {isAdmin ? (
                    <Button component={Link} href="/admin/users" size="small">
                        Users
                    </Button>
                ) : null}
                <form action={logoutAction}>
                    <Button type="submit" size="small">
                        Log out
                    </Button>
                </form>
            </Toolbar>
        </AppBar>
    )
}
