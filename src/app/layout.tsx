import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter'
import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { ThemeRegistry } from './theme/ThemeRegistry'

export const metadata: Metadata = {
    title: 'Was essen wir heute',
    description: 'Family meal planning and recipes',
}

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    const locale = await getLocale()
    const messages = await getMessages()
    return (
        <html lang={locale}>
            <body>
                <NextIntlClientProvider locale={locale} messages={messages}>
                    <AppRouterCacheProvider>
                        <ThemeRegistry>{children}</ThemeRegistry>
                    </AppRouterCacheProvider>
                </NextIntlClientProvider>
            </body>
        </html>
    )
}
