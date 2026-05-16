import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { asc } from 'drizzle-orm'
import { requireAdmin } from '@/auth/guards'
import { db } from '@/db'
import { users } from '@/db/schema'
import { CreateUserForm } from './CreateUserForm'
import { UserList } from './UserList'

export default async function AdminUsersPage() {
    const admin = await requireAdmin()
    const rows = db
        .select({
            id: users.id,
            email: users.email,
            displayName: users.displayName,
            role: users.role,
            language: users.language,
            createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(asc(users.createdAt))
        .all()
    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Stack spacing={4}>
                <Typography variant="h4">Users</Typography>
                <CreateUserForm />
                <UserList rows={rows} currentUserId={admin.id} />
            </Stack>
        </Container>
    )
}
