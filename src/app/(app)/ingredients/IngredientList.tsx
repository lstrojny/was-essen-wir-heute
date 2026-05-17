'use client'

import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { resolveText } from '@/i18n/translatable'
import type { IngredientListRow } from '@/ingredients/queries'

const ROLE_COLORS: Record<
    'starch' | 'vegetable' | 'protein' | 'none',
    'primary' | 'success' | 'warning' | 'default'
> = {
    starch: 'warning',
    vegetable: 'success',
    protein: 'primary',
    none: 'default',
}

export function IngredientList({
    rows,
    activeLanguage,
}: {
    rows: IngredientListRow[]
    activeLanguage: 'de' | 'en'
}) {
    const t = useTranslations()
    const format = useFormatter()
    return (
        <Stack spacing={1.5}>
            {rows.map((row) => {
                const resolved = resolveText(row.canonical, activeLanguage)
                const display = resolved?.text ?? t('ingredients.unnamed')
                const untranslated = resolved?.isFallback ?? true
                const summaryParts = [
                    t('ingredients.aliasCount', { count: row.aliasCount }),
                    t('ingredients.countUnitCount', {
                        count: row.countUnitCount,
                    }),
                ]
                if (row.density !== null) {
                    summaryParts.push(
                        t('ingredients.density', {
                            value: format.number(row.density, {
                                maximumFractionDigits: 3,
                            }),
                        }),
                    )
                }
                return (
                    <Link
                        key={row.id}
                        href={`/ingredients/${row.id}`}
                        style={{ textDecoration: 'none' }}
                    >
                        <Paper
                            sx={{
                                p: 2,
                                display: 'flex',
                                gap: 2,
                                alignItems: 'center',
                                '&:hover': {
                                    backgroundColor: 'action.hover',
                                },
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
                                    {summaryParts.join(' · ')}
                                </Typography>
                            </Box>
                            {untranslated ? (
                                <Chip
                                    size="small"
                                    label={t('ingredients.untranslated')}
                                    color="warning"
                                    variant="outlined"
                                />
                            ) : null}
                            <Chip
                                size="small"
                                label={t(`ingredientRoles.${row.role}`)}
                                color={ROLE_COLORS[row.role]}
                            />
                        </Paper>
                    </Link>
                )
            })}
        </Stack>
    )
}
