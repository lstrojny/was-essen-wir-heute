'use client'

import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { resolveText } from '@/i18n/translatable'
import type { RecipeUsingIngredient } from '@/recipes/queries'

export function UsedInRecipes({
    rows,
    activeLanguage,
    cuisineLabels,
}: {
    rows: RecipeUsingIngredient[]
    activeLanguage: 'de' | 'en'
    cuisineLabels: Record<string, string>
}) {
    const t = useTranslations()
    return (
        <Paper sx={{ p: 3 }} variant="outlined">
            <Stack spacing={2}>
                <Typography variant="h6">
                    {t('ingredients.usedIn.title', { count: rows.length })}
                </Typography>
                {rows.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                        {t('ingredients.usedIn.empty')}
                    </Typography>
                ) : (
                    <Stack spacing={1}>
                        {rows.map((row) => {
                            const resolved = resolveText(
                                row.title,
                                activeLanguage,
                            )
                            const display =
                                resolved?.text ?? t('recipes.unnamed')
                            const untranslated = resolved?.isFallback ?? true
                            return (
                                <Link
                                    key={row.id}
                                    href={`/recipes/${row.id}`}
                                    style={{ textDecoration: 'none' }}
                                >
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            gap: 1,
                                            alignItems: 'center',
                                            py: 0.5,
                                            '&:hover': {
                                                backgroundColor: 'action.hover',
                                            },
                                        }}
                                    >
                                        <Typography
                                            variant="body2"
                                            sx={{ flexGrow: 1 }}
                                        >
                                            {display}
                                        </Typography>
                                        {untranslated ? (
                                            <Chip
                                                size="small"
                                                label={t(
                                                    'recipes.untranslated',
                                                )}
                                                color="warning"
                                                variant="outlined"
                                            />
                                        ) : null}
                                        <Chip
                                            size="small"
                                            label={
                                                cuisineLabels[row.cuisineKey] ??
                                                row.cuisineKey
                                            }
                                        />
                                    </Box>
                                </Link>
                            )
                        })}
                    </Stack>
                )}
            </Stack>
        </Paper>
    )
}
