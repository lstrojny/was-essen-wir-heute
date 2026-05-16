'use client'

import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useFormatter, useTranslations } from 'next-intl'
import { flattenSections, type RolledUpRecipe } from '@/recipes/rollup'
import { isKnownUnit } from '@/recipes/units'

function pickTitle(
    r: RolledUpRecipe,
    activeLanguage: 'de' | 'en',
    fallback: string,
): string {
    const primary = activeLanguage === 'de' ? r.titleDe : r.titleEn
    const other = activeLanguage === 'de' ? r.titleEn : r.titleDe
    return primary ?? other ?? fallback
}

export function ComposedView({
    recipe,
    activeLanguage,
    formServings,
}: {
    recipe: RolledUpRecipe
    activeLanguage: 'de' | 'en'
    formServings: number
}) {
    const t = useTranslations()
    const format = useFormatter()
    const sections = flattenSections(recipe)
    const isComposite = recipe.components.length > 0
    const showSectionTitles = isComposite
    return (
        <Paper sx={{ p: 3 }} variant="outlined">
            <Stack spacing={2}>
                <Typography variant="h6">
                    {t('recipes.composed.title')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    {t('recipes.timeSummary', {
                        active: recipe.totalActiveTimeMinutes,
                        wait: recipe.totalWaitTimeMinutes,
                        total:
                            recipe.totalActiveTimeMinutes +
                            recipe.totalWaitTimeMinutes,
                    })}
                </Typography>

                <Divider />
                <Typography variant="subtitle1">
                    {t('recipes.composed.ingredients', {
                        servings: formServings,
                    })}
                </Typography>
                {sections.every((s) => s.ownIngredients.length === 0) ? (
                    <Typography variant="body2" color="text.secondary">
                        {t('recipes.composed.noIngredients')}
                    </Typography>
                ) : null}
                {sections.map((section) =>
                    section.ownIngredients.length === 0 ? null : (
                        <Box key={`ing-${section.id}`}>
                            {showSectionTitles ? (
                                <Typography
                                    variant="overline"
                                    color="text.secondary"
                                >
                                    {pickTitle(
                                        section,
                                        activeLanguage,
                                        t('recipes.unnamed'),
                                    )}
                                </Typography>
                            ) : null}
                            <Stack
                                spacing={0.5}
                                sx={{ pl: showSectionTitles ? 2 : 0 }}
                            >
                                {section.ownIngredients.map((ing) => {
                                    const scaled =
                                        ing.amount === null
                                            ? null
                                            : ing.amount * formServings
                                    const displayAmount =
                                        scaled === null
                                            ? null
                                            : format.number(scaled, {
                                                  maximumFractionDigits: 3,
                                              })
                                    const displayUnit =
                                        ing.unit && isKnownUnit(ing.unit)
                                            ? t(
                                                  `recipes.units.labels.${ing.unit}`,
                                              )
                                            : ing.unit
                                    return (
                                        <Typography
                                            key={ing.id}
                                            variant="body2"
                                            component="div"
                                        >
                                            {[
                                                displayAmount,
                                                displayUnit,
                                                ing.name,
                                            ]
                                                .filter(Boolean)
                                                .join(' ')}
                                        </Typography>
                                    )
                                })}
                            </Stack>
                        </Box>
                    ),
                )}

                <Divider />
                <Typography variant="subtitle1">
                    {t('recipes.composed.steps')}
                </Typography>
                {sections.every((s) => s.ownSteps.length === 0) ? (
                    <Typography variant="body2" color="text.secondary">
                        {t('recipes.composed.noSteps')}
                    </Typography>
                ) : null}
                {sections.map((section) =>
                    section.ownSteps.length === 0 ? null : (
                        <Box key={`step-${section.id}`}>
                            {showSectionTitles ? (
                                <Typography
                                    variant="overline"
                                    color="text.secondary"
                                >
                                    {pickTitle(
                                        section,
                                        activeLanguage,
                                        t('recipes.unnamed'),
                                    )}
                                </Typography>
                            ) : null}
                            <Stack
                                spacing={1}
                                sx={{ pl: showSectionTitles ? 2 : 0 }}
                            >
                                {section.ownSteps.map((step, index) => {
                                    const primary =
                                        activeLanguage === 'de'
                                            ? step.textDe
                                            : step.textEn
                                    const fallback =
                                        activeLanguage === 'de'
                                            ? step.textEn
                                            : step.textDe
                                    const text = primary ?? fallback ?? ''
                                    const isFallback =
                                        primary === null && fallback !== null
                                    return (
                                        <Box
                                            key={step.id}
                                            sx={{
                                                display: 'flex',
                                                gap: 1,
                                            }}
                                        >
                                            <Typography
                                                variant="body2"
                                                color="text.secondary"
                                                sx={{ minWidth: 24 }}
                                            >
                                                {index + 1}.
                                            </Typography>
                                            <Typography
                                                variant="body2"
                                                color={
                                                    isFallback
                                                        ? 'warning.main'
                                                        : 'text.primary'
                                                }
                                            >
                                                {text}
                                            </Typography>
                                        </Box>
                                    )
                                })}
                            </Stack>
                        </Box>
                    ),
                )}
            </Stack>
        </Paper>
    )
}
