'use client'

import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
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
    return (
        <Stack spacing={1.5}>
            {rows.map((row) => {
                const primary =
                    activeLanguage === 'de' ? row.canonicalDe : row.canonicalEn
                const fallback =
                    activeLanguage === 'de' ? row.canonicalEn : row.canonicalDe
                const display = primary ?? fallback ?? '(unnamed)'
                const untranslated = primary === null
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
                                    {row.aliasCount} alias
                                    {row.aliasCount === 1 ? '' : 'es'}
                                    {' · '}
                                    {row.countUnitCount} count unit
                                    {row.countUnitCount === 1 ? '' : 's'}
                                    {row.density !== null
                                        ? ` · density ${row.density} g/ml`
                                        : ''}
                                </Typography>
                            </Box>
                            {untranslated ? (
                                <Chip
                                    size="small"
                                    label="untranslated"
                                    color="warning"
                                    variant="outlined"
                                />
                            ) : null}
                            <Chip
                                size="small"
                                label={row.role}
                                color={ROLE_COLORS[row.role]}
                            />
                        </Paper>
                    </Link>
                )
            })}
        </Stack>
    )
}
