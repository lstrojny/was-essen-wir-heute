'use client'

import AppBar from '@mui/material/AppBar'
import Button from '@mui/material/Button'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { logoutAction } from '@/auth/actions'

export function AppNavBar({
    displayName,
    isAdmin,
}: {
    displayName: string
    isAdmin: boolean
}) {
    const t = useTranslations()
    return (
        <AppBar
            position="sticky"
            color="default"
            elevation={1}
            sx={{ top: 0, zIndex: (theme) => theme.zIndex.appBar }}
        >
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
                    {t('app.title')}
                </Typography>
                <Button component={Link} href="/plan" size="small">
                    {t('nav.plan')}
                </Button>
                <Button component={Link} href="/recipes" size="small">
                    {t('nav.recipes')}
                </Button>
                <Button component={Link} href="/ingredients" size="small">
                    {t('nav.ingredients')}
                </Button>
                <Typography variant="body2" color="text.secondary">
                    {displayName}
                </Typography>
                <Button component={Link} href="/settings" size="small">
                    {t('nav.settings')}
                </Button>
                {isAdmin ? (
                    <Button component={Link} href="/admin/users" size="small">
                        {t('nav.users')}
                    </Button>
                ) : null}
                <form action={logoutAction}>
                    <Button type="submit" size="small">
                        {t('nav.logout')}
                    </Button>
                </form>
            </Toolbar>
        </AppBar>
    )
}
