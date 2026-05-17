'use client'

import ClearIcon from '@mui/icons-material/Clear'
import PushPinIcon from '@mui/icons-material/PushPin'
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined'
import RestoreIcon from '@mui/icons-material/Restore'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import type { MealPlanEntryId } from '@/db/ids'
import {
    clearSlotAction,
    pinSlotAction,
    restoreSlotAction,
    unpinOrUneditSlotAction,
} from '@/meal-plan/actions'
import type { PlanRowSummary, RecipePickerEntry } from '@/meal-plan/queries'
import { resolveText } from '@/i18n/translatable'
import { PlanReplaceDialog } from './PlanReplaceDialog'

type SlotState = PlanRowSummary['state']

export function PlanRowList({
    rows,
    activeLanguage,
    cuisineLabels,
    pickerEntries,
}: {
    rows: PlanRowSummary[]
    activeLanguage: 'de' | 'en'
    cuisineLabels: Record<string, string>
    pickerEntries: RecipePickerEntry[]
}) {
    const [openDate, setOpenDate] = useState<string | null>(null)
    return (
        <Stack spacing={1.25}>
            {rows.map((row) => (
                <PlanRow
                    key={row.date}
                    row={row}
                    activeLanguage={activeLanguage}
                    cuisineLabels={cuisineLabels}
                    onOpenPicker={() => setOpenDate(row.date)}
                />
            ))}
            <PlanReplaceDialog
                open={openDate !== null}
                date={openDate ?? ''}
                onClose={() => setOpenDate(null)}
                entries={pickerEntries}
                activeLanguage={activeLanguage}
                cuisineLabels={cuisineLabels}
            />
        </Stack>
    )
}

function PlanRow({
    row,
    activeLanguage,
    cuisineLabels,
    onOpenPicker,
}: {
    row: PlanRowSummary
    activeLanguage: 'de' | 'en'
    cuisineLabels: Record<string, string>
    onOpenPicker: () => void
}) {
    const t = useTranslations('plan')
    const stateMarker = stateChip(row.state, t)
    const resolved = resolveText(row.title, activeLanguage)
    const title = resolved?.text
    const untranslated = title ? (resolved?.isFallback ?? false) : false
    const weekday = weekdayLabel(row.date, t)
    return (
        <Paper
            variant="outlined"
            sx={{
                p: 2,
                display: 'flex',
                gap: 2,
                alignItems: 'center',
                flexWrap: 'wrap',
            }}
        >
            <Box sx={{ minWidth: 96 }}>
                <Typography variant="caption" color="text.secondary">
                    {weekday}
                </Typography>
                <Typography variant="body2">{formatDate(row.date)}</Typography>
            </Box>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                {row.state === 'empty' ? (
                    <Typography
                        variant="subtitle1"
                        color="text.secondary"
                        sx={{ cursor: 'pointer' }}
                        onClick={onOpenPicker}
                    >
                        {t('emptySlot')}
                    </Typography>
                ) : row.state === 'cleared' ? (
                    <Typography variant="subtitle1" color="text.secondary">
                        {t('clearedSlot')}
                    </Typography>
                ) : (
                    <Stack spacing={0.25}>
                        <Link
                            href={row.recipeId ? `/recipes/${row.recipeId}` : '#'}
                            style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                            <Typography variant="subtitle1" noWrap>
                                {title ?? t('noSuggestion')}
                            </Typography>
                        </Link>
                        <Stack
                            direction="row"
                            spacing={0.5}
                            sx={{ flexWrap: 'wrap' }}
                        >
                            {row.cuisineKey ? (
                                <Chip
                                    size="small"
                                    label={
                                        cuisineLabels[row.cuisineKey] ??
                                        row.cuisineKey
                                    }
                                />
                            ) : null}
                            {untranslated ? (
                                <Chip
                                    size="small"
                                    label={t('stateMarker.suggested')}
                                    color="warning"
                                    variant="outlined"
                                />
                            ) : null}
                        </Stack>
                    </Stack>
                )}
            </Box>
            <Stack
                direction="row"
                spacing={0.5}
                sx={{ alignItems: 'center' }}
            >
                {stateMarker ? (
                    <Chip
                        size="small"
                        label={stateMarker.label}
                        color={stateMarker.color}
                        variant={stateMarker.variant}
                    />
                ) : null}
                <RowActions row={row} onOpenPicker={onOpenPicker} />
            </Stack>
        </Paper>
    )
}


