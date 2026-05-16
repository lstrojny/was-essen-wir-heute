import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { requireSetupOrSession } from '@/auth/guards'
import { IngredientForm, type IngredientFormInitial } from '../IngredientForm'

const EMPTY: IngredientFormInitial = {
    id: null,
    canonicalDe: '',
    canonicalEn: '',
    role: 'none',
    density: '',
    notes: '',
    aliases: [],
    countUnits: [],
}

export default async function NewIngredientPage() {
    await requireSetupOrSession()
    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Stack spacing={3}>
                <Typography variant="h4">New ingredient</Typography>
                <IngredientForm initialValues={EMPTY} />
            </Stack>
        </Container>
    )
}
