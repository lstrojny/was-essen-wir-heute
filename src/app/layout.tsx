import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter'
import type { Metadata } from 'next'
import { ThemeRegistry } from './theme/ThemeRegistry'

export const metadata: Metadata = {
    title: 'Was essen wir heute',
    description: 'Family meal planning and recipes',
}

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    return (
        <html lang="en">
            <body>
                <AppRouterCacheProvider>
                    <ThemeRegistry>{children}</ThemeRegistry>
                </AppRouterCacheProvider>
            </body>
        </html>
    )
}
