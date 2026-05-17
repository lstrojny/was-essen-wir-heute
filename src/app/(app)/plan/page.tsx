import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { getTranslations } from 'next-intl/server'
import { requireSetupOrSession } from '@/auth/guards'
import { listCuisines } from '@/recipes/queries'
import { listCompleteMealsForPicker, loadActiveWindowRows } from '@/meal-plan/queries'
import { PlanWindowControls } from './PlanWindowControls'
import { PlanRowList } from './PlanRowList'

export default async function PlanPage() {
    const session = await requireSetupOrSession()
    const t = await getTranslations()
    const { settings, rows } = loadActiveWindowRows()
    const cuisines = listCuisines(session.user.language)
    const cuisineLabels = Object.fromEntries(
        cuisines.map((c) => [c.key, c.label]),
    )
    const pickerEntries = listCompleteMealsForPicker()
    const hasFillable = rows.some((r) => r.state === 'empty')
    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Stack spacing={3}>
                <Box>
                    <Typography variant="h4">{t('plan.title')}</Typography>
                    <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5 }}
                    >
                        {t('plan.subtitle')}
                    </Typography>
                </Box>
                <PlanWindowControls
                    start={settings.activeWindowStart}
                    end={settings.activeWindowEnd}
                    recentWindowWeeks={settings.recentWindowWeeks}
                    hasFillable={hasFillable}
                    rowCount={rows.length}
                />
                {pickerEntries.length === 0 ? (
                    <Paper variant="outlined" sx={{ p: 3 }}>
                        <Typography color="text.secondary">
                            {t('plan.picker.noRecipes')}
                        </Typography>
                    </Paper>
                ) : (
                    <PlanRowList
                        rows={rows}
                        activeLanguage={session.user.language}
                        cuisineLabels={cuisineLabels}
                        pickerEntries={pickerEntries}
                    />
                )}
            </Stack>
        </Container>
    )
}