function RowActions({
    row,
    onOpenPicker,
}: {
    row: PlanRowSummary
    onOpenPicker: () => void
}) {
    const t = useTranslations('plan.actions')
    return (
        <Stack direction="row" spacing={0.5}>
            {row.state === 'empty' || row.state === 'cleared' ? null : (
                <Tooltip title={t('replace')}>
                    <IconButton size="small" onClick={onOpenPicker}>
                        <SwapHorizIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            )}
            {row.state === 'suggested' ? (
                <SubmitIconForm
                    action={pinSlotAction}
                    entryId={row.entryId}
                    title={t('pin')}
                    icon={<PushPinOutlinedIcon fontSize="small" />}
                />
            ) : null}
            {row.state === 'pinned' ? (
                <SubmitIconForm
                    action={unpinOrUneditSlotAction}
                    entryId={row.entryId}
                    title={t('unpin')}
                    icon={<PushPinIcon fontSize="small" />}
                />
            ) : null}
            {row.state === 'edited' ? (
                <SubmitIconForm
                    action={unpinOrUneditSlotAction}
                    entryId={row.entryId}
                    title={t('unedit')}
                    icon={<RestoreIcon fontSize="small" />}
                />
            ) : null}
            {row.state === 'cleared' ? (
                <SubmitIconForm
                    action={restoreSlotAction}
                    entryId={row.entryId}
                    title={t('restore')}
                    icon={<RestoreIcon fontSize="small" />}
                />
            ) : (
                <SubmitIconForm
                    action={clearSlotAction}
                    entryId={row.entryId}
                    date={row.date}
                    title={t('clear')}
                    icon={<ClearIcon fontSize="small" />}
                    disabled={row.state === 'empty'}
                />
            )}
        </Stack>
    )
}

function SubmitIconForm({
    action,
    entryId,
    date,
    title,
    icon,
    disabled,
}: {
    action: (
        prev: { error?: string; success?: string },
        data: FormData,
    ) => Promise<{ error?: string; success?: string }>
    entryId: MealPlanEntryId | null
    date?: string
    title: string
    icon: React.ReactNode
    disabled?: boolean
}) {
    const [pending, startTransition] = useTransition()
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault()
                const formData = new FormData(e.currentTarget)
                startTransition(async () => {
                    await action({}, formData)
                })
            }}
        >
            {entryId ? (
                <input type="hidden" name="entryId" value={entryId} />
            ) : null}
            {date ? <input type="hidden" name="date" value={date} /> : null}
            <Tooltip title={title}>
                <span>
                    <IconButton
                        type="submit"
                        size="small"
                        disabled={pending || disabled}
                        aria-label={title}
                    >
                        {icon}
                    </IconButton>
                </span>
            </Tooltip>
        </form>
    )
}

function stateChip(
    state: SlotState,
    t: (k: string) => string,
): {
    label: string
    color: 'default' | 'primary' | 'warning' | 'success'
    variant: 'filled' | 'outlined'
} | null {
    switch (state) {
        case 'suggested':
            return {
                label: t('stateMarker.suggested'),
                color: 'default',
                variant: 'outlined',
            }
        case 'edited':
            return {
                label: t('stateMarker.edited'),
                color: 'primary',
                variant: 'outlined',
            }
        case 'pinned':
            return {
                label: t('stateMarker.pinned'),
                color: 'primary',
                variant: 'filled',
            }
        case 'cleared':
            return {
                label: t('stateMarker.cleared'),
                color: 'default',
                variant: 'outlined',
            }
        default:
            return null
    }
}

function weekdayLabel(date: string, t: (k: string) => string): string {
    const [y, m, d] = date.split('-').map(Number)
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    return t(`weekday.long.${dow}`)
}

function formatDate(date: string): string {
    return date
}
