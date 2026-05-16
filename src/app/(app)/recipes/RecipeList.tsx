'use client'

import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { RecipeListRow } from '@/recipes/queries'

export function RecipeList({
    rows,
    activeLanguage,
    cuisineLabels,
}: {
    rows: RecipeListRow[]
    activeLanguage: 'de' | 'en'
    cuisineLabels: Record<string, string>
}) {
    const t = useTranslations()
    return (
        <Stack spacing={1.5}>
            {rows.map((row) => {
                const primary =
                    activeLanguage === 'de' ? row.titleDe : row.titleEn
                const fallback =
                    activeLanguage === 'de' ? row.titleEn : row.titleDe
                const display = primary ?? fallback ?? t('recipes.unnamed')
                const untranslated = primary === null
                const totalTime = row.activeTimeMinutes + row.waitTimeMinutes
                return (
                    <Link
                        key={row.id}
                        href={`/recipes/${row.id}`}
                        style={{ textDecoration: 'none' }}
                    >
                        <Paper
                            sx={{
                                p: 2,
                                display: 'flex',
                                gap: 2,
                                alignItems: 'center',
                                '&:hover': { backgroundColor: 'action.hover' },
                            }}
                            variant="outlined"
                        >
                            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                <Typography variant="subtitle1">
                                    {display}
                                </Typography>
                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                >
                                    {t('recipes.timeSummary', {
                                        active: row.activeTimeMinutes,
                                        wait: row.waitTimeMinutes,
                                        total: totalTime,
                                    })}
                                </Typography>
                            </Box>
                            {row.isCompleteMeal ? (
                                <Chip
                                    size="small"
                                    label={t('recipes.completeMeal')}
                                    color="success"
                                />
                            ) : null}
                            {untranslated ? (
                                <Chip
                                    size="small"
                                    label={t('recipes.untranslated')}
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
                        </Paper>
                    </Link>
                )
            })}
        </Stack>
    )
}
