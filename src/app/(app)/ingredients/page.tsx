import AddIcon from '@mui/icons-material/Add'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { requireSetupOrSession } from '@/auth/guards'
import { listIngredients } from '@/ingredients/queries'
import { IngredientList } from './IngredientList'
import { SearchBox } from './SearchBox'

export default async function IngredientsPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string }>
}) {
    const session = await requireSetupOrSession()
    const t = await getTranslations()
    const params = await searchParams
    const q = (params.q ?? '').trim()
    const rows = listIngredients(q)
    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Stack spacing={3}>
                <Box
                    sx={{
                        display: 'flex',
                        gap: 2,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                    }}
                >
                    <Typography variant="h4" sx={{ flexGrow: 1 }}>
                        {t('ingredients.title')}
                    </Typography>
                    <Link
                        href="/ingredients/new"
                        style={{ textDecoration: 'none' }}
                    >
                        <Button variant="contained" startIcon={<AddIcon />}>
                            {t('ingredients.new')}
                        </Button>
                    </Link>
                </Box>
                <SearchBox defaultValue={q} />
                {rows.length === 0 ? (
                    <Paper sx={{ p: 3 }} variant="outlined">
                        <Typography color="text.secondary">
                            {q
                                ? t('ingredients.emptySearch')
                                : t('ingredients.emptyAll')}
                        </Typography>
                    </Paper>
                ) : (
                    <IngredientList
                        rows={rows}
                        activeLanguage={session.user.language}
                    />
                )}
            </Stack>
        </Container>
    )
}
