import type { ReactNode } from 'react'
import { requireAdmin } from '@/auth/guards'

export default async function AdminLayout({
    children,
}: {
    children: ReactNode
}) {
    await requireAdmin()
    return <>{children}</>
}
