'use client'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useTranslations } from 'next-intl'
import { useActionState, useTransition } from 'react'
import {
    adjustWindowAction,
    generatePlanAction,
    type MealPlanActionState,
} from '@/meal-plan/actions'

export function PlanWindowControls({
    start,
    end,
    recentWindowWeeks,
    hasFillable,
    rowCount,
}: {
    start: string
    end: string
    recentWindowWeeks: number
    hasFillable: boolean
    rowCount: number
}) {
    const t = useTranslations('plan')
    const [state, formAction, pending] = useActionState<
        MealPlanActionState,
        FormData
    >(adjustWindowAction, {})
    const [generatePending, startGenerate] = useTransition()
    const onGenerate = () => {
        startGenerate(async () => {
            await generatePlanAction()
        })
    }
    const generateLabel = hasFillable ? t('generate') : t('regenerate')
    return (
        <Stack spacing={2}>
            <Box
                component="form"
                action={formAction}
                sx={{
                    display: 'grid',
                    gap: 2,
                    gridTemplateColumns: {
                        xs: '1fr',
                        sm: 'repeat(3, 1fr) auto',
                    },
                    alignItems: 'end',
                }}
            >
                <TextField
                    type="date"
                    name="start"
                    label={t('windowStart')}
                    defaultValue={start}
                    slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                    type="date"
                    name="end"
                    label={t('windowEnd')}
                    defaultValue={end}
                    slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                    type="number"
                    name="recentWindowWeeks"
                    label={t('lookbackWeeks')}
                    defaultValue={recentWindowWeeks}
                    slotProps={{
                        htmlInput: { min: 1, max: 52, step: 1 },
                    }}
                />
                <Button
                    type="submit"
                    variant="outlined"
                    disabled={pending}
                >
                    {pending ? t('savingWindow') : t('saveWindow')}
                </Button>
                {state.error ? (
                    <Box
                        sx={{
                            gridColumn: '1 / -1',
                            color: 'error.main',
                            fontSize: '0.875rem',
                        }}
                    >
                        {state.error}
                    </Box>
                ) : null}
            </Box>
            <Box>
                <Button
                    onClick={onGenerate}
                    variant="contained"
                    disabled={generatePending || rowCount === 0}
                >
                    {generatePending ? t('generating') : generateLabel}
                </Button>
            </Box>
        </Stack>
    )
}
