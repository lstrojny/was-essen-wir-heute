import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { requireSetupOrSession } from '@/auth/guards'
import { AppNavBar } from './AppNavBar'
import { ChatSidebar } from './ChatSidebar'
import { FormBridgeProvider } from './FormBridge'

const SIDEBAR_WIDTH = 360

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
                    <Box
                        component="aside"
                        sx={{
                            width: SIDEBAR_WIDTH,
                            flexShrink: 0,
                            borderLeft: 1,
                            borderColor: 'divider',
                            display: { xs: 'none', md: 'flex' },
                            flexDirection: 'column',
                            position: 'sticky',
                            top: 64,
                            alignSelf: 'flex-start',
                            height: 'calc(100vh - 64px)',
                            bgcolor: 'background.paper',
                        }}
                    >
                        <ChatSidebar />
                    </Box>
                </Box>
            </Box>
        </FormBridgeProvider>
    )
}
