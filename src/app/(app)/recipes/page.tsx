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
import { parseCuisineKey } from '@/db/ids'
import { listCuisines, listRecipes } from '@/recipes/queries'
import { RecipeList } from './RecipeList'
import { RecipeListFilters } from './RecipeListFilters'

export default async function RecipesPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string; cuisine?: string; complete?: string }>
}) {
    const session = await requireSetupOrSession()
    const t = await getTranslations()
    const params = await searchParams
    const q = (params.q ?? '').trim()
    const cuisineKey = params.cuisine ? parseCuisineKey(params.cuisine) : null
    const completeOnly = params.complete === '1'
    const cuisines = listCuisines()
    const rows = listRecipes(q, cuisineKey, completeOnly, session.user.id)
    const cuisineLabels = Object.fromEntries(
        cuisines.map((c) => [
            c.key,
            session.user.language === 'de' ? c.labelDe : c.labelEn,
        ]),
    )
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
                        {t('recipes.title')}
                    </Typography>
                    <Link
                        href="/recipes/import/spoonacular"
                        style={{ textDecoration: 'none' }}
                    >
                        <Button variant="outlined">
                            {t('recipes.importSpoonacular')}
                        </Button>
                    </Link>
                    <Link
                        href="/recipes/import/llm"
                        style={{ textDecoration: 'none' }}
                    >
                        <Button variant="outlined">
                            {t('recipes.importLlm')}
                        </Button>
                    </Link>
                    <Link
                        href="/recipes/import/llm/chat"
                        style={{ textDecoration: 'none' }}
                    >
                        <Button variant="outlined">
                            {t('recipes.importChat')}
                        </Button>
                    </Link>
                    <Link
                        href="/recipes/new"
                        style={{ textDecoration: 'none' }}
                    >
                        <Button variant="contained" startIcon={<AddIcon />}>
                            {t('recipes.new')}
                        </Button>
                    </Link>
                </Box>
                <RecipeListFilters
                    defaultSearch={q}
                    defaultCuisineKey={cuisineKey}
                    defaultCompleteOnly={completeOnly}
                    cuisines={cuisines}
                    activeLanguage={session.user.language}
                />
                {rows.length === 0 ? (
                    <Paper sx={{ p: 3 }} variant="outlined">
                        <Typography color="text.secondary">
                            {q || cuisineKey
                                ? t('recipes.emptySearch')
                                : t('recipes.emptyAll')}
                        </Typography>
                    </Paper>
                ) : (
                    <RecipeList
                        rows={rows}
                        activeLanguage={session.user.language}
                        cuisineLabels={cuisineLabels}
                    />
                )}
            </Stack>
        </Container>
    )
}
