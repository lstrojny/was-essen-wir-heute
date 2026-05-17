'use client'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import {
    replaceSlotAction,
    scorePickerCandidatesAction,
} from '@/meal-plan/actions'
import type { RecipePickerEntry } from '@/meal-plan/queries'
import { resolveText } from '@/i18n/translatable'

export function PlanReplaceDialog({
    open,
    date,
    onClose,
    entries,
    activeLanguage,
    cuisineLabels,
}: {
    open: boolean
    date: string
    onClose: () => void
    entries: RecipePickerEntry[]
    activeLanguage: 'de' | 'en'
    cuisineLabels: Record<string, string>
}) {
    const t = useTranslations('plan.picker')
    const [scores, setScores] = useState<
        Map<string, { score: number; lastEaten: string | null }>
    >(new Map())
    const [scoring, setScoring] = useState(false)
    const [search, setSearch] = useState('')
    const [savingId, setSavingId] = useState<string | null>(null)
    const [_, startSave] = useTransition()

    useEffect(() => {
        if (!open || !date) return
        setScoring(true)
        scorePickerCandidatesAction(date)
            .then((rows) => {
                const map = new Map<
                    string,
                    { score: number; lastEaten: string | null }
                >()
                for (const r of rows) {
                    map.set(r.recipeId, {
                        score: r.score,
                        lastEaten: r.lastEaten,
                    })
                }
                setScores(map)
            })
            .finally(() => setScoring(false))
    }, [open, date])

    const sortedEntries = useMemo(() => {
        const filter = search.trim().toLocaleLowerCase()
        const filtered = filter
            ? entries.filter((entry) => {
                  const display =
                      resolveText(entry.title, activeLanguage)?.text ?? ''
                  return display.toLocaleLowerCase().includes(filter)
              })
            : entries
        return [...filtered].sort((a, b) => {
            const aScore = scores.get(a.id)?.score ?? Number.NEGATIVE_INFINITY
            const bScore = scores.get(b.id)?.score ?? Number.NEGATIVE_INFINITY
            if (aScore !== bScore) return bScore - aScore
            const aTitle = resolveText(a.title, activeLanguage)?.text ?? ''
            const bTitle = resolveText(b.title, activeLanguage)?.text ?? ''
            return aTitle.localeCompare(bTitle)
        })
    }, [entries, scores, search, activeLanguage])

    const onSelect = (recipeId: string) => {
        if (!date) return
        setSavingId(recipeId)
        const formData = new FormData()
        formData.set('date', date)
        formData.set('recipeId', recipeId)
        startSave(async () => {
            await replaceSlotAction({}, formData)
            setSavingId(null)
            onClose()
        })
    }

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>{t('title', { date })}</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={1.5}>
                    <TextField
                        size="small"
                        autoFocus
                        placeholder={t('search')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    {scoring ? (
                        <Box
                            sx={{
                                display: 'flex',
                                justifyContent: 'center',
                                py: 2,
                            }}
                        >
                            <CircularProgress size={24} />
                        </Box>
                    ) : sortedEntries.length === 0 ? (
                        <Typography color="text.secondary">
                            {t('empty')}
                        </Typography>
                    ) : (
                        <List dense disablePadding>
                            {sortedEntries.map((entry) => {
                                const display =
                                    resolveText(entry.title, activeLanguage)
                                        ?.text ?? '(?)'
                                const scoreEntry = scores.get(entry.id)
                                return (
                                    <ListItem key={entry.id} disablePadding>
                                        <ListItemButton
                                            disabled={savingId === entry.id}
                                            onClick={() => onSelect(entry.id)}
                                        >
                                            <ListItemText
                                                primary={display}
                                                secondary={
                                                    <Stack
                                                        direction="row"
                                                        spacing={0.75}
                                                        sx={{
                                                            flexWrap: 'wrap',
                                                        }}
                                                    >
                                                        <Chip
                                                            size="small"
                                                            label={
                                                                cuisineLabels[
                                                                    entry
                                                                        .cuisineKey
                                                                ] ??
                                                                entry.cuisineKey
                                                            }
                                                        />
                                                        {scoreEntry ? (
                                                            <Chip
                                                                size="small"
                                                                variant="outlined"
                                                                label={t(
                                                                    'score',
                                                                    {
                                                                        score: scoreEntry.score,
                                                                    },
                                                                )}
                                                            />
                                                        ) : null}
                                                        {scoreEntry?.lastEaten ? (
                                                            <Chip
                                                                size="small"
                                                                variant="outlined"
                                                                label={t(
                                                                    'lastEatenOn',
                                                                    {
                                                                        date: scoreEntry.lastEaten,
                                                                    },
                                                                )}
                                                            />
                                                        ) : (
                                                            <Chip
                                                                size="small"
                                                                variant="outlined"
                                                                label={t(
                                                                    'lastEatenNever',
                                                                )}
                                                            />
                                                        )}
                                                    </Stack>
                                                }
                                            />
                                        </ListItemButton>
                                    </ListItem>
                                )
                            })}
                        </List>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t('cancel')}</Button>
            </DialogActions>
        </Dialog>
    )
}
