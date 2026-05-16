import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { requireSetupOrSession } from '@/auth/guards'
import { AppNavBar } from './AppNavBar'

export default async function AppLayout({ children }: { children: ReactNode }) {
    const session = await requireSetupOrSession()
    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                minHeight: '100vh',
            }}
        >
            <AppNavBar
                displayName={session.user.displayName}
                isAdmin={session.user.role === 'admin'}
            />
            <Box component="main" sx={{ flexGrow: 1 }}>
                {children}
            </Box>
        </Box>
    )
}
