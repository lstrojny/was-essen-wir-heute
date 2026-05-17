import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { requireSetupOrSession } from '@/auth/guards'
import { AppNavBar } from './AppNavBar'
import { ChatPane } from './ChatPane'
import { FormBridgeProvider } from './FormBridge'

export default async function AppLayout({ children }: { children: ReactNode }) {
    const session = await requireSetupOrSession()
    return (
        <FormBridgeProvider>
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
                <Box
                    sx={{
                        flexGrow: 1,
                        display: 'flex',
                        minHeight: 0,
                    }}
                >
                    <Box
                        component="main"
                        sx={{
                            flexGrow: 1,
                            minWidth: 0,
                        }}
                    >
                        {children}
                    </Box>
                    <ChatPane />
                </Box>
            </Box>
        </FormBridgeProvider>
    )
}
