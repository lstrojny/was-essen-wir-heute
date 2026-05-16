import Box from '@mui/material/Box'
import type { ReactNode } from 'react'

export default function PublicLayout({ children }: { children: ReactNode }) {
    return (
        <Box
            sx={{
                display: 'flex',
                minHeight: '100vh',
                alignItems: 'center',
                justifyContent: 'center',
                p: 2,
            }}
        >
            {children}
        </Box>
    )
}
