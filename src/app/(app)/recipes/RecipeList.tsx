'use client'

import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { RecipeListRow } from '@/recipes/queries'
import { RatingControl } from './Rating'

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
                const totalTime =
                    row.totalActiveTimeMinutes + row.totalWaitTimeMinutes
                return (
                    <Paper
                        key={row.id}
                        sx={{
                            p: 2,
                            display: 'flex',
                            gap: 2,
                            alignItems: 'center',
                        }}
                        variant="outlined"
                    >
                        <Stack spacing={0.5} sx={{ flexGrow: 1, minWidth: 0 }}>
                            <Link
                                href={`/recipes/${row.id}`}
                                style={{
                                    textDecoration: 'none',
                                    color: 'inherit',
                                }}
                            >
                                <Typography variant="subtitle1" noWrap>
                                    {display}
                                </Typography>
                            </Link>
                            <Typography
                                variant="caption"
                                color="text.secondary"
                            >
                                {t('recipes.timeSummary', {
                                    active: row.totalActiveTimeMinutes,
                                    wait: row.totalWaitTimeMinutes,
                                    total: totalTime,
                                })}
                            </Typography>
                        </Stack>
                        <Stack
                            spacing={0.75}
                            sx={{ alignItems: 'flex-end', flexShrink: 0 }}
                        >
                            <Stack
                                direction="row"
                                spacing={0.5}
                                sx={{
                                    flexWrap: 'wrap',
                                    justifyContent: 'flex-end',
                                    rowGap: 0.5,
                                }}
                            >
                                <Chip
                                    size="small"
                                    label={
                                        cuisineLabels[row.cuisineKey] ??
                                        row.cuisineKey
                                    }
                                />
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
                            </Stack>
                            <RatingControl
                                recipeId={row.id}
                                initialScore={row.myRating}
                                aggregateAverage={row.ratingAverage}
                                aggregateCount={row.ratingCount}
                                size="small"
                            />
                        </Stack>
                    </Paper>
                )
            })}
        </Stack>
    )
}
